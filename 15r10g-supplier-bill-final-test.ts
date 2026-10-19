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

const USER_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const BILL_DATE =
  new Date("2098-06-25T00:00:00.000Z");

const DUE_DATE =
  new Date("2098-06-30T00:00:00.000Z");

const ZERO = new Prisma.Decimal("0");
const ONE = new Prisma.Decimal("1");
const NET = new Prisma.Decimal("1000");
const TAX = new Prisma.Decimal("150");
const TOTAL = new Prisma.Decimal("1150");

function check(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

function money(
  left: Prisma.Decimal,
  right: Prisma.Decimal,
): boolean {
  return left
    .toDecimalPlaces(4)
    .equals(right.toDecimalPlaces(4));
}

async function main(): Promise<void> {
  console.log(
    "=== 15R.10G FINAL SUPPLIER BILL TEST ===",
  );

  /*
   * Verify the exact fiscal period used by this test.
   */
  const period =
    await prisma.fiscalPeriod.findFirst({
      where: {
        tenantId: TENANT_ID,
        status: "OPEN",
        startDate: {
          lte: BILL_DATE,
        },
        endDate: {
          gte: BILL_DATE,
        },
        fiscalYear: {
          status: "OPEN",
        },
      },
      select: {
        id: true,
        name: true,
        periodNumber: true,
        startDate: true,
        endDate: true,
        fiscalYear: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

  check(
    period,
    "2098-06-25 must be inside an OPEN fiscal period",
  );

  console.log("");
  console.log("OPEN PERIOD VERIFIED");
  console.dir(period, { depth: null });

  /*
   * Refuse accidental duplicate test evidence.
   */
  const existing =
    await prisma.supplierBill.count({
      where: {
        tenantId: TENANT_ID,
        billNumber: {
          startsWith: "BILL-15R10G-",
        },
      },
    });

  check(
    existing === 0,
    "15R.10G evidence already exists",
  );

  /*
   * Resolve accounting mappings.
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
      select: {
        purpose: true,
        accountId: true,
        account: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
      },
    });

  const ap = mappings.find(
    (x) => x.purpose === "ACCOUNTS_PAYABLE",
  );

  const inventory = mappings.find(
    (x) => x.purpose === "INVENTORY",
  );

  const inputTax = mappings.find(
    (x) => x.purpose === "INPUT_TAX",
  );

  check(ap, "AP mapping missing");
  check(inventory, "Inventory mapping missing");
  check(inputTax, "Input Tax mapping missing");

  check(
    ap.account.status === "ACTIVE",
    "AP account inactive",
  );

  check(
    inventory.account.status === "ACTIVE",
    "Inventory account inactive",
  );

  check(
    inputTax.account.status === "ACTIVE",
    "Input Tax account inactive",
  );

  const token =
    `${Date.now()}-${Math.floor(
      Math.random() * 1000000,
    )}`;

  /*
   * Create permanent fixture atomically.
   */
  const fixture =
    await prisma.$transaction(
      async (tx) => {
        const supplier =
          await tx.supplier.create({
            data: {
              tenantId: TENANT_ID,
              supplierCode:
                `SUP-15R10G-${token}`,
              name:
                `15R.10G Supplier ${token}`,
              currencyCode: "GHS",
              paymentTermsDays: 5,
              status: "ACTIVE",
              notes:
                "Permanent 15R.10G accounting evidence.",
            },
          });

        const product =
          await tx.product.create({
            data: {
              tenantId: TENANT_ID,
              sku:
                `SKU-15R10G-${token}`,
              name:
                `15R.10G Product ${token}`,
              type: "INVENTORY",
              defaultPurchasePrice: NET,
              trackInventory: true,
              status: "ACTIVE",
            },
          });

        const bill =
          await tx.supplierBill.create({
            data: {
              tenantId: TENANT_ID,
              branchId: BRANCH_ID,
              supplierId: supplier.id,
              billNumber:
                `BILL-15R10G-${token}`,
              supplierInvoiceNumber:
                `SUPINV-15R10G-${token}`,
              billDate: BILL_DATE,
              dueDate: DUE_DATE,
              currencyCode: "GHS",
              exchangeRate: ONE,
              subtotal: NET,
              taxTotal: TAX,
              total: TOTAL,
              amountPaid: ZERO,
              balanceDue: TOTAL,
              status: "DRAFT",
            },
          });

        const item =
          await tx.supplierBillItem.create({
            data: {
              tenantId: TENANT_ID,
              supplierBillId: bill.id,
              productId: product.id,
              description:
                "15R.10G inventory purchase",
              quantity:
                new Prisma.Decimal("1"),
              unitCost: NET,
              taxRate:
                new Prisma.Decimal("15"),
              taxAmount: TAX,
              lineTotal: TOTAL,
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
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

  console.log("");
  console.log("FIXTURE CREATED");
  console.dir(
    {
      supplierId: fixture.supplier.id,
      productId: fixture.product.id,
      billId: fixture.bill.id,
      billNumber: fixture.bill.billNumber,
      itemId: fixture.item.id,
    },
    { depth: null },
  );

  /*
   * Physical stock must not change from bill posting.
   */
  const stockBefore =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId: fixture.product.id,
      },
    });

  const balanceBefore =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId: fixture.product.id,
      },
    });

  console.log("");
  console.log("EXECUTING PRODUCTION SERVICE");

  const result =
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId: fixture.bill.id,
      postedById: USER_ID,
    });

  console.dir(result, { depth: null });

  /*
   * Verify business document.
   */
  const bill =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: fixture.bill.id,
        },
      },
    });

  check(bill, "Supplier Bill missing");
  check(
    bill.status === "POSTED",
    "Supplier Bill not POSTED",
  );
  check(
    bill.postedAt !== null,
    "postedAt missing",
  );
  check(
    money(bill.amountPaid, ZERO),
    "amountPaid changed unexpectedly",
  );
  check(
    money(bill.balanceDue, TOTAL),
    "balanceDue must be 1150",
  );

  /*
   * Verify supplier subledger.
   */
  const ledger =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: fixture.bill.id,
      },
    });

  check(
    ledger.length === 1,
    "Expected exactly one Supplier Ledger entry",
  );

  check(
    money(ledger[0]!.debit, ZERO),
    "Supplier Ledger debit must be zero",
  );

  check(
    money(ledger[0]!.credit, TOTAL),
    "Supplier Ledger credit must be 1150",
  );

  check(
    ledger[0]!.supplierId === fixture.supplier.id,
    "Supplier Ledger supplier mismatch",
  );

  /*
   * Verify GL.
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

  check(
    journals.length === 1,
    "Expected exactly one journal",
  );

  const journal = journals[0]!;

  check(
    journal.status === "POSTED",
    "Journal must be POSTED",
  );

  check(
    journal.lines.length === 3,
    "Journal must contain exactly 3 lines",
  );

  const inventoryLine =
    journal.lines.find(
      (x) =>
        x.accountId === inventory.accountId,
    );

  const taxLine =
    journal.lines.find(
      (x) =>
        x.accountId === inputTax.accountId,
    );

  const apLine =
    journal.lines.find(
      (x) => x.accountId === ap.accountId,
    );

  check(
    inventoryLine,
    "Inventory GL line missing",
  );

  check(
    taxLine,
    "Input Tax GL line missing",
  );

  check(
    apLine,
    "AP GL line missing",
  );

  check(
    money(inventoryLine.debit, NET) &&
      money(inventoryLine.credit, ZERO),
    "Inventory must be DR 1000",
  );

  check(
    money(taxLine.debit, TAX) &&
      money(taxLine.credit, ZERO),
    "Input Tax must be DR 150",
  );

  check(
    money(apLine.debit, ZERO) &&
      money(apLine.credit, TOTAL),
    "AP must be CR 1150",
  );

  check(
    apLine.supplierId === fixture.supplier.id,
    "AP supplier dimension missing",
  );

  /*
   * Verify no physical inventory event.
   */
  const stockAfter =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId: fixture.product.id,
      },
    });

  const balanceAfter =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId: fixture.product.id,
      },
    });

  check(
    stockAfter === stockBefore,
    "Supplier Bill created StockMovement",
  );

  check(
    balanceAfter === balanceBefore,
    "Supplier Bill changed InventoryBalance",
  );

  /*
   * Verify duplicate protection.
   */
  let duplicateRejected = false;

  try {
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId: fixture.bill.id,
      postedById: USER_ID,
    });
  } catch (error) {
    console.log("");
    console.log("DUPLICATE POST REJECTED");

    console.dir(
      error instanceof SupplierBillPostingError
        ? {
            code: error.code,
            message: error.message,
          }
        : error,
      { depth: null },
    );

    duplicateRejected =
      error instanceof SupplierBillPostingError;
  }

  check(
    duplicateRejected,
    "Duplicate posting was not rejected",
  );

  const ledgerCount =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: fixture.bill.id,
      },
    });

  const journalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: fixture.bill.id,
      },
    });

  check(
    ledgerCount === 1,
    "Supplier Ledger duplicate detected",
  );

  check(
    journalCount === 1,
    "Journal duplicate detected",
  );

  console.log("");
  console.log(
    "==================================================",
  );
  console.log(
    "15R.10G SUPPLIER BILL BEHAVIORAL TEST: PASS",
  );
  console.log(
    "==================================================",
  );

  console.log("");
  console.log("PERMANENT EVIDENCE");

  console.dir(
    {
      supplierId: fixture.supplier.id,
      productId: fixture.product.id,
      supplierBillId: fixture.bill.id,
      billNumber: fixture.bill.billNumber,
      supplierBillItemId: fixture.item.id,
      supplierLedgerEntryId: ledger[0]!.id,
      journalId: journal.id,
      journalNumber: journal.journalNumber,
      postingDate: "2098-06-25",
      accounting: {
        inventoryDebit: "1000.0000",
        inputTaxDebit: "150.0000",
        accountsPayableCredit: "1150.0000",
      },
      physicalInventory: {
        stockBefore,
        stockAfter,
        balanceBefore,
        balanceAfter,
      },
      duplicateProtection: {
        supplierLedgerEntries: ledgerCount,
        journals: journalCount,
      },
    },
    { depth: null },
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10G SUPPLIER BILL BEHAVIORAL TEST: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });