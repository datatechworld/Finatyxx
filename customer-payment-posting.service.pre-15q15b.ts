import {
  Prisma,
  type InvoiceStatus,
} from "../../generated/prisma/client.js";

import { prisma } from "../../db/prisma.js";

import {
  postJournalInExistingTransaction,
} from "../accounting/general-ledger-posting.service.js";

const PAYMENT_SOURCE_TYPE = "CUSTOMER_PAYMENT";
const PAYMENT_LEDGER_ENTRY_TYPE = "PAYMENT";

const MAX_SERIALIZABLE_ATTEMPTS = 3;

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

type TransactionClient = Prisma.TransactionClient;

export type PostCustomerPaymentInput = {
  tenantId: string;
  paymentId: string;
  postedById: string;
};

export type PostedCustomerPayment = {
  paymentId: string;
  paymentNumber: string;
  status: "POSTED";
  amount: Prisma.Decimal;
  allocatedAmount: Prisma.Decimal;
  unallocatedAmount: Prisma.Decimal;
  customerLedgerEntryId: string;
  journalEntryId: string;
  journalNumber: string;
};

export class CustomerPaymentPostingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CustomerPaymentPostingError";
  }
}

function normalizeRequiredId(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new CustomerPaymentPostingError(
      "INVALID_INPUT",
      `${fieldName} is required.`,
    );
  }

  return normalized;
}

function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  /*
   * Prisma commonly exposes PostgreSQL serialization/deadlock
   * conflicts as P2034.
   */
  return error.code === "P2034";
}

function asDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sumDecimals(
  values: Prisma.Decimal[],
): Prisma.Decimal {
  return values.reduce(
    (total, value) => total.plus(value),
    ZERO,
  );
}

async function resolveAccountsReceivableAccount(
  tx: TransactionClient,
  tenantId: string,
): Promise<string> {
  const mapping =
    await tx.systemAccountMapping.findFirst({
      where: {
        tenantId,
        purpose: "ACCOUNTS_RECEIVABLE",
      },
      select: {
        accountId: true,
        account: {
          select: {
            id: true,
            tenantId: true,
            type: true,
            normalBalance: true,
            status: true,
          },
        },
      },
    });

  if (!mapping || !mapping.account) {
    throw new CustomerPaymentPostingError(
      "ACCOUNTING_CONFIGURATION_MISSING",
      "Accounts Receivable is not configured for this business.",
    );
  }

  if (
    mapping.account.tenantId !== tenantId ||
    mapping.account.type !== "ASSET" ||
    mapping.account.normalBalance !== "DEBIT" ||
    mapping.account.status !== "ACTIVE"
  ) {
    throw new CustomerPaymentPostingError(
      "ACCOUNTING_CONFIGURATION_INVALID",
      "The configured Accounts Receivable account is invalid or inactive.",
    );
  }

  return mapping.accountId;
}

async function lockInvoiceRows(
  tx: TransactionClient,
  tenantId: string,
  invoiceIds: string[],
): Promise<void> {
  if (invoiceIds.length === 0) {
    return;
  }

  /*
   * Prisma does not currently expose SELECT ... FOR UPDATE
   * through findMany. Lock the exact tenant/invoice rows using
   * PostgreSQL before re-reading them through Prisma.
   */
  await tx.$queryRaw`
    SELECT id::text
    FROM public.invoices
    WHERE "tenantId" = ${tenantId}::uuid
      AND id = ANY(
        ${invoiceIds}::uuid[]
      )
    ORDER BY id
    FOR UPDATE
  `;
}

async function postCustomerPaymentInTransaction(
  tx: TransactionClient,
  input: PostCustomerPaymentInput,
): Promise<PostedCustomerPayment> {
  const tenantId = normalizeRequiredId(
    input.tenantId,
    "tenantId",
  );

  const paymentId = normalizeRequiredId(
    input.paymentId,
    "paymentId",
  );

  const postedById = normalizeRequiredId(
    input.postedById,
    "postedById",
  );

  const payment = await tx.payment.findFirst({
    where: {
      id: paymentId,
      tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      branchId: true,
      customerId: true,
      paymentNumber: true,
      paymentDate: true,
      currencyCode: true,
      exchangeRate: true,
      amount: true,
      unallocatedAmount: true,
      financialAccountId: true,
      reference: true,
      status: true,
      postedAt: true,

      customer: {
        select: {
          id: true,
          tenantId: true,
          status: true,
        },
      },

      financialAccount: {
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          currencyCode: true,
          ledgerAccountId: true,
          status: true,

          ledgerAccount: {
            select: {
              id: true,
              tenantId: true,
              type: true,
              normalBalance: true,
              status: true,
            },
          },
        },
      },

      allocations: {
        orderBy: {
          invoiceId: "asc",
        },
        select: {
          id: true,
          tenantId: true,
          invoiceId: true,
          amount: true,
        },
      },
    },
  });

  if (!payment) {
    throw new CustomerPaymentPostingError(
      "PAYMENT_NOT_FOUND",
      "The customer payment does not exist.",
    );
  }

  if (payment.status !== "DRAFT") {
    throw new CustomerPaymentPostingError(
      "PAYMENT_NOT_DRAFT",
      "Only a DRAFT customer payment can be posted.",
    );
  }

  if (payment.postedAt !== null) {
    throw new CustomerPaymentPostingError(
      "PAYMENT_ALREADY_POSTED",
      "The customer payment already has a posting timestamp.",
    );
  }

  if (!payment.amount.greaterThan(ZERO)) {
    throw new CustomerPaymentPostingError(
      "INVALID_PAYMENT_AMOUNT",
      "The customer payment amount must be greater than zero.",
    );
  }

  /*
   * 15Q base-currency foundation.
   *
   * Foreign-currency receipt accounting is intentionally not
   * frozen yet.
   */
  if (
    payment.currencyCode !== "GHS" ||
    !payment.exchangeRate.equals(ONE)
  ) {
    throw new CustomerPaymentPostingError(
      "FOREIGN_CURRENCY_NOT_SUPPORTED",
      "15Q customer payment posting currently supports GHS payments with exchange rate 1 only.",
    );
  }

  if (
    !payment.customer ||
    payment.customer.tenantId !== tenantId ||
    payment.customer.status !== "ACTIVE"
  ) {
    throw new CustomerPaymentPostingError(
      "CUSTOMER_INVALID",
      "The customer is missing or inactive.",
    );
  }

  if (
    !payment.financialAccountId ||
    !payment.financialAccount
  ) {
    throw new CustomerPaymentPostingError(
      "FINANCIAL_ACCOUNT_REQUIRED",
      "A financial account is required before posting a customer payment.",
    );
  }

  const financialAccount = payment.financialAccount;

  if (
    financialAccount.tenantId !== tenantId ||
    financialAccount.status !== "ACTIVE"
  ) {
    throw new CustomerPaymentPostingError(
      "FINANCIAL_ACCOUNT_INVALID",
      "The selected financial account is invalid or inactive.",
    );
  }

  if (
    financialAccount.branchId !== null &&
    financialAccount.branchId !== payment.branchId
  ) {
    throw new CustomerPaymentPostingError(
      "FINANCIAL_ACCOUNT_BRANCH_MISMATCH",
      "The selected financial account is not available to the payment branch.",
    );
  }

  if (
    financialAccount.currencyCode !==
    payment.currencyCode
  ) {
    throw new CustomerPaymentPostingError(
      "FINANCIAL_ACCOUNT_CURRENCY_MISMATCH",
      "The payment currency does not match the financial account currency.",
    );
  }

  if (
    !financialAccount.ledgerAccountId ||
    !financialAccount.ledgerAccount
  ) {
    throw new CustomerPaymentPostingError(
      "FINANCIAL_ACCOUNT_GL_MISSING",
      "The selected financial account is not linked to a ledger account.",
    );
  }

  const bankLedgerAccount =
    financialAccount.ledgerAccount;

  if (
    bankLedgerAccount.tenantId !== tenantId ||
    bankLedgerAccount.type !== "ASSET" ||
    bankLedgerAccount.normalBalance !== "DEBIT" ||
    bankLedgerAccount.status !== "ACTIVE"
  ) {
    throw new CustomerPaymentPostingError(
      "FINANCIAL_ACCOUNT_GL_INVALID",
      "The financial account ledger account is invalid or inactive.",
    );
  }

  if (payment.allocations.length === 0) {
    throw new CustomerPaymentPostingError(
      "PAYMENT_ALLOCATION_REQUIRED",
      "At least one invoice allocation is required before posting the payment.",
    );
  }

  for (const allocation of payment.allocations) {
    if (allocation.tenantId !== tenantId) {
      throw new CustomerPaymentPostingError(
        "ALLOCATION_TENANT_MISMATCH",
        "A payment allocation belongs to another business.",
      );
    }

    if (!allocation.amount.greaterThan(ZERO)) {
      throw new CustomerPaymentPostingError(
        "INVALID_ALLOCATION_AMOUNT",
        "Payment allocation amounts must be greater than zero.",
      );
    }
  }

  const allocatedAmount = sumDecimals(
    payment.allocations.map(
      (allocation) => allocation.amount,
    ),
  );

  if (allocatedAmount.greaterThan(payment.amount)) {
    throw new CustomerPaymentPostingError(
      "PAYMENT_OVERALLOCATED",
      "Payment allocations exceed the payment amount.",
    );
  }

  const expectedUnallocated =
    payment.amount.minus(allocatedAmount);

  if (
    !payment.unallocatedAmount.equals(
      expectedUnallocated,
    )
  ) {
    throw new CustomerPaymentPostingError(
      "PAYMENT_ALLOCATION_TOTAL_MISMATCH",
      "The payment unallocated amount does not agree with its allocations.",
    );
  }

  const invoiceIds = payment.allocations.map(
    (allocation) => allocation.invoiceId,
  );

  await lockInvoiceRows(
    tx,
    tenantId,
    invoiceIds,
  );

  const invoices = await tx.invoice.findMany({
    where: {
      tenantId,
      id: {
        in: invoiceIds,
      },
    },
    select: {
      id: true,
      tenantId: true,
      branchId: true,
      customerId: true,
      currencyCode: true,
      exchangeRate: true,
      total: true,
      amountPaid: true,
      balanceDue: true,
      status: true,
    },
  });

  if (invoices.length !== invoiceIds.length) {
    throw new CustomerPaymentPostingError(
      "INVOICE_NOT_FOUND",
      "One or more allocated invoices do not exist.",
    );
  }

  const invoicesById = new Map(
    invoices.map((invoice) => [
      invoice.id,
      invoice,
    ]),
  );

  for (const allocation of payment.allocations) {
    const invoice =
      invoicesById.get(allocation.invoiceId);

    if (!invoice) {
      throw new CustomerPaymentPostingError(
        "INVOICE_NOT_FOUND",
        "An allocated invoice does not exist.",
      );
    }

    if (
      invoice.tenantId !== tenantId ||
      invoice.customerId !== payment.customerId
    ) {
      throw new CustomerPaymentPostingError(
        "INVOICE_CUSTOMER_MISMATCH",
        "An allocated invoice does not belong to the payment customer.",
      );
    }

    if (invoice.branchId !== payment.branchId) {
      throw new CustomerPaymentPostingError(
        "INVOICE_BRANCH_MISMATCH",
        "An allocated invoice belongs to a different branch.",
      );
    }

    if (
      invoice.currencyCode !==
        payment.currencyCode ||
      !invoice.exchangeRate.equals(ONE)
    ) {
      throw new CustomerPaymentPostingError(
        "INVOICE_CURRENCY_MISMATCH",
        "Allocated invoices must use the same GHS base-currency contract as the payment.",
      );
    }

    const payableStatuses: InvoiceStatus[] = [
      "POSTED",
      "SENT",
      "PARTIALLY_PAID",
      "OVERDUE",
    ];

    if (!payableStatuses.includes(invoice.status)) {
      throw new CustomerPaymentPostingError(
        "INVOICE_NOT_PAYABLE",
        `Invoice ${invoice.id} cannot receive a payment while in status ${invoice.status}.`,
      );
    }

    if (!invoice.balanceDue.greaterThan(ZERO)) {
      throw new CustomerPaymentPostingError(
        "INVOICE_ALREADY_SETTLED",
        `Invoice ${invoice.id} has no outstanding balance.`,
      );
    }

    if (
      allocation.amount.greaterThan(
        invoice.balanceDue,
      )
    ) {
      throw new CustomerPaymentPostingError(
        "INVOICE_OVERPAYMENT",
        `The allocation exceeds the outstanding balance of invoice ${invoice.id}.`,
      );
    }
  }

  const accountsReceivableAccountId =
    await resolveAccountsReceivableAccount(
      tx,
      tenantId,
    );

  /*
   * Idempotency defense before any posting writes.
   *
   * The database unique indexes remain the final defense
   * against concurrent duplicate source posting.
   */
  const existingLedgerEntry =
    await tx.customerLedgerEntry.findFirst({
      where: {
        tenantId,
        referenceType: PAYMENT_SOURCE_TYPE,
        referenceId: payment.id,
      },
      select: {
        id: true,
      },
    });

  if (existingLedgerEntry) {
    throw new CustomerPaymentPostingError(
      "PAYMENT_ALREADY_POSTED",
      "A customer-ledger entry already exists for this payment.",
    );
  }

  const existingJournal =
    await tx.journalEntry.findFirst({
      where: {
        tenantId,
        sourceType: PAYMENT_SOURCE_TYPE,
        sourceId: payment.id,
      },
      select: {
        id: true,
      },
    });

  if (existingJournal) {
    throw new CustomerPaymentPostingError(
      "PAYMENT_ALREADY_POSTED",
      "A general-ledger journal already exists for this payment.",
    );
  }

  /*
   * Customer subledger:
   *
   * Invoice   -> debit customer A/R
   * Payment   -> credit customer A/R
   */
  const customerLedgerEntry =
    await tx.customerLedgerEntry.create({
      data: {
        tenantId,
        customerId: payment.customerId,
        branchId: payment.branchId,
        transactionDate: payment.paymentDate,
        entryType: PAYMENT_LEDGER_ENTRY_TYPE,
        referenceType: PAYMENT_SOURCE_TYPE,
        referenceId: payment.id,
        debit: ZERO,
        credit: payment.amount,
        currencyCode: payment.currencyCode,
      },
      select: {
        id: true,
      },
    });

  /*
   * General ledger:
   *
   * DR specific financial-account ledger
   * CR Accounts Receivable
   *
   * 15Q currently supports only exchangeRate = 1, so
   * document amount and base amount are identical.
   */
  const journal =
    await postJournalInExistingTransaction(
      tx,
      {
        tenantId,
        branchId: payment.branchId,
        journalDate: payment.paymentDate,
        description:
          `Customer receipt ${payment.paymentNumber}`,
        sourceType: PAYMENT_SOURCE_TYPE,
        sourceId: payment.id,
        currencyCode: payment.currencyCode,
        exchangeRate: payment.exchangeRate,
        createdById: postedById,
        lines: [
          {
            accountId:
              financialAccount.ledgerAccountId,
            debit: payment.amount,
            credit: ZERO,
            customerId: payment.customerId,
          },
          {
            accountId:
              accountsReceivableAccountId,
            debit: ZERO,
            credit: payment.amount,
            customerId: payment.customerId,
          },
        ],
      },
      "SYSTEM",
    );

  /*
   * Apply each allocation to its invoice after all validation
   * and after rows have been locked.
   */
  for (const allocation of payment.allocations) {
    const invoice =
      invoicesById.get(allocation.invoiceId)!;

    const newAmountPaid =
      invoice.amountPaid.plus(allocation.amount);

    const newBalanceDue =
      invoice.balanceDue.minus(allocation.amount);

    if (
      newAmountPaid.greaterThan(invoice.total) ||
      newBalanceDue.lessThan(ZERO)
    ) {
      throw new CustomerPaymentPostingError(
        "INVOICE_BALANCE_INVALID",
        `Payment would create an invalid balance for invoice ${invoice.id}.`,
      );
    }

    const isPaid = newBalanceDue.equals(ZERO);

    await tx.invoice.update({
      where: {
        tenantId_id: {
          tenantId,
          id: invoice.id,
        },
      },
      data: {
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        status: isPaid
          ? "PAID"
          : "PARTIALLY_PAID",
        paidAt: isPaid ? new Date() : null,
      },
    });
  }

  const postedAt = new Date();

  const postedPayment = await tx.payment.update({
    where: {
      tenantId_id: {
        tenantId,
        id: payment.id,
      },
    },
    data: {
      status: "POSTED",
      postedAt,
    },
    select: {
      id: true,
      paymentNumber: true,
      status: true,
      amount: true,
      unallocatedAmount: true,
    },
  });

  if (postedPayment.status !== "POSTED") {
    throw new CustomerPaymentPostingError(
      "PAYMENT_POSTING_FAILED",
      "The payment did not reach POSTED status.",
    );
  }

  return {
    paymentId: postedPayment.id,
    paymentNumber: postedPayment.paymentNumber,
    status: "POSTED",
    amount: postedPayment.amount,
    allocatedAmount,
    unallocatedAmount:
      postedPayment.unallocatedAmount,
    customerLedgerEntryId:
      customerLedgerEntry.id,
    journalEntryId: journal.id,
    journalNumber: journal.journalNumber,
  };
}

export async function postCustomerPayment(
  input: PostCustomerPaymentInput,
): Promise<PostedCustomerPayment> {
  let lastSerializationError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_SERIALIZABLE_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) =>
          postCustomerPaymentInTransaction(
            tx,
            input,
          ),
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel
              .Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    } catch (error) {
      if (!isSerializationConflict(error)) {
        throw error;
      }

      lastSerializationError = error;
    }
  }

  throw new CustomerPaymentPostingError(
    "TRANSACTION_WRITE_CONFLICT",
    lastSerializationError
      ? "The customer payment could not be posted because of concurrent activity. Please retry."
      : "The customer payment could not be posted.",
  );
}