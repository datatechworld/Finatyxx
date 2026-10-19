import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import {
  postJournalInExistingTransaction,
  type PostedJournal,
} from "../accounting/general-ledger-posting.service.js";

const ZERO = new Prisma.Decimal(0);
const SERIALIZABLE_MAX_ATTEMPTS = 3;
const SERIALIZABLE_RETRY_BASE_MS = 25;

const SOURCE_TYPE = "SALES_INVOICE";
const CUSTOMER_LEDGER_ENTRY_TYPE = "INVOICE";
const CUSTOMER_LEDGER_REFERENCE_TYPE = "SALES_INVOICE";

const REQUIRED_ACCOUNT_PURPOSES = [
  "ACCOUNTS_RECEIVABLE",
  "SALES_REVENUE",
  "OUTPUT_TAX",
] as const;

type RequiredAccountPurpose =
  (typeof REQUIRED_ACCOUNT_PURPOSES)[number];

export type PostSalesInvoiceInput = {
  tenantId: string;
  invoiceId: string;
  postedById: string;
};

export type PostedSalesInvoice = {
  invoiceId: string;
  tenantId: string;
  invoiceNumber: string;
  status: "POSTED";
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  balanceDue: Prisma.Decimal;
  customerLedgerEntryId: string;
  journal: PostedJournal;
};

export class SalesInvoicePostingError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "INVOICE_NOT_FOUND"
      | "INVOICE_NOT_POSTABLE"
      | "INVOICE_HAS_NO_ITEMS"
      | "INVALID_INVOICE_TOTALS"
      | "ACCOUNTING_MAPPING_MISSING"
      | "ACCOUNTING_MAPPING_INVALID"
      | "DUPLICATE_POSTING"
      | "TRANSACTION_WRITE_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "SalesInvoicePostingError";
  }
}

function normalizeRequired(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new SalesInvoicePostingError(
      "INVALID_INPUT",
      `${field} is required.`,
    );
  }

  return normalized;
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function isSerializationConflict(error: unknown): boolean {
  if (isPrismaCode(error, "P2034")) return true;

  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  const meta =
    error.meta as Record<string, unknown> | undefined;

  const databaseCode =
    typeof meta?.code === "string"
      ? meta.code
      : typeof meta?.database_error === "string"
        ? meta.database_error
        : null;

  if (databaseCode === "40001") return true;

  return (
    error.code === "P2010" &&
    error.message.includes("40001") &&
    error.message
      .toLowerCase()
      .includes("could not serialize access")
  );
}

function isCustomerLedgerSourceViolation(
  error: unknown,
): boolean {
  if (!isPrismaCode(error, "P2002")) return false;

  const target =
    (
      error as Prisma.PrismaClientKnownRequestError
    ).meta?.target;

  const text = Array.isArray(target)
    ? target.join(",")
    : typeof target === "string"
      ? target
      : JSON.stringify(target ?? "");

  return (
    text.includes("customer_ledger_entries_source_uidx") ||
    (
      text.includes("tenantId") &&
      text.includes("referenceType") &&
      text.includes("referenceId")
    )
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds),
  );
}

function assertNonNegative(
  value: Prisma.Decimal,
  field: string,
): void {
  if (value.lt(ZERO)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      `${field} cannot be negative.`,
    );
  }
}

function validateInvoiceFinancialSnapshot(
  invoice: {
    subtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    roundingAdjustment: Prisma.Decimal;
    total: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    balanceDue: Prisma.Decimal;
    exchangeRate: Prisma.Decimal;
    items: Array<{
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
  },
): void {
  if (invoice.items.length === 0) {
    throw new SalesInvoicePostingError(
      "INVOICE_HAS_NO_ITEMS",
      "The invoice must contain at least one item before posting.",
    );
  }

  assertNonNegative(invoice.subtotal, "subtotal");
  assertNonNegative(
    invoice.discountTotal,
    "discountTotal",
  );
  assertNonNegative(invoice.taxTotal, "taxTotal");
  assertNonNegative(invoice.total, "total");
  assertNonNegative(invoice.amountPaid, "amountPaid");
  assertNonNegative(invoice.balanceDue, "balanceDue");

  if (!invoice.exchangeRate.gt(ZERO)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "exchangeRate must be greater than zero.",
    );
  }

  if (!invoice.amountPaid.eq(ZERO)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "An invoice must not contain payments before its initial accounting posting.",
    );
  }

  if (!invoice.balanceDue.eq(invoice.total)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "balanceDue must equal total when an invoice is initially posted.",
    );
  }

  if (!invoice.total.gt(ZERO)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "Invoice total must be greater than zero.",
    );
  }

  const expectedTotal = invoice.subtotal
    .minus(invoice.discountTotal)
    .plus(invoice.taxTotal)
    .plus(invoice.roundingAdjustment);

  if (!expectedTotal.eq(invoice.total)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "Invoice header totals are inconsistent.",
    );
  }

  let itemSubtotal = ZERO;
  let itemTaxTotal = ZERO;
  let itemDiscountTotal = ZERO;
  let itemTotal = ZERO;

  for (const [index, item] of invoice.items.entries()) {
    if (!item.quantity.gt(ZERO)) {
      throw new SalesInvoicePostingError(
        "INVALID_INVOICE_TOTALS",
        `Invoice item ${index + 1} quantity must be greater than zero.`,
      );
    }

    assertNonNegative(
      item.unitPrice,
      `items[${index}].unitPrice`,
    );

    assertNonNegative(
      item.discountAmount,
      `items[${index}].discountAmount`,
    );

    assertNonNegative(
      item.taxAmount,
      `items[${index}].taxAmount`,
    );

    assertNonNegative(
      item.lineSubtotal,
      `items[${index}].lineSubtotal`,
    );

    assertNonNegative(
      item.lineTotal,
      `items[${index}].lineTotal`,
    );

    itemSubtotal = itemSubtotal.plus(
      item.lineSubtotal,
    );

    itemTaxTotal = itemTaxTotal.plus(
      item.taxAmount,
    );

    itemDiscountTotal = itemDiscountTotal.plus(
      item.discountAmount,
    );

    itemTotal = itemTotal.plus(
      item.lineTotal,
    );
  }

  if (!itemSubtotal.eq(invoice.subtotal)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "Invoice subtotal does not equal the sum of item subtotals.",
    );
  }

  if (!itemTaxTotal.eq(invoice.taxTotal)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "Invoice tax total does not equal the sum of item tax amounts.",
    );
  }

  if (!itemDiscountTotal.eq(invoice.discountTotal)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "Invoice discount total does not equal the sum of item discount amounts.",
    );
  }

  const expectedItemTotal = itemTotal.plus(
    invoice.roundingAdjustment,
  );

  if (!expectedItemTotal.eq(invoice.total)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "Invoice total does not reconcile to item totals and rounding adjustment.",
    );
  }
}

async function resolveRequiredAccounts(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<Record<RequiredAccountPurpose, string>> {
  const mappings =
    await tx.systemAccountMapping.findMany({
      where: {
        tenantId,
        purpose: {
          in: [...REQUIRED_ACCOUNT_PURPOSES],
        },
      },
      select: {
        purpose: true,
        accountId: true,
        account: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

  const resolved = new Map<
    RequiredAccountPurpose,
    string
  >();

  for (const mapping of mappings) {
    if (
      !REQUIRED_ACCOUNT_PURPOSES.includes(
        mapping.purpose as RequiredAccountPurpose,
      )
    ) {
      continue;
    }

    if (
      !mapping.account ||
      mapping.account.status !== "ACTIVE"
    ) {
      throw new SalesInvoicePostingError(
        "ACCOUNTING_MAPPING_INVALID",
        `System account mapping ${mapping.purpose} does not point to an active account.`,
      );
    }

    resolved.set(
      mapping.purpose as RequiredAccountPurpose,
      mapping.accountId,
    );
  }

  for (const purpose of REQUIRED_ACCOUNT_PURPOSES) {
    if (!resolved.has(purpose)) {
      throw new SalesInvoicePostingError(
        "ACCOUNTING_MAPPING_MISSING",
        `System account mapping ${purpose} is required before sales invoices can be posted.`,
      );
    }
  }

  return {
    ACCOUNTS_RECEIVABLE:
      resolved.get("ACCOUNTS_RECEIVABLE")!,
    SALES_REVENUE:
      resolved.get("SALES_REVENUE")!,
    OUTPUT_TAX:
      resolved.get("OUTPUT_TAX")!,
  };
}

async function postSalesInvoiceInTransaction(
  tx: Prisma.TransactionClient,
  input: PostSalesInvoiceInput,
): Promise<PostedSalesInvoice> {
  const tenantId = normalizeRequired(
    input.tenantId,
    "tenantId",
  );

  const invoiceId = normalizeRequired(
    input.invoiceId,
    "invoiceId",
  );

  const postedById = normalizeRequired(
    input.postedById,
    "postedById",
  );

  const invoice = await tx.invoice.findFirst({
    where: {
      tenantId,
      id: invoiceId,
    },
    include: {
      items: {
        orderBy: [
          { sortOrder: "asc" },
          { id: "asc" },
        ],
      },
      customer: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new SalesInvoicePostingError(
      "INVOICE_NOT_FOUND",
      "The invoice does not exist in the tenant.",
    );
  }

  if (
    invoice.status !== "APPROVED" &&
    invoice.status !== "DRAFT"
  ) {
    throw new SalesInvoicePostingError(
      "INVOICE_NOT_POSTABLE",
      `Invoice ${invoice.invoiceNumber} cannot be posted from status ${invoice.status}.`,
    );
  }

  if (invoice.customer.status !== "ACTIVE") {
    throw new SalesInvoicePostingError(
      "INVOICE_NOT_POSTABLE",
      "The invoice customer is not active.",
    );
  }

  validateInvoiceFinancialSnapshot(invoice);

  const accounts = await resolveRequiredAccounts(
    tx,
    tenantId,
  );

  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: {
      baseCurrencyCode: true,
    },
  });

  if (!tenant) {
    throw new SalesInvoicePostingError(
      "INVOICE_NOT_POSTABLE",
      "The invoice tenant does not exist.",
    );
  }

  /*
   * JournalLine values are authoritative base-currency
   * accounting amounts.
   *
   * Invoice values are document-currency amounts.
   *
   * Finatyx exchange-rate convention for this posting path:
   *
   *   base amount = document amount * exchangeRate
   *
   * Monetary journal amounts are rounded to four decimal
   * places because JournalLine uses Decimal(20,4).
   */
  const toBaseAmount = (
    amount: Prisma.Decimal,
  ): Prisma.Decimal =>
    amount
      .times(invoice.exchangeRate)
      .toDecimalPlaces(4);

  const arBase = toBaseAmount(invoice.total);

  const revenueDocumentAmount =
    invoice.subtotal.minus(invoice.discountTotal);

  const revenueBase = toBaseAmount(
    revenueDocumentAmount,
  );

  const taxBase = toBaseAmount(invoice.taxTotal);

  /*
   * FX conversion can introduce a tiny rounding difference
   * between individually converted credit components and the
   * converted invoice total. Apply that residual to revenue so
   * that the GL journal remains exactly balanced.
   */
  const creditBaseBeforeAdjustment =
    revenueBase.plus(taxBase);

  const fxRoundingResidual = arBase.minus(
    creditBaseBeforeAdjustment,
  );

  const adjustedRevenueBase =
    revenueBase.plus(fxRoundingResidual);

  if (!adjustedRevenueBase.gt(ZERO)) {
    throw new SalesInvoicePostingError(
      "INVALID_INVOICE_TOTALS",
      "Calculated sales revenue must be greater than zero.",
    );
  }

  const journalLines: Array<{
    accountId: string;
    description: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    customerId?: string;
  }> = [
    {
      accountId: accounts.ACCOUNTS_RECEIVABLE,
      description: `Accounts receivable — ${invoice.invoiceNumber}`,
      debit: arBase,
      credit: ZERO,
      customerId: invoice.customerId,
    },
    {
      accountId: accounts.SALES_REVENUE,
      description: `Sales revenue — ${invoice.invoiceNumber}`,
      debit: ZERO,
      credit: adjustedRevenueBase,
      customerId: invoice.customerId,
    },
  ];

  if (taxBase.gt(ZERO)) {
    journalLines.push({
      accountId: accounts.OUTPUT_TAX,
      description: `Output tax — ${invoice.invoiceNumber}`,
      debit: ZERO,
      credit: taxBase,
      customerId: invoice.customerId,
    });
  }

  let customerLedgerEntry: {
    id: string;
  };

  try {
    customerLedgerEntry =
      await tx.customerLedgerEntry.create({
        data: {
          tenantId,
          customerId: invoice.customerId,
          branchId: invoice.branchId,
          transactionDate: invoice.invoiceDate,
          entryType: CUSTOMER_LEDGER_ENTRY_TYPE,
          referenceType:
            CUSTOMER_LEDGER_REFERENCE_TYPE,
          referenceId: invoice.id,
          debit: invoice.total,
          credit: ZERO,
          currencyCode: invoice.currencyCode,
        },
        select: {
          id: true,
        },
      });
  } catch (error) {
    if (isCustomerLedgerSourceViolation(error)) {
      throw new SalesInvoicePostingError(
        "DUPLICATE_POSTING",
        `Invoice ${invoice.invoiceNumber} already has a customer ledger posting.`,
      );
    }

    throw error;
  }

  const journal =
    await postJournalInExistingTransaction(
      tx,
      {
        tenantId,
        branchId: invoice.branchId,
        journalDate: invoice.invoiceDate,
        description:
          `Sales invoice ${invoice.invoiceNumber}`,
        sourceType: SOURCE_TYPE,
        sourceId: invoice.id,
        currencyCode: invoice.currencyCode,
        exchangeRate: invoice.exchangeRate,
        createdById: postedById,
        lines: journalLines,
      },
      "SYSTEM",
    );

  const postedAt = new Date();

  const updatedInvoice = await tx.invoice.update({
    where: {
      tenantId_id: {
        tenantId,
        id: invoice.id,
      },
    },
    data: {
      status: "POSTED",
      postedAt,
    },
    select: {
      id: true,
      tenantId: true,
      invoiceNumber: true,
      status: true,
      total: true,
      amountPaid: true,
      balanceDue: true,
    },
  });

  if (updatedInvoice.status !== "POSTED") {
    throw new SalesInvoicePostingError(
      "INVOICE_NOT_POSTABLE",
      "Invoice posting did not reach POSTED status.",
    );
  }

  return {
    invoiceId: updatedInvoice.id,
    tenantId: updatedInvoice.tenantId,
    invoiceNumber: updatedInvoice.invoiceNumber,
    status: "POSTED",
    total: updatedInvoice.total,
    amountPaid: updatedInvoice.amountPaid,
    balanceDue: updatedInvoice.balanceDue,
    customerLedgerEntryId:
      customerLedgerEntry.id,
    journal,
  };
}

export async function postSalesInvoice(
  input: PostSalesInvoiceInput,
): Promise<PostedSalesInvoice> {
  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        (tx) =>
          postSalesInvoiceInTransaction(tx, input),
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      );
    } catch (error) {
      if (isCustomerLedgerSourceViolation(error)) {
        throw new SalesInvoicePostingError(
          "DUPLICATE_POSTING",
          "This invoice has already been posted to the customer ledger.",
        );
      }

      if (isSerializationConflict(error)) {
        if (
          attempt === SERIALIZABLE_MAX_ATTEMPTS
        ) {
          throw new SalesInvoicePostingError(
            "TRANSACTION_WRITE_CONFLICT",
            "The sales invoice could not be posted because of a concurrent transaction. Please retry.",
          );
        }

        await sleep(
          SERIALIZABLE_RETRY_BASE_MS * attempt,
        );

        continue;
      }

      throw error;
    }
  }

  throw new SalesInvoicePostingError(
    "TRANSACTION_WRITE_CONFLICT",
    "The sales invoice could not be posted because of a concurrent transaction.",
  );
}