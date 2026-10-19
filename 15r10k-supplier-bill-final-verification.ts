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

function check(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION_FAILED: ${message}`,
    );
  }
}

function money(
  actual: Prisma.Decimal,
  expected: Prisma.Decimal,
): boolean {
  return actual
    .toDecimalPlaces(4)
    .equals(
      expected.toDecimalPlaces(4),
    );
}

async function main(): Promise<void> {
  console.log(
    "=== 15R.10K SUPPLIER BILL FINAL VERIFICATION ===",
  );

  /*
   * ----------------------------------------------------------
   * PRE-MUTATION SAFETY CHECK
   * ----------------------------------------------------------
   */

  const before =
    await prisma.supplierBill.findUnique({
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

  check(
    before,
    "Preserved Supplier Bill does not exist",
  );

  check(
    before.status === "DRAFT",
    `Expected DRAFT before posting, found ${before.status}`,
  );

  check(
    before.postedAt === null,
    "Supplier Bill already has postedAt",
  );

  check(
    before.items.length === 1,
    "Expected exactly one Supplier Bill item",
  );

  check(
    money(before.subtotal, NET),
    "Pre-posting subtotal must be 1000",
  );

  check(
    money(before.taxTotal, TAX),
    "Pre-posting taxTotal must be 150",
  );

  check(
    money(before.total, TOTAL),
    "Pre-posting total must be 1150",
  );

  check(
    money(before.amountPaid, ZERO),
    "Pre-posting amountPaid must be zero",
  );

  check(
    money(before.balanceDue, TOTAL),
    "Pre-posting balanceDue must be 1150",
  );

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

  check(
    ledgerBefore === 0,
    "Supplier Ledger evidence already exists",
  );

  check(
    journalBefore === 0,
    "Journal evidence already exists",
  );

  const item = before.items[0]!;

  check(
    item.productId !== null,
    "Supplier Bill item must have productId",
  );

  const stockBefore =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId!,
      },
    });

  const inventoryBalanceBefore =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId!,
      },
    });

  /*
   * Resolve expected system accounts before posting.
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
            name: true,
            status: true,
          },
        },
      },
    });

  const ap =
    mappings.find(
      (mapping) =>
        mapping.purpose ===
        "ACCOUNTS_PAYABLE",
    );

  const inventory =
    mappings.find(
      (mapping) =>
        mapping.purpose ===
        "INVENTORY",
    );

  const inputTax =
    mappings.find(
      (mapping) =>
        mapping.purpose ===
        "INPUT_TAX",
    );

  check(ap, "AP system account mapping missing");
  check(
    inventory,
    "Inventory system account mapping missing",
  );
  check(
    inputTax,
    "Input Tax system account mapping missing",
  );

  console.log("");
  console.log("PRE-POSTING STATE: VERIFIED");

  console.dir(
    {
      supplierBillId: before.id,
      billNumber: before.billNumber,
      status: before.status,
      supplierId: before.supplierId,
      productId: item.productId,
      subtotal: before.subtotal.toString(),
      taxTotal: before.taxTotal.toString(),
      total: before.total.toString(),
      stockMovementCount: stockBefore,
      inventoryBalanceCount:
        inventoryBalanceBefore,
    },
    { depth: null },
  );

  /*
   * ----------------------------------------------------------
   * SINGLE PRODUCTION MUTATION
   * ----------------------------------------------------------
   */

  console.log("");
  console.log(
    "EXECUTING postSupplierBill() ONCE",
  );

  const result =
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId: BILL_ID,
      postedById: USER_ID,
    });

  console.log("");
  console.log("PRODUCTION SERVICE RESULT");
  console.dir(result, { depth: null });

  /*
   * ----------------------------------------------------------
   * POSTING VERIFICATION
   * ----------------------------------------------------------
   */

  const after =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BILL_ID,
        },
      },
    });

  check(
    after,
    "Supplier Bill missing after posting",
  );

  check(
    after.status === "POSTED",
    `Expected POSTED, found ${after.status}`,
  );

  check(
    after.postedAt !== null,
    "postedAt was not populated",
  );

  check(
    money(after.subtotal, NET),
    "Posted subtotal changed",
  );

  check(
    money(after.taxTotal, TAX),
    "Posted taxTotal changed",
  );

  check(
    money(after.total, TOTAL),
    "Posted total changed",
  );

  check(
    money(after.amountPaid, ZERO),
    "Posted amountPaid must remain zero",
  );

  check(
    money(after.balanceDue, TOTAL),
    "Posted balanceDue must remain 1150",
  );

  /*
   * Supplier subledger.
   */

  const ledger =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: BILL_ID,
      },
    });

  check(
    ledger.length === 1,
    `Expected one Supplier Ledger entry, found ${ledger.length}`,
  );

  const ledgerEntry = ledger[0]!;

  check(
    ledgerEntry.supplierId === before.supplierId,
    "Supplier Ledger supplier mismatch",
  );

  check(
    ledgerEntry.entryType === "BILL",
    `Unexpected Supplier Ledger entryType ${ledgerEntry.entryType}`,
  );

  check(
    money(ledgerEntry.debit, ZERO),
    "Supplier Ledger debit must be zero",
  );

  check(
    money(ledgerEntry.credit, TOTAL),
    "Supplier Ledger credit must be 1150",
  );

  /*
   * General Ledger.
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

  check(
    journals.length === 1,
    `Expected one journal, found ${journals.length}`,
  );

  const journal = journals[0]!;

  check(
    journal.status === "POSTED",
    `Expected POSTED journal, found ${journal.status}`,
  );

  check(
    journal.lines.length === 3,
    `Expected three JournalLines, found ${journal.lines.length}`,
  );

  for (const line of journal.lines) {
    check(
      line.tenantId === TENANT_ID,
      `JournalLine ${line.id} has wrong tenantId`,
    );

    check(
      line.journalEntryId === journal.id,
      `JournalLine ${line.id} has wrong journalEntryId`,
    );
  }

  const inventoryLine =
    journal.lines.find(
      (line) =>
        line.accountId === inventory.accountId,
    );

  const inputTaxLine =
    journal.lines.find(
      (line) =>
        line.accountId === inputTax.accountId,
    );

  const apLine =
    journal.lines.find(
      (line) =>
        line.accountId === ap.accountId,
    );

  check(
    inventoryLine,
    "Inventory JournalLine missing",
  );

  check(
    inputTaxLine,
    "Input Tax JournalLine missing",
  );

  check(
    apLine,
    "Accounts Payable JournalLine missing",
  );

  check(
    money(inventoryLine.debit, NET),
    "Inventory debit must be 1000",
  );

  check(
    money(inventoryLine.credit, ZERO),
    "Inventory credit must be zero",
  );

  check(
    money(inputTaxLine.debit, TAX),
    "Input Tax debit must be 150",
  );

  check(
    money(inputTaxLine.credit, ZERO),
    "Input Tax credit must be zero",
  );

  check(
    money(apLine.debit, ZERO),
    "AP debit must be zero",
  );

  check(
    money(apLine.credit, TOTAL),
    "AP credit must be 1150",
  );

  check(
    apLine.supplierId === before.supplierId,
    "AP JournalLine supplier dimension missing or incorrect",
  );

  const totalDebits =
    journal.lines.reduce(
      (sum, line) =>
        sum.plus(line.debit),
      ZERO,
    );

  const totalCredits =
    journal.lines.reduce(
      (sum, line) =>
        sum.plus(line.credit),
      ZERO,
    );

  check(
    money(totalDebits, TOTAL),
    "Journal debits must total 1150",
  );

  check(
    money(totalCredits, TOTAL),
    "Journal credits must total 1150",
  );

  check(
    money(totalDebits, totalCredits),
    "Journal is not balanced",
  );

  /*
   * Supplier Bill must NOT perform physical receipt.
   */

  const stockAfter =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId!,
      },
    });

  const inventoryBalanceAfter =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId!,
      },
    });

  check(
    stockAfter === stockBefore,
    "Supplier Bill created a StockMovement",
  );

  check(
    inventoryBalanceAfter ===
      inventoryBalanceBefore,
    "Supplier Bill changed InventoryBalance",
  );

  /*
   * ----------------------------------------------------------
   * DUPLICATE POSTING PROTECTION
   * ----------------------------------------------------------
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
    if (
      error instanceof
      SupplierBillPostingError
    ) {
      duplicateRejected = true;
      duplicateCode = error.code;
    } else {
      throw error;
    }
  }

  check(
    duplicateRejected,
    "Duplicate posting was not rejected",
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

  check(
    finalLedgerCount === 1,
    "Duplicate Supplier Ledger entry detected",
  );

  check(
    finalJournalCount === 1,
    "Duplicate Journal detected",
  );

  /*
   * ----------------------------------------------------------
   * FINAL EVIDENCE
   * ----------------------------------------------------------
   */

  console.log("");
  console.log(
    "============================================================",
  );

  console.log(
    "15R.10K SUPPLIER BILL BEHAVIORAL VERIFICATION: PASS",
  );

  console.log(
    "============================================================",
  );

  console.log("");
  console.log("PERMANENT EVIDENCE");

  console.dir(
    {
      supplierBillId: after.id,
      billNumber: after.billNumber,
      supplierId: after.supplierId,
      status: after.status,
      postedAt: after.postedAt,

      supplierLedgerEntryId:
        ledgerEntry.id,

      journalId:
        journal.id,

      journalNumber:
        journal.journalNumber,

      accounting: {
        inventoryAccount:
          inventory.account.code,

        inventoryDebit:
          inventoryLine.debit.toString(),

        inputTaxAccount:
          inputTax.account.code,

        inputTaxDebit:
          inputTaxLine.debit.toString(),

        accountsPayableAccount:
          ap.account.code,

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

        allJournalEntryIdsMatch:
          journal.lines.every(
            (line) =>
              line.journalEntryId ===
              journal.id,
          ),
      },

      physicalInventory: {
        stockBefore,
        stockAfter,

        inventoryBalanceBefore,
        inventoryBalanceAfter,
      },

      duplicateProtection: {
        rejected:
          duplicateRejected,

        errorCode:
          duplicateCode,

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
    "Supplier Bill posting is behaviorally verified.",
  );

  console.log(
    "Goods Receipt remains the physical inventory receipt event.",
  );

  console.log(
    "DO NOT RERUN 15R.10K.",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10K SUPPLIER BILL BEHAVIORAL VERIFICATION: FAIL",
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });