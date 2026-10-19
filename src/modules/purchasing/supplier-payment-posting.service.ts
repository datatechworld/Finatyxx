import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { postJournalInExistingTransaction } from "../accounting/general-ledger-posting.service.js";

const SOURCE_TYPE = "SUPPLIER_PAYMENT";
const LEDGER_ENTRY_TYPE = "PAYMENT";
const LEDGER_REFERENCE_TYPE = "SUPPLIER_PAYMENT";

const MAX_SERIALIZABLE_ATTEMPTS = 3;

const ZERO = new Prisma.Decimal("0");
const ONE = new Prisma.Decimal("1");

type TransactionClient = Prisma.TransactionClient;

export interface PostSupplierPaymentInput {
  tenantId: string;
  supplierPaymentId: string;
  postedById: string;
}

export class SupplierPaymentPostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierPaymentPostingError";
  }
}

function fail(message: string): never {
  throw new SupplierPaymentPostingError(message);
}

function decimalEquals(
  left: Prisma.Decimal,
  right: Prisma.Decimal,
): boolean {
  return left
    .toDecimalPlaces(4)
    .equals(right.toDecimalPlaces(4));
}

function isRetryableTransactionError(
  error: unknown,
): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
  ) {
    return (
      error.code === "P2034" ||
      error.code === "P2028"
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const code = String(
      (error as { code?: unknown }).code ?? "",
    );

    return (
      code === "40001" ||
      code === "40P01"
    );
  }

  return false;
}

async function lockSupplierPayment(
  tx: TransactionClient,
  tenantId: string,
  supplierPaymentId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`
    SELECT id::text AS "id"
    FROM supplier_payments
    WHERE "tenantId" = ${tenantId}::uuid
      AND id = ${supplierPaymentId}::uuid
    FOR UPDATE
  `;

  if (rows.length !== 1) {
    fail("Supplier Payment not found.");
  }
}

async function lockSupplierBills(
  tx: TransactionClient,
  tenantId: string,
  billIds: string[],
): Promise<void> {
  /*
   * Lock in deterministic order to reduce deadlock risk.
   * Prisma parameterizes the UUID values through join().
   */
  const orderedIds = [...billIds].sort();

  if (orderedIds.length === 0) {
    fail(
      "Supplier Payment must contain at least one allocation.",
    );
  }

  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`
    SELECT id::text AS "id"
    FROM supplier_bills
    WHERE "tenantId" = ${tenantId}::uuid
      AND id IN (
        ${Prisma.join(
          orderedIds.map(
            (id) => Prisma.sql`${id}::uuid`,
          ),
        )}
      )
    ORDER BY id
    FOR UPDATE
  `;

  if (rows.length !== orderedIds.length) {
    fail(
      "One or more allocated Supplier Bills do not exist.",
    );
  }
}

async function resolveAccountsPayable(
  tx: TransactionClient,
  tenantId: string,
) {
  const mapping =
    await tx.systemAccountMapping.findFirst({
      where: {
        tenantId,
        purpose: "ACCOUNTS_PAYABLE",
      },
      include: {
        account: true,
      },
    });

  if (!mapping) {
    fail(
      "ACCOUNTS_PAYABLE system account mapping is missing.",
    );
  }

  if (mapping.account.status !== "ACTIVE") {
    fail(
      "Accounts Payable ledger account is not ACTIVE.",
    );
  }

  return mapping.account;
}

async function postSupplierPaymentInTransaction(
  tx: TransactionClient,
  input: PostSupplierPaymentInput,
) {
  const {
    tenantId,
    supplierPaymentId,
    postedById,
  } = input;

  if (!tenantId) {
    fail("tenantId is required.");
  }

  if (!supplierPaymentId) {
    fail("supplierPaymentId is required.");
  }

  if (!postedById) {
    fail("postedById is required.");
  }

  await lockSupplierPayment(
    tx,
    tenantId,
    supplierPaymentId,
  );

  const payment =
    await tx.supplierPayment.findUnique({
      where: {
        tenantId_id: {
          tenantId,
          id: supplierPaymentId,
        },
      },
      include: {
        supplier: true,
        allocations: true,
      },
    });

  if (!payment) {
    fail("Supplier Payment not found.");
  }

  if (payment.status !== "DRAFT") {
    fail(
      `Supplier Payment must be DRAFT. Current status: ${payment.status}.`,
    );
  }

  if (payment.postedAt !== null) {
    fail(
      "Supplier Payment already has a postedAt timestamp.",
    );
  }

  if (payment.amount.lessThanOrEqualTo(ZERO)) {
    fail(
      "Supplier Payment amount must be greater than zero.",
    );
  }

  if (
    payment.unallocatedAmount.lessThan(ZERO) ||
    payment.unallocatedAmount.greaterThan(
      payment.amount,
    )
  ) {
    fail(
      "Supplier Payment unallocated amount is invalid.",
    );
  }

  /*
   * 48-hour MVP rule:
   * Supplier Payments must be fully allocated before posting.
   */
  if (!decimalEquals(
    payment.unallocatedAmount,
    ZERO,
  )) {
    fail(
      "Supplier Payment must be fully allocated before posting.",
    );
  }

  if (payment.currencyCode !== "GHS") {
    fail(
      "MVP Supplier Payment posting supports GHS only.",
    );
  }

  if (!payment.exchangeRate.equals(ONE)) {
    fail(
      "MVP Supplier Payment exchange rate must equal 1.",
    );
  }

  if (payment.supplier.status !== "ACTIVE") {
    fail("Supplier is not ACTIVE.");
  }

  const tenant = await tx.tenant.findUnique({
    where: {
      id: tenantId,
    },
  });

  if (!tenant) {
    fail("Tenant not found.");
  }

  if (
    tenant.status !== "TRIAL" &&
    tenant.status !== "ACTIVE"
  ) {
    fail(
      `Tenant is not financially active. Current status: ${tenant.status}.`,
    );
  }

  const branch = await tx.branch.findFirst({
    where: {
      tenantId,
      id: payment.branchId,
    },
  });

  if (!branch) {
    fail("Supplier Payment branch not found.");
  }

  if (branch.status !== "ACTIVE") {
    fail("Supplier Payment branch is not ACTIVE.");
  }

  /*
   * SupplierPayment.financialAccountId currently has no
   * Prisma relation/FK. Validate it explicitly.
   */
  const financialAccount =
    await tx.financialAccount.findUnique({
      where: {
        tenantId_id: {
          tenantId,
          id: payment.financialAccountId,
        },
      },
      include: {
        ledgerAccount: true,
      },
    });

  if (!financialAccount) {
    fail("Financial Account not found.");
  }

  if (financialAccount.status !== "ACTIVE") {
    fail("Financial Account is not ACTIVE.");
  }

  if (
    financialAccount.branchId !== null &&
    financialAccount.branchId !== payment.branchId
  ) {
    fail(
      "Financial Account is not available to this branch.",
    );
  }

  if (
    financialAccount.currencyCode !==
    payment.currencyCode
  ) {
    fail(
      "Financial Account currency does not match Supplier Payment currency.",
    );
  }

  if (
    !financialAccount.ledgerAccountId ||
    !financialAccount.ledgerAccount
  ) {
    fail(
      "Financial Account has no linked ledger account.",
    );
  }

  if (
    financialAccount.ledgerAccount.status !==
    "ACTIVE"
  ) {
    fail(
      "Financial Account ledger account is not ACTIVE.",
    );
  }

  const allocations = payment.allocations;

  if (allocations.length === 0) {
    fail(
      "Supplier Payment must contain at least one allocation.",
    );
  }

  const uniqueBillIds = new Set(
    allocations.map(
      (allocation) => allocation.supplierBillId,
    ),
  );

  if (uniqueBillIds.size !== allocations.length) {
    fail(
      "Supplier Payment contains duplicate bill allocations.",
    );
  }

  let allocationTotal = ZERO;

  for (const allocation of allocations) {
    if (allocation.amount.lessThanOrEqualTo(ZERO)) {
      fail(
        "Supplier Payment allocation amount must be greater than zero.",
      );
    }

    allocationTotal =
      allocationTotal.plus(allocation.amount);
  }

  if (!decimalEquals(
    allocationTotal,
    payment.amount,
  )) {
    fail(
      "Supplier Payment allocations must equal the payment amount.",
    );
  }

  const billIds = [...uniqueBillIds];

  await lockSupplierBills(
    tx,
    tenantId,
    billIds,
  );

  const bills = await tx.supplierBill.findMany({
    where: {
      tenantId,
      id: {
        in: billIds,
      },
    },
  });

  if (bills.length !== billIds.length) {
    fail(
      "One or more allocated Supplier Bills could not be loaded.",
    );
  }

  const billsById = new Map(
    bills.map((bill) => [bill.id, bill]),
  );

  for (const allocation of allocations) {
    const bill =
      billsById.get(allocation.supplierBillId);

    if (!bill) {
      fail("Allocated Supplier Bill not found.");
    }

    if (bill.supplierId !== payment.supplierId) {
      fail(
        "All allocated Supplier Bills must belong to the payment supplier.",
      );
    }

    if (bill.branchId !== payment.branchId) {
      fail(
        "All allocated Supplier Bills must belong to the payment branch.",
      );
    }

    if (
      bill.currencyCode !== payment.currencyCode
    ) {
      fail(
        "Supplier Bill currency does not match Supplier Payment currency.",
      );
    }

    if (!bill.exchangeRate.equals(ONE)) {
      fail(
        "MVP allocated Supplier Bill exchange rate must equal 1.",
      );
    }

    if (
      bill.status !== "POSTED" &&
      bill.status !== "PARTIALLY_PAID"
    ) {
      fail(
        `Supplier Bill ${bill.billNumber} is not payable. Current status: ${bill.status}.`,
      );
    }

    if (bill.postedAt === null) {
      fail(
        `Supplier Bill ${bill.billNumber} has not been posted.`,
      );
    }

    if (bill.balanceDue.lessThanOrEqualTo(ZERO)) {
      fail(
        `Supplier Bill ${bill.billNumber} has no outstanding balance.`,
      );
    }

    if (
      allocation.amount.greaterThan(
        bill.balanceDue,
      )
    ) {
      fail(
        `Allocation exceeds the outstanding balance of Supplier Bill ${bill.billNumber}.`,
      );
    }
  }

  /*
   * Source idempotency.
   * A posted Supplier Payment may produce only one supplier
   * subledger source entry and one GL source journal.
   */
  const existingLedger =
    await tx.supplierLedgerEntry.findFirst({
      where: {
        tenantId,
        referenceType:
          LEDGER_REFERENCE_TYPE,
        referenceId: supplierPaymentId,
      },
    });

  if (existingLedger) {
    fail(
      "Supplier Payment already has a Supplier Ledger posting.",
    );
  }

  const existingJournal =
    await tx.journalEntry.findFirst({
      where: {
        tenantId,
        sourceType: SOURCE_TYPE,
        sourceId: supplierPaymentId,
      },
    });

  if (existingJournal) {
    fail(
      "Supplier Payment already has a General Ledger posting.",
    );
  }

  const accountsPayable =
    await resolveAccountsPayable(
      tx,
      tenantId,
    );

  /*
   * Supplier subledger:
   *
   * Supplier Bill    -> CR AP
   * Supplier Payment -> DR AP
   */
  const supplierLedgerEntry =
    await tx.supplierLedgerEntry.create({
      data: {
        tenantId,
        supplierId: payment.supplierId,
        branchId: payment.branchId,
        transactionDate: payment.paymentDate,
        entryType: LEDGER_ENTRY_TYPE,
        referenceType:
          LEDGER_REFERENCE_TYPE,
        referenceId: payment.id,
        debit: payment.amount,
        credit: ZERO,
        currencyCode: payment.currencyCode,
      },
    });

  /*
   * General Ledger:
   *
   * DR Accounts Payable
   * CR Bank / Cash / MoMo financial account ledger
   *
   * SYSTEM origin is required because Accounts Payable is a
   * protected control account.
   */
  const journal =
    await postJournalInExistingTransaction(
      tx,
      {
        tenantId,
        branchId: payment.branchId,
        journalDate: payment.paymentDate,
        description:
          `Supplier payment ${payment.paymentNumber}`,
        sourceType: SOURCE_TYPE,
        sourceId: payment.id,
        currencyCode: payment.currencyCode,
        exchangeRate: payment.exchangeRate,
        createdById: postedById,
        lines: [
          {
            accountId: accountsPayable.id,
            description:
              `Supplier payment ${payment.paymentNumber}`,
            debit: payment.amount,
            credit: ZERO,
            supplierId: payment.supplierId,
          },
          {
            accountId:
              financialAccount.ledgerAccountId,
            description:
              `Supplier payment ${payment.paymentNumber}`,
            debit: ZERO,
            credit: payment.amount,
          },
        ],
      },
      "SYSTEM",
    );

  /*
   * Apply allocations only after all validations and both
   * accounting postings have succeeded inside this same
   * database transaction.
   */
  for (const allocation of allocations) {
    const bill =
      billsById.get(allocation.supplierBillId);

    if (!bill) {
      fail(
        "Allocated Supplier Bill disappeared during posting.",
      );
    }

    const newAmountPaid =
      bill.amountPaid.plus(allocation.amount);

    const newBalanceDue =
      bill.balanceDue.minus(allocation.amount);

    if (newBalanceDue.lessThan(ZERO)) {
      fail(
        `Supplier Bill ${bill.billNumber} would become overpaid.`,
      );
    }

    const newStatus =
      newBalanceDue.equals(ZERO)
        ? "PAID"
        : "PARTIALLY_PAID";

    await tx.supplierBill.update({
      where: {
        tenantId_id: {
          tenantId,
          id: bill.id,
        },
      },
      data: {
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        status: newStatus,
      },
    });
  }

  const postedPayment =
    await tx.supplierPayment.update({
      where: {
        tenantId_id: {
          tenantId,
          id: payment.id,
        },
      },
      data: {
        status: "POSTED",
        postedAt: new Date(),
      },
    });

  return {
    supplierPayment: postedPayment,
    supplierLedgerEntry,
    journal,
  };
}

export async function postSupplierPayment(
  input: PostSupplierPaymentInput,
) {
  let attempt = 0;

  while (attempt < MAX_SERIALIZABLE_ATTEMPTS) {
    attempt += 1;

    try {
      return await prisma.$transaction(
        async (tx) =>
          postSupplierPaymentInTransaction(
            tx,
            input,
          ),
        {
          maxWait: 5_000,
          timeout: 15_000,
          isolationLevel:
            Prisma.TransactionIsolationLevel
              .Serializable,
        },
      );
    } catch (error) {
      if (
        attempt <
          MAX_SERIALIZABLE_ATTEMPTS &&
        isRetryableTransactionError(error)
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new SupplierPaymentPostingError(
    "Supplier Payment posting exhausted Serializable transaction retries.",
  );
}