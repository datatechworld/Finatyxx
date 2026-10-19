import {
  Prisma,
} from "../../generated/prisma/client.js";

import { prisma } from "../../db/prisma.js";

import {
  postJournalInExistingTransaction,
} from "../accounting/general-ledger-posting.service.js";

type PostCreditNoteInput = {
  tenantId: string;
  creditNoteId: string;
  postedById: string;
};

type PostCreditNoteResult = {
  creditNoteId: string;
  creditNoteNumber: string;
  journalEntryId: string;
  customerLedgerEntryId: string;
  status: "POSTED";
};

type DecimalValue =
  ConstructorParameters<typeof Prisma.Decimal>[0];

const SOURCE_TYPE = "SALES_CREDIT_NOTE";
const LEDGER_ENTRY_TYPE = "CREDIT_NOTE";
const LEDGER_REFERENCE_TYPE = "SALES_CREDIT_NOTE";

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

const TRANSACTION_OPTIONS = {
  isolationLevel:
    Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

function fail(code: string): never {
  throw new Error(code);
}

function money(value: DecimalValue): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(
    4,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

function sameMoney(
  left: DecimalValue,
  right: DecimalValue,
): boolean {
  return money(left).equals(money(right));
}

function isRetryableTransactionError(
  error: unknown,
): boolean {
  if (
    error instanceof
    Prisma.PrismaClientKnownRequestError
  ) {
    return error.code === "P2034";
  }

  return false;
}

async function resolveSystemAccount(
  tx: Prisma.TransactionClient,
  tenantId: string,
  purpose:
    | "ACCOUNTS_RECEIVABLE"
    | "SALES_RETURNS"
    | "OUTPUT_TAX",
) {
  const mapping =
    await tx.systemAccountMapping.findFirst({
      where: {
        tenantId,
        purpose,
      },
      include: {
        account: true,
      },
    });

  if (!mapping) {
    fail(
      `SYSTEM_ACCOUNT_MAPPING_NOT_FOUND:${purpose}`,
    );
  }

  if (mapping.account.status !== "ACTIVE") {
    fail(
      `SYSTEM_ACCOUNT_NOT_ACTIVE:${purpose}`,
    );
  }

  return mapping.account;
}

async function postCreditNoteTransaction(
  tx: Prisma.TransactionClient,
  input: PostCreditNoteInput,
): Promise<PostCreditNoteResult> {
  /*
   * Serialize competing posting attempts against the
   * same Credit Note before creating financial records.
   */
  await tx.$queryRaw`
    SELECT id::text
    FROM public.credit_notes
    WHERE "tenantId" = ${input.tenantId}::uuid
      AND id = ${input.creditNoteId}::uuid
    FOR UPDATE
  `;

  const creditNote =
    await tx.creditNote.findFirst({
      where: {
        tenantId: input.tenantId,
        id: input.creditNoteId,
      },
      include: {
        customer: true,
        branch: true,
        invoice: true,
        items: {
          include: {
            invoiceItem: true,
          },
        },
      },
    });

  if (!creditNote) {
    fail("CREDIT_NOTE_NOT_FOUND");
  }

  if (creditNote.status !== "DRAFT") {
    fail("CREDIT_NOTE_NOT_DRAFT");
  }

  if (creditNote.postedAt !== null) {
    fail("CREDIT_NOTE_ALREADY_POSTED");
  }

  if (creditNote.branch.status !== "ACTIVE") {
    fail("CREDIT_NOTE_BRANCH_NOT_ACTIVE");
  }

  if (creditNote.customer.status !== "ACTIVE") {
    fail("CREDIT_NOTE_CUSTOMER_NOT_ACTIVE");
  }

  if (creditNote.items.length === 0) {
    fail("CREDIT_NOTE_HAS_NO_ITEMS");
  }

  if (
    creditNote.subtotal.lessThan(ZERO) ||
    creditNote.taxTotal.lessThan(ZERO) ||
    creditNote.total.lessThanOrEqualTo(ZERO)
  ) {
    fail("CREDIT_NOTE_TOTALS_INVALID");
  }

  if (
    !sameMoney(
      creditNote.subtotal.plus(
        creditNote.taxTotal,
      ),
      creditNote.total,
    )
  ) {
    fail("CREDIT_NOTE_TOTAL_MISMATCH");
  }

  /*
   * MVP currency boundary:
   * base/functional currency only, exchange rate 1.
   */
  const tenant = await tx.tenant.findUnique({
    where: {
      id: input.tenantId,
    },
    select: {
      id: true,
      baseCurrencyCode: true,
    },
  });

  if (!tenant) {
    fail("TENANT_NOT_FOUND");
  }

  if (
    creditNote.currencyCode !==
      tenant.baseCurrencyCode ||
    !creditNote.exchangeRate.equals(ONE)
  ) {
    fail(
      "CREDIT_NOTE_FOREIGN_CURRENCY_NOT_SUPPORTED",
    );
  }

  /*
   * MVP SAFETY GATE:
   *
   * Invoice-linked Credit Notes require cumulative
   * invoice-level credit allocation and over-credit
   * protection. That accounting workflow is deliberately
   * deferred from the MVP.
   *
   * Standalone Credit Notes remain supported.
   */
  if (creditNote.invoiceId !== null) {
    fail(
      "LINKED_CREDIT_NOTES_NOT_SUPPORTED_IN_MVP",
    );
  }
  let calculatedSubtotal =
    new Prisma.Decimal(0);

  let calculatedTax =
    new Prisma.Decimal(0);

  let calculatedTotal =
    new Prisma.Decimal(0);

  for (const item of creditNote.items) {
    if (item.quantity.lessThanOrEqualTo(ZERO)) {
      fail(
        "CREDIT_NOTE_ITEM_QUANTITY_INVALID",
      );
    }

    if (item.unitPrice.lessThan(ZERO)) {
      fail(
        "CREDIT_NOTE_ITEM_UNIT_PRICE_INVALID",
      );
    }

    if (item.taxRate.lessThan(ZERO)) {
      fail(
        "CREDIT_NOTE_ITEM_TAX_RATE_INVALID",
      );
    }

    if (item.taxAmount.lessThan(ZERO)) {
      fail(
        "CREDIT_NOTE_ITEM_TAX_AMOUNT_INVALID",
      );
    }

    if (item.lineTotal.lessThanOrEqualTo(ZERO)) {
      fail(
        "CREDIT_NOTE_ITEM_TOTAL_INVALID",
      );
    }

    /*
     * CreditNoteItem has no lineSubtotal field.
     * Therefore net line value is:
     *
     * lineTotal - taxAmount
     */
    const lineNet = money(
      item.lineTotal.minus(
        item.taxAmount,
      ),
    );

    if (lineNet.lessThan(ZERO)) {
      fail("CREDIT_NOTE_ITEM_NET_INVALID");
    }

    calculatedSubtotal =
      calculatedSubtotal.plus(lineNet);

    calculatedTax =
      calculatedTax.plus(
        item.taxAmount,
      );

    calculatedTotal =
      calculatedTotal.plus(
        item.lineTotal,
      );

    if (item.invoiceItemId !== null) {
      if (creditNote.invoiceId === null) {
        fail(
          "CREDIT_NOTE_ITEM_REQUIRES_INVOICE",
        );
      }

      if (!item.invoiceItem) {
        fail(
          "CREDIT_NOTE_INVOICE_ITEM_NOT_FOUND",
        );
      }

      if (
        item.invoiceItem.invoiceId !==
        creditNote.invoiceId
      ) {
        fail(
          "CREDIT_NOTE_INVOICE_ITEM_MISMATCH",
        );
      }

      if (
        item.productId !== null &&
        item.invoiceItem.productId !==
          item.productId
      ) {
        fail(
          "CREDIT_NOTE_ITEM_PRODUCT_MISMATCH",
        );
      }
    }
  }

  if (
    !sameMoney(
      calculatedSubtotal,
      creditNote.subtotal,
    )
  ) {
    fail("CREDIT_NOTE_SUBTOTAL_MISMATCH");
  }

  if (
    !sameMoney(
      calculatedTax,
      creditNote.taxTotal,
    )
  ) {
    fail("CREDIT_NOTE_TAX_TOTAL_MISMATCH");
  }

  if (
    !sameMoney(
      calculatedTotal,
      creditNote.total,
    )
  ) {
    fail(
      "CREDIT_NOTE_LINE_TOTAL_MISMATCH",
    );
  }

  /*
   * Application-level idempotency checks.
   *
   * Database unique indexes remain the final
   * concurrency-safe defense.
   */
  const existingLedger =
    await tx.customerLedgerEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        referenceType:
          LEDGER_REFERENCE_TYPE,
        referenceId: creditNote.id,
      },
      select: {
        id: true,
      },
    });

  if (existingLedger) {
    fail(
      "CREDIT_NOTE_LEDGER_ALREADY_EXISTS",
    );
  }

  const existingJournal =
    await tx.journalEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        sourceType: SOURCE_TYPE,
        sourceId: creditNote.id,
      },
      select: {
        id: true,
      },
    });

  if (existingJournal) {
    fail(
      "CREDIT_NOTE_JOURNAL_ALREADY_EXISTS",
    );
  }

  const [
    accountsReceivable,
    salesReturns,
    outputTax,
  ] = await Promise.all([
    resolveSystemAccount(
      tx,
      input.tenantId,
      "ACCOUNTS_RECEIVABLE",
    ),
    resolveSystemAccount(
      tx,
      input.tenantId,
      "SALES_RETURNS",
    ),
    resolveSystemAccount(
      tx,
      input.tenantId,
      "OUTPUT_TAX",
    ),
  ]);

  if (
    accountsReceivable.type !== "ASSET" ||
    accountsReceivable.normalBalance !== "DEBIT"
  ) {
    fail(
      "ACCOUNTS_RECEIVABLE_ACCOUNT_INVALID",
    );
  }

  if (
    salesReturns.type !== "REVENUE" ||
    salesReturns.normalBalance !== "DEBIT"
  ) {
    fail(
      "SALES_RETURNS_ACCOUNT_INVALID",
    );
  }

  if (
    outputTax.type !== "LIABILITY" ||
    outputTax.normalBalance !== "CREDIT"
  ) {
    fail("OUTPUT_TAX_ACCOUNT_INVALID");
  }

  /*
   * Customer subledger:
   *
   * A Credit Note reduces the customer's receivable,
   * therefore it is a credit in the customer ledger.
   */
  const customerLedger =
    await tx.customerLedgerEntry.create({
      data: {
        tenantId: input.tenantId,
        customerId: creditNote.customerId,
        branchId: creditNote.branchId,
        transactionDate:
          creditNote.creditNoteDate,
        entryType: LEDGER_ENTRY_TYPE,
        referenceType:
          LEDGER_REFERENCE_TYPE,
        referenceId: creditNote.id,
        debit: ZERO,
        credit: money(
          creditNote.total,
        ),
        currencyCode:
          creditNote.currencyCode,
      },
      select: {
        id: true,
      },
    });

  /*
   * Accounting:
   *
   * DR Sales Returns
   * DR Output Tax Payable (when tax > 0)
   * CR Accounts Receivable
   */
  const journalLines: Array<{
    accountId: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    description: string;
    customerId?: string;
  }> = [
    {
      accountId: salesReturns.id,
      debit: money(
        creditNote.subtotal,
      ),
      credit: ZERO,
      description:
        `Credit note ${creditNote.creditNoteNumber} - sales return`,
    },
  ];

  if (
    creditNote.taxTotal.greaterThan(ZERO)
  ) {
    journalLines.push({
      accountId: outputTax.id,
      debit: money(
        creditNote.taxTotal,
      ),
      credit: ZERO,
      description:
        `Credit note ${creditNote.creditNoteNumber} - output tax reversal`,
    });
  }

  journalLines.push({
    accountId: accountsReceivable.id,
    debit: ZERO,
    credit: money(
      creditNote.total,
    ),
    description:
      `Credit note ${creditNote.creditNoteNumber} - accounts receivable`,
    customerId:
      creditNote.customerId,
  });

  const journal =
    await postJournalInExistingTransaction(
      tx,
      {
        tenantId: input.tenantId,
        branchId: creditNote.branchId,
        journalDate:
          creditNote.creditNoteDate,
        description:
          `Sales credit note ${creditNote.creditNoteNumber}`,
        sourceType: SOURCE_TYPE,
        sourceId: creditNote.id,
        currencyCode:
          creditNote.currencyCode,
        exchangeRate: ONE,
        createdById:
          input.postedById,
        lines: journalLines,
      },
      "SYSTEM",
    );

  await tx.creditNote.update({
    where: {
      tenantId_id: {
        tenantId: input.tenantId,
        id: creditNote.id,
      },
    },
    data: {
      status: "POSTED",
      postedAt: new Date(),
    },
  });

  return {
    creditNoteId: creditNote.id,
    creditNoteNumber:
      creditNote.creditNoteNumber,
    journalEntryId: journal.id,
    customerLedgerEntryId:
      customerLedger.id,
    status: "POSTED",
  };
}

export async function postCreditNote(
  input: PostCreditNoteInput,
): Promise<PostCreditNoteResult> {
  if (!input.tenantId) {
    fail("TENANT_ID_REQUIRED");
  }

  if (!input.creditNoteId) {
    fail("CREDIT_NOTE_ID_REQUIRED");
  }

  if (!input.postedById) {
    fail("POSTED_BY_ID_REQUIRED");
  }

  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= 3;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) =>
          postCreditNoteTransaction(
            tx,
            input,
          ),
        TRANSACTION_OPTIONS,
      );
    } catch (error) {
      lastError = error;

      if (
        attempt >= 3 ||
        !isRetryableTransactionError(
          error,
        )
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}