import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

const JOURNAL_ID =
  "3864c396-ab44-4a68-8f93-768e3aa3d218";

const LEDGER_ID =
  "b5891873-f8e1-4ccf-995c-2c0bf9141f7e";

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

function eq(
  actual: Prisma.Decimal,
  expected: Prisma.Decimal,
): boolean {
  return actual
    .toDecimalPlaces(4)
    .equals(expected.toDecimalPlaces(4));
}

async function main(): Promise<void> {
  console.log(
    "=== 15R.10U SUPPLIER BILL ACCOUNTING EVIDENCE ===",
  );

  const bill = await prisma.supplierBill.findUnique({
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

  assert(bill, "Supplier Bill not found");
  assert(bill.status === "POSTED", "Bill is not POSTED");
  assert(bill.postedAt !== null, "Bill postedAt is null");
  assert(eq(bill.subtotal, NET), "Subtotal mismatch");
  assert(eq(bill.taxTotal, TAX), "Tax mismatch");
  assert(eq(bill.total, TOTAL), "Total mismatch");
  assert(eq(bill.amountPaid, ZERO), "amountPaid mismatch");
  assert(eq(bill.balanceDue, TOTAL), "balanceDue mismatch");

  assert(
    bill.items.length === 1,
    `Expected 1 item, found ${bill.items.length}`,
  );

  const productId = bill.items[0]!.productId;

  assert(productId, "Product ID missing");

  const ledger =
    await prisma.supplierLedgerEntry.findUnique({
      where: {
        id: LEDGER_ID,
      },
    });

  assert(ledger, "Supplier Ledger entry missing");

  assert(
    ledger.tenantId === TENANT_ID,
    "Supplier Ledger tenant mismatch",
  );

  assert(
    ledger.supplierId === bill.supplierId,
    "Supplier Ledger supplier mismatch",
  );

  assert(
    ledger.referenceType === "SUPPLIER_BILL",
    "Supplier Ledger referenceType mismatch",
  );

  assert(
    ledger.referenceId === BILL_ID,
    "Supplier Ledger referenceId mismatch",
  );

  assert(
    ledger.entryType === "BILL",
    "Supplier Ledger entryType mismatch",
  );

  assert(eq(ledger.debit, ZERO), "Ledger debit mismatch");
  assert(eq(ledger.credit, TOTAL), "Ledger credit mismatch");

  const journal =
    await prisma.journalEntry.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: JOURNAL_ID,
        },
      },
      include: {
        lines: true,
      },
    });

  assert(journal, "Journal not found");
  assert(journal.status === "POSTED", "Journal not POSTED");

  assert(
    journal.sourceType === "SUPPLIER_BILL",
    "Journal sourceType mismatch",
  );

  assert(
    journal.sourceId === BILL_ID,
    "Journal sourceId mismatch",
  );

  assert(
    journal.lines.length === 3,
    `Expected 3 JournalLines, found ${journal.lines.length}`,
  );

  for (const line of journal.lines) {
    assert(
      line.tenantId === TENANT_ID,
      `JournalLine ${line.id} tenant mismatch`,
    );

    assert(
      line.journalEntryId === JOURNAL_ID,
      `JournalLine ${line.id} journal mismatch`,
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
    (m) => m.purpose === "INVENTORY",
  );

  const inputTax = mappings.find(
    (m) => m.purpose === "INPUT_TAX",
  );

  const ap = mappings.find(
    (m) => m.purpose === "ACCOUNTS_PAYABLE",
  );

  assert(inventory, "INVENTORY mapping missing");
  assert(inputTax, "INPUT_TAX mapping missing");
  assert(ap, "ACCOUNTS_PAYABLE mapping missing");

  const inventoryLine = journal.lines.find(
    (line) => line.accountId === inventory.accountId,
  );

  const inputTaxLine = journal.lines.find(
    (line) => line.accountId === inputTax.accountId,
  );

  const apLine = journal.lines.find(
    (line) => line.accountId === ap.accountId,
  );

  assert(inventoryLine, "Inventory line missing");
  assert(inputTaxLine, "Input Tax line missing");
  assert(apLine, "AP line missing");

  assert(eq(inventoryLine.debit, NET), "Inventory DR != 1000");
  assert(eq(inventoryLine.credit, ZERO), "Inventory CR != 0");

  assert(eq(inputTaxLine.debit, TAX), "Input Tax DR != 150");
  assert(eq(inputTaxLine.credit, ZERO), "Input Tax CR != 0");

  assert(eq(apLine.debit, ZERO), "AP DR != 0");
  assert(eq(apLine.credit, TOTAL), "AP CR != 1150");

  assert(
    apLine.supplierId === bill.supplierId,
    "AP supplier dimension mismatch",
  );

  const debits = journal.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    ZERO,
  );

  const credits = journal.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    ZERO,
  );

  assert(eq(debits, TOTAL), "Total debits != 1150");
  assert(eq(credits, TOTAL), "Total credits != 1150");
  assert(eq(debits, credits), "Journal is not balanced");

  const supplierLedgerCount =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: BILL_ID,
      },
    });

  const journalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: BILL_ID,
      },
    });

  assert(
    supplierLedgerCount === 1,
    `Expected 1 Supplier Ledger entry, found ${supplierLedgerCount}`,
  );

  assert(
    journalCount === 1,
    `Expected 1 Journal, found ${journalCount}`,
  );

  const stockMovementCount =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId,
      },
    });

  const inventoryBalanceCount =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId,
      },
    });

  assert(
    stockMovementCount === 0,
    `Unexpected StockMovement count ${stockMovementCount}`,
  );

  assert(
    inventoryBalanceCount === 0,
    `Unexpected InventoryBalance count ${inventoryBalanceCount}`,
  );

  console.log("");
  console.log("PERMANENT ACCOUNTING EVIDENCE");

  console.dir(
    {
      supplierBill: {
        id: bill.id,
        billNumber: bill.billNumber,
        status: bill.status,
        postedAt: bill.postedAt,
        subtotal: bill.subtotal.toString(),
        taxTotal: bill.taxTotal.toString(),
        total: bill.total.toString(),
        amountPaid: bill.amountPaid.toString(),
        balanceDue: bill.balanceDue.toString(),
      },

      supplierLedger: {
        id: ledger.id,
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
        inventoryAccount:
          `${inventory.account.code} ${inventory.account.name}`,

        inventoryDebit:
          inventoryLine.debit.toString(),

        inputTaxAccount:
          `${inputTax.account.code} ${inputTax.account.name}`,

        inputTaxDebit:
          inputTaxLine.debit.toString(),

        accountsPayableAccount:
          `${ap.account.code} ${ap.account.name}`,

        accountsPayableCredit:
          apLine.credit.toString(),

        totalDebits:
          debits.toString(),

        totalCredits:
          credits.toString(),
      },

      tenantIntegrity: {
        journalTenantId: journal.tenantId,

        lineTenantIds:
          journal.lines.map((line) => line.tenantId),

        lineJournalEntryIds:
          journal.lines.map(
            (line) => line.journalEntryId,
          ),
      },

      idempotency: {
        supplierLedgerCount,
        journalCount,
      },

      physicalInventory: {
        stockMovementCount,
        inventoryBalanceCount,
      },
    },
    { depth: null },
  );

  console.log("");
  console.log(
    "15R.10U SUPPLIER BILL ACCOUNTING EVIDENCE: PASS",
  );

  console.log("Supplier Bill: VERIFIED");
  console.log("Supplier Subledger: VERIFIED");
  console.log("Inventory DR 1000: VERIFIED");
  console.log("Input Tax DR 150: VERIFIED");
  console.log("Accounts Payable CR 1150: VERIFIED");
  console.log("Balanced Journal: VERIFIED");
  console.log("Tenant Integrity: VERIFIED");
  console.log("Source Idempotency: VERIFIED");
  console.log("Physical Inventory Separation: VERIFIED");
  console.log("Database mutations: NONE");
}

main()
  .catch((error) => {
    console.error("");
    console.error("15R.10U: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });