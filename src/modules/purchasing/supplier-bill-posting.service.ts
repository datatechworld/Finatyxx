import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";

import {
  postJournalInExistingTransaction,
  type PostedJournal,
} from "../accounting/general-ledger-posting.service.js";

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

const SERIALIZABLE_MAX_ATTEMPTS = 3;
const SERIALIZABLE_RETRY_BASE_MS = 25;

const SOURCE_TYPE = "SUPPLIER_BILL";
const SUPPLIER_LEDGER_ENTRY_TYPE = "BILL";
const SUPPLIER_LEDGER_REFERENCE_TYPE = "SUPPLIER_BILL";

type TransactionClient = Prisma.TransactionClient;

type RequiredAccountPurpose =
  | "ACCOUNTS_PAYABLE"
  | "INVENTORY"
  | "INPUT_TAX";

export type PostSupplierBillInput = {
  tenantId: string;
  supplierBillId: string;
  postedById: string;
};

export type PostedSupplierBill = {
  supplierBillId: string;
  tenantId: string;
  billNumber: string;
  status: "POSTED";
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  balanceDue: Prisma.Decimal;
  supplierLedgerEntryId: string;
  journal: PostedJournal;
};

export class SupplierBillPostingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SupplierBillPostingError";
  }
}

function fail(code: string, message: string): never {
  throw new SupplierBillPostingError(code, message);
}

function normalizeRequiredId(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    fail(
      "INVALID_INPUT",
      `${fieldName} is required.`,
    );
  }

  return normalized;
}

function money(
  value: Prisma.Decimal,
): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(
    4,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

function sameMoney(
  left: Prisma.Decimal,
  right: Prisma.Decimal,
): boolean {
  return money(left).equals(money(right));
}

function isSerializationConflict(
  error: unknown,
): boolean {
  if (
    error instanceof
      Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("serialization") ||
    message.includes("deadlock")
  );
}

function isSupplierLedgerSourceViolation(
  error: unknown,
): boolean {
  if (
    !(
      error instanceof
      Prisma.PrismaClientKnownRequestError
    )
  ) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  const text =
    Array.isArray(target)
      ? target.join(",")
      : typeof target === "string"
        ? target
        : JSON.stringify(target ?? "");

  return (
    text.includes(
      "supplier_ledger_entries_source_idempotency_uidx",
    ) ||
    (
      text.includes("tenantId") &&
      text.includes("referenceType") &&
      text.includes("referenceId")
    )
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function resolveSystemAccount(
  tx: TransactionClient,
  tenantId: string,
  purpose: RequiredAccountPurpose,
): Promise<string> {
  const mapping =
    await tx.systemAccountMapping.findFirst({
      where: {
        tenantId,
        purpose,
      },
      select: {
        accountId: true,
        account: {
          select: {
            id: true,
            tenantId: true,
            status: true,
          },
        },
      },
    });

  if (!mapping?.account) {
    fail(
      "ACCOUNTING_CONFIGURATION_MISSING",
      `${purpose} is not configured for this business.`,
    );
  }

  if (
    mapping.account.tenantId !== tenantId ||
    mapping.account.status !== "ACTIVE"
  ) {
    fail(
      "ACCOUNTING_CONFIGURATION_INVALID",
      `${purpose} is not mapped to an active account in this business.`,
    );
  }

  return mapping.account.id;
}

async function postSupplierBillInTransaction(
  tx: TransactionClient,
  input: PostSupplierBillInput,
): Promise<PostedSupplierBill> {
  const tenantId = normalizeRequiredId(
    input.tenantId,
    "tenantId",
  );

  const supplierBillId = normalizeRequiredId(
    input.supplierBillId,
    "supplierBillId",
  );

  const postedById = normalizeRequiredId(
    input.postedById,
    "postedById",
  );

  /*
   * Lock the source document before reading its mutable
   * accounting state.
   */
  await tx.$queryRaw`
    SELECT id::text
    FROM supplier_bills
    WHERE id = ${supplierBillId}::uuid
      AND "tenantId" = ${tenantId}::uuid
    FOR UPDATE
  `;

  const bill = await tx.supplierBill.findFirst({
    where: {
      id: supplierBillId,
      tenantId,
    },
    include: {
      supplier: {
        select: {
          id: true,
          tenantId: true,
          status: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              tenantId: true,
              type: true,
              trackInventory: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!bill) {
    fail(
      "SUPPLIER_BILL_NOT_FOUND",
      "Supplier Bill does not exist in this business.",
    );
  }

  if (
    bill.status !== "DRAFT" ||
    bill.postedAt !== null
  ) {
    fail(
      "SUPPLIER_BILL_NOT_POSTABLE",
      "Only an unposted DRAFT Supplier Bill can be posted.",
    );
  }

  const tenant = await tx.tenant.findUnique({
    where: {
      id: tenantId,
    },
    select: {
      id: true,
      baseCurrencyCode: true,
      status: true,
    },
  });

  if (!tenant) {
    fail(
      "TENANT_NOT_FOUND",
      "Business does not exist.",
    );
  }

  if (
    tenant.status !== "TRIAL" &&
    tenant.status !== "ACTIVE"
  ) {
    fail(
      "TENANT_NOT_OPERATIONAL",
      "Business is not operational.",
    );
  }

  const branch = await tx.branch.findFirst({
    where: {
      id: bill.branchId,
      tenantId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!branch || branch.status !== "ACTIVE") {
    fail(
      "BRANCH_NOT_AVAILABLE",
      "Supplier Bill branch does not exist or is inactive.",
    );
  }

  if (
    bill.supplier.tenantId !== tenantId ||
    bill.supplier.status !== "ACTIVE"
  ) {
    fail(
      "SUPPLIER_NOT_AVAILABLE",
      "Supplier does not exist or is inactive.",
    );
  }

  if (bill.items.length === 0) {
    fail(
      "SUPPLIER_BILL_HAS_NO_ITEMS",
      "Supplier Bill must contain at least one item.",
    );
  }

  const currencyCode =
    bill.currencyCode.trim().toUpperCase();

  const baseCurrencyCode =
    tenant.baseCurrencyCode.trim().toUpperCase();

  if (currencyCode !== baseCurrencyCode) {
    fail(
      "FX_NOT_SUPPORTED_IN_MVP",
      `Supplier Bill currency must equal business base currency ${baseCurrencyCode}.`,
    );
  }

  if (!bill.exchangeRate.equals(ONE)) {
    fail(
      "FX_NOT_SUPPORTED_IN_MVP",
      "Supplier Bill exchange rate must be 1 in the MVP.",
    );
  }

  const subtotal = money(bill.subtotal);
  const taxTotal = money(bill.taxTotal);
  const total = money(bill.total);
  const amountPaid = money(bill.amountPaid);
  const balanceDue = money(bill.balanceDue);

  if (
    subtotal.lt(ZERO) ||
    taxTotal.lt(ZERO) ||
    total.lte(ZERO)
  ) {
    fail(
      "INVALID_SUPPLIER_BILL_TOTALS",
      "Supplier Bill totals are invalid.",
    );
  }

  if (!sameMoney(subtotal.plus(taxTotal), total)) {
    fail(
      "INVALID_SUPPLIER_BILL_TOTALS",
      "Supplier Bill subtotal plus tax must equal total.",
    );
  }

  /*
   * Posting starts the AP lifecycle. Supplier payments are
   * responsible for changing amountPaid/balanceDue later.
   */
  if (
    !amountPaid.equals(ZERO) ||
    !balanceDue.equals(total)
  ) {
    fail(
      "INVALID_SUPPLIER_BILL_SETTLEMENT_STATE",
      "An unposted Supplier Bill must have amountPaid 0 and balanceDue equal to total.",
    );
  }

  let calculatedSubtotal = ZERO;
  let calculatedTax = ZERO;
  let calculatedTotal = ZERO;

  for (const item of bill.items) {
    if (!item.productId || !item.product) {
      fail(
        "SUPPLIER_BILL_ITEM_PRODUCT_REQUIRED",
        "MVP Supplier Bills require an inventory product on every line. Use the Expense workflow for ordinary operating expenses.",
      );
    }

    if (
      item.product.tenantId !== tenantId ||
      item.product.status !== "ACTIVE"
    ) {
      fail(
        "PRODUCT_NOT_AVAILABLE",
        `Supplier Bill item ${item.id} references an unavailable product.`,
      );
    }

    if (
      item.product.type !== "INVENTORY" ||
      item.product.trackInventory !== true
    ) {
      fail(
        "UNSUPPORTED_SUPPLIER_BILL_PRODUCT_TYPE",
        `Supplier Bill item ${item.id} must reference an inventory-tracked product in the MVP.`,
      );
    }

    const quantity = money(item.quantity);
    const unitCost = money(item.unitCost);
    const itemTax = money(item.taxAmount);
    const lineTotal = money(item.lineTotal);

    if (quantity.lte(ZERO)) {
      fail(
        "INVALID_SUPPLIER_BILL_ITEM",
        `Supplier Bill item ${item.id} quantity must be greater than zero.`,
      );
    }

    if (unitCost.lt(ZERO)) {
      fail(
        "INVALID_SUPPLIER_BILL_ITEM",
        `Supplier Bill item ${item.id} unit cost cannot be negative.`,
      );
    }

    if (itemTax.lt(ZERO)) {
      fail(
        "INVALID_SUPPLIER_BILL_ITEM",
        `Supplier Bill item ${item.id} tax cannot be negative.`,
      );
    }

    const expectedNet =
      money(quantity.times(unitCost));

    const expectedLineTotal =
      money(expectedNet.plus(itemTax));

    if (!sameMoney(lineTotal, expectedLineTotal)) {
      fail(
        "INVALID_SUPPLIER_BILL_ITEM_TOTAL",
        `Supplier Bill item ${item.id} line total is inconsistent with quantity, unit cost, and tax.`,
      );
    }

    calculatedSubtotal =
      money(calculatedSubtotal.plus(expectedNet));

    calculatedTax =
      money(calculatedTax.plus(itemTax));

    calculatedTotal =
      money(calculatedTotal.plus(lineTotal));
  }

  if (!sameMoney(calculatedSubtotal, subtotal)) {
    fail(
      "INVALID_SUPPLIER_BILL_TOTALS",
      "Supplier Bill subtotal does not equal the sum of item net amounts.",
    );
  }

  if (!sameMoney(calculatedTax, taxTotal)) {
    fail(
      "INVALID_SUPPLIER_BILL_TOTALS",
      "Supplier Bill tax total does not equal the sum of item taxes.",
    );
  }

  if (!sameMoney(calculatedTotal, total)) {
    fail(
      "INVALID_SUPPLIER_BILL_TOTALS",
      "Supplier Bill total does not equal the sum of item totals.",
    );
  }

  /*
   * Application-level source checks provide a clear error.
   * Database unique indexes remain the concurrency authority.
   */
  const existingSupplierLedger =
    await tx.supplierLedgerEntry.findFirst({
      where: {
        tenantId,
        referenceType:
          SUPPLIER_LEDGER_REFERENCE_TYPE,
        referenceId: supplierBillId,
      },
      select: {
        id: true,
      },
    });

  if (existingSupplierLedger) {
    fail(
      "DUPLICATE_SOURCE",
      "This Supplier Bill already has a supplier-ledger posting.",
    );
  }

  const existingJournal =
    await tx.journalEntry.findFirst({
      where: {
        tenantId,
        sourceType: SOURCE_TYPE,
        sourceId: supplierBillId,
      },
      select: {
        id: true,
      },
    });

  if (existingJournal) {
    fail(
      "DUPLICATE_SOURCE",
      "This Supplier Bill already has a General Ledger posting.",
    );
  }

  const accountsPayableAccountId =
    await resolveSystemAccount(
      tx,
      tenantId,
      "ACCOUNTS_PAYABLE",
    );

  const inventoryAccountId =
    await resolveSystemAccount(
      tx,
      tenantId,
      "INVENTORY",
    );

  let inputTaxAccountId: string | null = null;

  if (taxTotal.gt(ZERO)) {
    inputTaxAccountId =
      await resolveSystemAccount(
        tx,
        tenantId,
        "INPUT_TAX",
      );
  }

  const supplierLedgerEntry =
    await tx.supplierLedgerEntry.create({
      data: {
        tenantId,
        supplierId: bill.supplierId,
        branchId: bill.branchId,
        transactionDate: bill.billDate,
        entryType: SUPPLIER_LEDGER_ENTRY_TYPE,
        referenceType:
          SUPPLIER_LEDGER_REFERENCE_TYPE,
        referenceId: supplierBillId,
        debit: ZERO,
        credit: total,
        currencyCode,
      },
      select: {
        id: true,
      },
    });

  const journalLines: Array<{
    accountId: string;
    description: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    supplierId?: string;
  }> = [
    {
      accountId: inventoryAccountId,
      description:
        `Inventory — ${bill.billNumber}`,
      debit: subtotal,
      credit: ZERO,
    },
  ];

  if (
    taxTotal.gt(ZERO) &&
    inputTaxAccountId !== null
  ) {
    journalLines.push({
      accountId: inputTaxAccountId,
      description:
        `Input tax — ${bill.billNumber}`,
      debit: taxTotal,
      credit: ZERO,
    });
  }

  journalLines.push({
    accountId: accountsPayableAccountId,
    description:
      `Accounts payable — ${bill.billNumber}`,
    debit: ZERO,
    credit: total,
    supplierId: bill.supplierId,
  });

  const journal =
    await postJournalInExistingTransaction(
      tx,
      {
        tenantId,
        branchId: bill.branchId,
        journalDate: bill.billDate,
        description:
          `Supplier Bill ${bill.billNumber}`,
        sourceType: SOURCE_TYPE,
        sourceId: supplierBillId,
        currencyCode,
        exchangeRate: bill.exchangeRate,
        createdById: postedById,
        lines: journalLines,
      },
      "SYSTEM",
    );

  const postedAt = new Date();

  await tx.supplierBill.update({
    where: {
      tenantId_id: {
        tenantId,
        id: supplierBillId,
      },
    },
    data: {
      status: "POSTED",
      postedAt,
    },
  });

  return {
    supplierBillId,
    tenantId,
    billNumber: bill.billNumber,
    status: "POSTED",
    total,
    amountPaid,
    balanceDue,
    supplierLedgerEntryId:
      supplierLedgerEntry.id,
    journal,
  };
}

export async function postSupplierBill(
  input: PostSupplierBillInput,
): Promise<PostedSupplierBill> {
  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        (tx) =>
          postSupplierBillInTransaction(
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
      if (isSupplierLedgerSourceViolation(error)) {
        throw new SupplierBillPostingError(
          "DUPLICATE_SOURCE",
          "This Supplier Bill has already been posted.",
        );
      }

      if (isSerializationConflict(error)) {
        if (
          attempt === SERIALIZABLE_MAX_ATTEMPTS
        ) {
          throw new SupplierBillPostingError(
            "TRANSACTION_WRITE_CONFLICT",
            "The Supplier Bill could not be posted because of a concurrent transaction. Please retry.",
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

  throw new SupplierBillPostingError(
    "TRANSACTION_WRITE_CONFLICT",
    "The Supplier Bill could not be posted because of a concurrent transaction.",
  );
}