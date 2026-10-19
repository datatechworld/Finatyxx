import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

import {
  postSupplierBill,
  SupplierBillPostingError,
} from "./src/modules/purchasing/supplier-bill-posting.service.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const POSTED_BY_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const TEST_DATE =
  new Date("2098-07-04T00:00:00.000Z");

const DUE_DATE =
  new Date("2098-08-03T00:00:00.000Z");

const ZERO = new Prisma.Decimal("0");
const ONE = new Prisma.Decimal("1");

const SUBTOTAL =
  new Prisma.Decimal("1000.0000");

const TAX =
  new Prisma.Decimal("150.0000");

const TOTAL =
  new Prisma.Decimal("1150.0000");

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION_FAILED: ${message}`,
    );
  }
}

function sameMoney(
  left: Prisma.Decimal,
  right: Prisma.Decimal,
): boolean {
  return left
    .toDecimalPlaces(4)
    .equals(right.toDecimalPlaces(4));
}

async function main(): Promise<void> {
  console.log(
    "=== 15R.10D SUPPLIER BILL BEHAVIORAL TEST ===",
  );

  /*
   * Prevent accidental rerun after successful evidence
   * has already been created.
   */
  const existingEvidence =
    await prisma.supplierBill.count({
      where: {
        tenantId: TENANT_ID,
        billNumber: {
          startsWith: "BILL-APTEST-15R10D-",
        },
      },
    });

  assert(
    existingEvidence === 0,
    "15R.10D permanent evidence already exists",
  );

  /*
   * Confirm required accounting mappings.
   */
  const mappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
        purpose: {
          in: [
            "ACCOUNTS_PAYABLE",
            "INVENTORY",
            "INPUT_TAX",
          ],
        },
      },
      include: {
        account: true,
      },
    });

  const apMapping =
    mappings.find(
      (mapping) =>
        mapping.purpose ===
        "ACCOUNTS_PAYABLE",
    );

  const inventoryMapping =
    mappings.find(
      (mapping) =>
        mapping.purpose === "INVENTORY",
    );

  const inputTaxMapping =
    mappings.find(
      (mapping) =>
        mapping.purpose === "INPUT_TAX",
    );

  assert(
    apMapping,
    "Accounts Payable mapping missing",
  );

  assert(
    inventoryMapping,
    "Inventory mapping missing",
  );

  assert(
    inputTaxMapping,
    "Input Tax mapping missing",
  );

  assert(
    apMapping.account.status === "ACTIVE",
    "Accounts Payable account inactive",
  );

  assert(
    inventoryMapping.account.status === "ACTIVE",
    "Inventory account inactive",
  );

  assert(
    inputTaxMapping.account.status === "ACTIVE",
    "Input Tax account inactive",
  );

  console.log("");
  console.log("ACCOUNTING MAPPINGS VERIFIED");

  console.dir(
    {
      accountsPayable: {
        id: apMapping.account.id,
        code: apMapping.account.code,
      },
      inventory: {
        id: inventoryMapping.account.id,
        code: inventoryMapping.account.code,
      },
      inputTax: {
        id: inputTaxMapping.account.id,
        code: inputTaxMapping.account.code,
      },
    },
    { depth: null },
  );

  /*
   * Unique evidence token.
   */
  const token =
    `${Date.now()}-${Math.floor(
      Math.random() * 1000000,
    )}`;

  /*
   * Fixture creation is atomic.
   *
   * SupplierBillItem is deliberately created
   * separately from SupplierBill. This avoids
   * Prisma's nested-create tenantId restriction.
   */
  const fixture =
    await prisma.$transaction(
      async (tx) => {
        const supplier =
          await tx.supplier.create({
            data: {
              tenantId: TENANT_ID,
              supplierCode:
                `APTEST-15R10D-${token}`,
              name:
                `15R.10D AP Test Supplier ${token}`,
              paymentTermsDays: 30,
              currencyCode: "GHS",
              status: "ACTIVE",
              notes:
                "Permanent 15R.10D Supplier Bill evidence.",
            },
            select: {
              id: true,
              supplierCode: true,
            },
          });

        const product =
          await tx.product.create({
            data: {
              tenantId: TENANT_ID,
              sku:
                `APTEST-15R10D-${token}`,
              name:
                `15R.10D Inventory Product ${token}`,
              description:
                "Permanent Supplier Bill posting evidence.",
              type: "INVENTORY",
              defaultPurchasePrice: SUBTOTAL,
              trackInventory: true,
              status: "ACTIVE",
            },
            select: {
              id: true,
              sku: true,
            },
          });

        const bill =
          await tx.supplierBill.create({
            data: {
              tenantId: TENANT_ID,
              branchId: BRANCH_ID,
              supplierId: supplier.id,
              billNumber:
                `BILL-APTEST-15R10D-${token}`,
              supplierInvoiceNumber:
                `SUPINV-15R10D-${token}`,
              billDate: TEST_DATE,
              dueDate: DUE_DATE,
              currencyCode: "GHS",
              exchangeRate: ONE,
              subtotal: SUBTOTAL,
              taxTotal: TAX,
              total: TOTAL,
              amountPaid: ZERO,
              balanceDue: TOTAL,
              status: "DRAFT",
            },
            select: {
              id: true,
              billNumber: true,
            },
          });

        const item =
          await tx.supplierBillItem.create({
            data: {
              tenantId: TENANT_ID,
              supplierBillId: bill.id,
              productId: product.id,
              description:
                "15R.10D inventory purchasing test item",
              quantity:
                new Prisma.Decimal("1.0000"),
              unitCost: SUBTOTAL,
              taxRate:
                new Prisma.Decimal("15.000000"),
              taxAmount: TAX,
              lineTotal: TOTAL,
            },
            select: {
              id: true,
            },
          });

        return {
          supplier,
          product,
          bill,
          item,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );

  console.log("");
  console.log("FIXTURE CREATED");
  console.dir(fixture, { depth: null });

  /*
   * Capture stock state before Supplier Bill
   * posting. Supplier Bill must NOT create
   * physical stock.
   */
  const stockBefore =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId: fixture.product.id,
      },
    });

  const balancesBefore =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId: fixture.product.id,
      },
    });

  /*
   * Execute production service.
   */
  const result =
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId: fixture.bill.id,
      postedById: POSTED_BY_ID,
    });

  console.log("");
  console.log("POSTING RESULT");
  console.dir(result, { depth: null });

  /*
   * Verify Supplier Bill state.
   */
  const postedBill =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: fixture.bill.id,
        },
      },
    });

  assert(
    postedBill,
    "Posted Supplier Bill not found",
  );

  assert(
    postedBill.status === "POSTED",
    "Supplier Bill must be POSTED",
  );

  assert(
    postedBill.postedAt !== null,
    "Supplier Bill postedAt must be populated",
  );

  assert(
    sameMoney(
      postedBill.amountPaid,
      ZERO,
    ),
    "Supplier Bill amountPaid must remain zero",
  );

  assert(
    sameMoney(
      postedBill.balanceDue,
      TOTAL,
    ),
    "Supplier Bill balanceDue must remain 1150",
  );

  /*
   * Verify supplier subledger.
   */
  const ledgerEntries =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: fixture.bill.id,
      },
    });

  assert(
    ledgerEntries.length === 1,
    "Exactly one Supplier Ledger entry required",
  );

  const ledger = ledgerEntries[0]!;

  assert(
    sameMoney(ledger.debit, ZERO),
    "Supplier Bill ledger debit must be zero",
  );

  assert(
    sameMoney(ledger.credit, TOTAL),
    "Supplier Bill ledger credit must be 1150",
  );

  assert(
    ledger.supplierId === fixture.supplier.id,
    "Supplier Ledger supplier mismatch",
  );

  /*
   * Verify GL journal.
   */
  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: fixture.bill.id,
      },
      include: {
        lines: true,
      },
    });

  assert(
    journals.length === 1,
    "Exactly one Supplier Bill journal required",
  );

  const journal = journals[0]!;

  assert(
    journal.status === "POSTED",
    "Supplier Bill journal must be POSTED",
  );

  assert(
    journal.currencyCode === "GHS",
    "Journal currency must be GHS",
  );

  assert(
    journal.lines.length === 3,
    "Supplier Bill journal must contain exactly 3 lines",
  );

  const inventoryLine =
    journal.lines.find(
      (line) =>
        line.accountId ===
        inventoryMapping.account.id,
    );

  const inputTaxLine =
    journal.lines.find(
      (line) =>
        line.accountId ===
        inputTaxMapping.account.id,
    );

  const apLine =
    journal.lines.find(
      (line) =>
        line.accountId ===
        apMapping.account.id,
    );

  assert(
    inventoryLine,
    "Inventory journal line missing",
  );

  assert(
    inputTaxLine,
    "Input Tax journal line missing",
  );

  assert(
    apLine,
    "Accounts Payable journal line missing",
  );

  assert(
    sameMoney(
      inventoryLine.debit,
      SUBTOTAL,
    ),
    "Inventory debit must be 1000",
  );

  assert(
    sameMoney(
      inventoryLine.credit,
      ZERO,
    ),
    "Inventory credit must be zero",
  );

  assert(
    sameMoney(
      inputTaxLine.debit,
      TAX,
    ),
    "Input Tax debit must be 150",
  );

  assert(
    sameMoney(
      inputTaxLine.credit,
      ZERO,
    ),
    "Input Tax credit must be zero",
  );

  assert(
    sameMoney(
      apLine.debit,
      ZERO,
    ),
    "AP debit must be zero",
  );

  assert(
    sameMoney(
      apLine.credit,
      TOTAL,
    ),
    "AP credit must be 1150",
  );

  assert(
    apLine.supplierId ===
      fixture.supplier.id,
    "AP journal line supplier dimension mismatch",
  );

  /*
   * Supplier Bill must NOT perform physical
   * inventory receipt.
   */
  const stockAfter =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId: fixture.product.id,
      },
    });

  const balancesAfter =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId: fixture.product.id,
      },
    });

  assert(
    stockAfter === stockBefore,
    "Supplier Bill must not create StockMovement",
  );

  assert(
    balancesAfter === balancesBefore,
    "Supplier Bill must not create InventoryBalance",
  );

  /*
   * Duplicate posting protection.
   */
  let duplicateRejected = false;

  try {
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId: fixture.bill.id,
      postedById: POSTED_BY_ID,
    });
  } catch (error) {
    console.log("");
    console.log("DUPLICATE ATTEMPT REJECTED");

    console.dir(
      error instanceof SupplierBillPostingError
        ? {
            name: error.name,
            code: error.code,
            message: error.message,
          }
        : error,
      { depth: null },
    );

    duplicateRejected =
      error instanceof
        SupplierBillPostingError &&
      (
        error.code ===
          "SUPPLIER_BILL_NOT_POSTABLE" ||
        error.code ===
          "DUPLICATE_SOURCE"
      );
  }

  assert(
    duplicateRejected,
    "Duplicate posting must be rejected",
  );

  const finalLedgerCount =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: fixture.bill.id,
      },
    });

  const finalJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: fixture.bill.id,
      },
    });

  assert(
    finalLedgerCount === 1,
    "Duplicate attempt created Supplier Ledger duplication",
  );

  assert(
    finalJournalCount === 1,
    "Duplicate attempt created journal duplication",
  );

  console.log("");
  console.log(
    "============================================================",
  );

  console.log(
    "15R.10D SUPPLIER BILL BEHAVIORAL TEST: PASS",
  );

  console.log(
    "============================================================",
  );

  console.log("");
  console.log("PERMANENT 2098 EVIDENCE");

  console.dir(
    {
      supplierId: fixture.supplier.id,
      supplierCode:
        fixture.supplier.supplierCode,

      productId: fixture.product.id,
      sku: fixture.product.sku,

      supplierBillId: fixture.bill.id,
      billNumber: fixture.bill.billNumber,

      supplierBillItemId: fixture.item.id,

      supplierLedgerEntryId: ledger.id,

      journalId: journal.id,
      journalNumber: journal.journalNumber,

      accounting: {
        inventoryDebit: "1000.0000",
        inputTaxDebit: "150.0000",
        accountsPayableCredit:
          "1150.0000",
      },

      physicalInventory: {
        stockMovementsBefore:
          stockBefore,
        stockMovementsAfter:
          stockAfter,
        inventoryBalancesBefore:
          balancesBefore,
        inventoryBalancesAfter:
          balancesAfter,
      },

      duplicateProtection: {
        supplierLedgerEntries:
          finalLedgerCount,
        journals:
          finalJournalCount,
      },
    },
    { depth: null },
  );

  console.log("");
  console.log(
    "Permanent 2098 accounting evidence retained.",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10D SUPPLIER BILL BEHAVIORAL TEST: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });