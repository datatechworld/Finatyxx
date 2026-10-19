import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  postSupplierBill,
  SupplierBillPostingError,
} from "./src/modules/purchasing/supplier-bill-posting.service.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

const USER_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const ZERO = new Prisma.Decimal("0");
const NET = new Prisma.Decimal("1000");
const TAX = new Prisma.Decimal("150");
const TOTAL = new Prisma.Decimal("1150");

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

function moneyEquals(
  actual: Prisma.Decimal,
  expected: Prisma.Decimal,
): boolean {
  return actual
    .toDecimalPlaces(4)
    .equals(expected.toDecimalPlaces(4));
}

async function main(): Promise<void> {
  console.log(
    "=== 15R.10S SUPPLIER BILL FINAL VERIFICATION ===",
  );

  /*
   * PRE-POSTING STATE
   */

  const before = await prisma.supplierBill.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: BILL_ID,
      },
    },
    include: {
      items: true,
    },
  });

  assert(before, "Supplier Bill not found");

  assert(
    before.status === "DRAFT",
    `Expected DRAFT, found ${before.status}`,
  );

  assert(
    before.postedAt === null,
    "Supplier Bill already has postedAt",
  );

  assert(
    before.items.length === 1,
    `Expected one item, found ${before.items.length}`,
  );

  assert(
    moneyEquals(before.subtotal, NET),
    "Subtotal must be 1000",
  );

  assert(
    moneyEquals(before.taxTotal, TAX),
    "Tax must be 150",
  );

  assert(
    moneyEquals(before.total, TOTAL),
    "Total must be 1150",
  );

  assert(
    moneyEquals(before.amountPaid, ZERO),
    "amountPaid must be zero",
  );

  assert(
    moneyEquals(before.balanceDue, TOTAL),
    "balanceDue must be 1150",
  );

  const item = before.items[0]!;

  assert(
    item.productId !== null,
    "Supplier Bill item has no productId",
  );

  const productId = item.productId!;

  const ledgerBefore =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: BILL_ID,
      },
    });

  const journalBefore =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: BILL_ID,
      },
    });

  const stockBefore =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId,
      },
    });

  const balanceBefore =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId,
      },
    });

  assert(
    ledgerBefore === 0,
    `Expected 0 Supplier Ledger entries, found ${ledgerBefore}`,
  );

  assert(
    journalBefore === 0,
    `Expected 0 Journals, found ${journalBefore}`,
  );

  assert(
    stockBefore === 0,
    `Expected 0 StockMovements, found ${stockBefore}`,
  );

  assert(
    balanceBefore === 0,
    `Expected 0 InventoryBalance rows, found ${balanceBefore}`,
  );

  console.log("");
  console.log("PRE-POSTING STATE: VERIFIED");

  console.dir(
    {
      supplierBillId: before.id,
      billNumber: before.billNumber,
      supplierId: before.supplierId,
      productId,
      status: before.status,
      subtotal: before.subtotal.toString(),
      taxTotal: before.taxTotal.toString(),
      total: before.total.toString(),
      amountPaid: before.amountPaid.toString(),
      balanceDue: before.balanceDue.toString(),
      supplierLedgerCount: ledgerBefore,
      journalCount: journalBefore,
      stockMovementCount: stockBefore,
      inventoryBalanceCount: balanceBefore,
    },
    { depth: null },
  );

  /*
   * PERMANENT DATABASE MUTATION BEGINS HERE.
   */

  console.log("");
  console.log(
    ">>> EXECUTING postSupplierBill() EXACTLY ONCE <<<",
  );

  const posted = await postSupplierBill({
    tenantId: TENANT_ID,
    supplierBillId: BILL_ID,
    postedById: USER_ID,
  });

  console.log("");
  console.log("POSTING SERVICE RETURNED SUCCESSFULLY");
  console.dir(posted, { depth: null });

  /*
   * DOCUMENT VERIFICATION
   */

  const after = await prisma.supplierBill.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: BILL_ID,
      },
    },
  });

  assert(after, "Posted Supplier Bill not found");

  assert(
    after.status === "POSTED",
    `Expected POSTED, found ${after.status}`,
  );

  assert(
    after.postedAt !== null,
    "postedAt was not populated",
  );

  assert(
    moneyEquals(after.subtotal, NET),
    "Subtotal changed after posting",
  );

  assert(
    moneyEquals(after.taxTotal, TAX),
    "Tax changed after posting",
  );

  assert(
    moneyEquals(after.total, TOTAL),
    "Total changed after posting",
  );

  assert(
    moneyEquals(after.amountPaid, ZERO),
    "amountPaid changed after posting",
  );

  assert(
    moneyEquals(after.balanceDue, TOTAL),
    "balanceDue changed after posting",
  );

  /*
   * SUPPLIER LEDGER
   */

  const ledgers =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: BILL_ID,
      },
    });

  assert(
    ledgers.length === 1,
    `Expected one Supplier Ledger entry, found ${ledgers.length}`,
  );

  const ledger = ledgers[0]!;

  assert(
    ledger.supplierId === before.supplierId,
    "Supplier Ledger supplier mismatch",
  );

  assert(
    ledger.entryType === "BILL",
    `Unexpected Supplier Ledger entryType ${ledger.entryType}`,
  );

  assert(
    moneyEquals(ledger.debit, ZERO),
    "Supplier Bill ledger debit must be zero",
  );

  assert(
    moneyEquals(ledger.credit, TOTAL),
    "Supplier Bill ledger credit must be 1150",
  );

  /*
   * GENERAL LEDGER
   */

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: BILL_ID,
      },
      include: {
        lines: true,
      },
    });

  assert(
    journals.length === 1,
    `Expected one Journal, found ${journals.length}`,
  );

  const journal = journals[0]!;

  assert(
    journal.status === "POSTED",
    `Journal status is ${journal.status}`,
  );

  assert(
    journal.lines.length === 3,
    `Expected 3 JournalLines, found ${journal.lines.length}`,
  );

  for (const line of journal.lines) {
    assert(
      line.tenantId === TENANT_ID,
      `JournalLine ${line.id} tenantId mismatch`,
    );

    assert(
      line.journalEntryId === journal.id,
      `JournalLine ${line.id} journalEntryId mismatch`,
    );
  }

  const mappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
        purpose: {
          in: [
            "INVENTORY",
            "INPUT_TAX",
            "ACCOUNTS_PAYABLE",
          ],
        },
      },
      select: {
        purpose: true,
        accountId: true,
        account: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

  const inventory = mappings.find(
    (mapping) =>
      mapping.purpose === "INVENTORY",
  );

  const inputTax = mappings.find(
    (mapping) =>
      mapping.purpose === "INPUT_TAX",
  );

  const ap = mappings.find(
    (mapping) =>
      mapping.purpose === "ACCOUNTS_PAYABLE",
  );

  assert(inventory, "INVENTORY mapping missing");
  assert(inputTax, "INPUT_TAX mapping missing");
  assert(ap, "ACCOUNTS_PAYABLE mapping missing");

  const inventoryLine = journal.lines.find(
    (line) =>
      line.accountId === inventory.accountId,
  );

  const inputTaxLine = journal.lines.find(
    (line) =>
      line.accountId === inputTax.accountId,
  );

  const apLine = journal.lines.find(
    (line) =>
      line.accountId === ap.accountId,
  );

  assert(
    inventoryLine,
    "Inventory JournalLine missing",
  );

  assert(
    inputTaxLine,
    "Input Tax JournalLine missing",
  );

  assert(
    apLine,
    "Accounts Payable JournalLine missing",
  );

  assert(
    moneyEquals(inventoryLine.debit, NET),
    "Inventory debit must be 1000",
  );

  assert(
    moneyEquals(inventoryLine.credit, ZERO),
    "Inventory credit must be zero",
  );

  assert(
    moneyEquals(inputTaxLine.debit, TAX),
    "Input Tax debit must be 150",
  );

  assert(
    moneyEquals(inputTaxLine.credit, ZERO),
    "Input Tax credit must be zero",
  );

  assert(
    moneyEquals(apLine.debit, ZERO),
    "AP debit must be zero",
  );

  assert(
    moneyEquals(apLine.credit, TOTAL),
    "AP credit must be 1150",
  );

  assert(
    apLine.supplierId === before.supplierId,
    "AP supplier dimension mismatch",
  );

  const totalDebits = journal.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    ZERO,
  );

  const totalCredits = journal.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    ZERO,
  );

  assert(
    moneyEquals(totalDebits, TOTAL),
    "Total debits must be 1150",
  );

  assert(
    moneyEquals(totalCredits, TOTAL),
    "Total credits must be 1150",
  );

  assert(
    moneyEquals(totalDebits, totalCredits),
    "Journal is not balanced",
  );

  /*
   * PHYSICAL INVENTORY MUST REMAIN UNCHANGED
   */

  const stockAfter =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId,
      },
    });

  const balanceAfter =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId,
      },
    });

  assert(
    stockAfter === stockBefore,
    `StockMovement count changed from ${stockBefore} to ${stockAfter}`,
  );

  assert(
    balanceAfter === balanceBefore,
    `InventoryBalance count changed from ${balanceBefore} to ${balanceAfter}`,
  );

  /*
   * DUPLICATE POSTING MUST FAIL
   */

  let duplicateRejected = false;
  let duplicateCode: string | null = null;

  try {
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId: BILL_ID,
      postedById: USER_ID,
    });
  } catch (error) {
    if (error instanceof SupplierBillPostingError) {
      duplicateRejected = true;
      duplicateCode = error.code;
    } else {
      throw error;
    }
  }

  assert(
    duplicateRejected,
    "Second posting attempt was not rejected",
  );

  const finalLedgerCount =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: BILL_ID,
      },
    });

  const finalJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: BILL_ID,
      },
    });

  assert(
    finalLedgerCount === 1,
    `Expected final Supplier Ledger count 1, found ${finalLedgerCount}`,
  );

  assert(
    finalJournalCount === 1,
    `Expected final Journal count 1, found ${finalJournalCount}`,
  );

  console.log("");
  console.log(
    "============================================================",
  );

  console.log(
    "15R.10S SUPPLIER BILL BEHAVIORAL VERIFICATION: PASS",
  );

  console.log(
    "============================================================",
  );

  console.log("");
  console.log("PERMANENT ACCOUNTING EVIDENCE");

  console.dir(
    {
      supplierBill: {
        id: after.id,
        billNumber: after.billNumber,
        supplierId: after.supplierId,
        status: after.status,
        postedAt: after.postedAt,
        subtotal: after.subtotal.toString(),
        taxTotal: after.taxTotal.toString(),
        total: after.total.toString(),
        amountPaid: after.amountPaid.toString(),
        balanceDue: after.balanceDue.toString(),
      },

      supplierLedger: {
        id: ledger.id,
        entryType: ledger.entryType,
        debit: ledger.debit.toString(),
        credit: ledger.credit.toString(),
      },

      journal: {
        id: journal.id,
        journalNumber: journal.journalNumber,
        status: journal.status,
        lineCount: journal.lines.length,
      },

      accounting: {
        inventory:
          `${inventory.account.code} ${inventory.account.name}`,

        inventoryDebit:
          inventoryLine.debit.toString(),

        inputTax:
          `${inputTax.account.code} ${inputTax.account.name}`,

        inputTaxDebit:
          inputTaxLine.debit.toString(),

        accountsPayable:
          `${ap.account.code} ${ap.account.name}`,

        accountsPayableCredit:
          apLine.credit.toString(),

        totalDebits:
          totalDebits.toString(),

        totalCredits:
          totalCredits.toString(),
      },

      tenantIntegrity: {
        journalTenantId:
          journal.tenantId,

        lineTenantIds:
          journal.lines.map(
            (line) => line.tenantId,
          ),

        lineJournalEntryIds:
          journal.lines.map(
            (line) => line.journalEntryId,
          ),
      },

      physicalInventory: {
        stockMovementBefore:
          stockBefore,

        stockMovementAfter:
          stockAfter,

        inventoryBalanceBefore:
          balanceBefore,

        inventoryBalanceAfter:
          balanceAfter,
      },

      duplicateProtection: {
        rejected:
          duplicateRejected,

        errorCode:
          duplicateCode,

        supplierLedgerCount:
          finalLedgerCount,

        journalCount:
          finalJournalCount,
      },
    },
    { depth: null },
  );

  console.log("");
  console.log("Supplier Bill document: VERIFIED");
  console.log("Supplier subledger: VERIFIED");
  console.log("General Ledger: VERIFIED");
  console.log("Balanced journal: VERIFIED");
  console.log("JournalLine tenant integrity: VERIFIED");
  console.log("Physical inventory separation: VERIFIED");
  console.log("Duplicate protection: VERIFIED");

  console.log("");
  console.log("DO NOT RERUN 15R.10S.");
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10S SUPPLIER BILL BEHAVIORAL VERIFICATION: FAIL",
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });