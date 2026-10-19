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

function equalMoney(
  actual: Prisma.Decimal,
  expected: Prisma.Decimal,
): boolean {
  return actual
    .toDecimalPlaces(4)
    .equals(expected.toDecimalPlaces(4));
}

async function main(): Promise<void> {
  console.log(
    "=== 15R.10N SUPPLIER BILL BEHAVIORAL VERIFICATION ===",
  );

  /*
   * --------------------------------------------------------
   * PRE-POSTING SAFETY
   * --------------------------------------------------------
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
    `Expected 1 item, found ${before.items.length}`,
  );

  assert(
    equalMoney(before.subtotal, NET),
    "Subtotal must be 1000",
  );

  assert(
    equalMoney(before.taxTotal, TAX),
    "Tax must be 150",
  );

  assert(
    equalMoney(before.total, TOTAL),
    "Total must be 1150",
  );

  assert(
    equalMoney(before.amountPaid, ZERO),
    "amountPaid must be zero",
  );

  assert(
    equalMoney(before.balanceDue, TOTAL),
    "balanceDue must be 1150",
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

  assert(
    ledgerBefore === 0,
    "Supplier Ledger evidence already exists",
  );

  assert(
    journalBefore === 0,
    "Journal evidence already exists",
  );

  const item = before.items[0]!;

  assert(
    item.productId !== null,
    "Bill item productId is required",
  );

  const stockBefore =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId!,
      },
    });

  const balancesBefore =
    await prisma.inventoryBalance.findMany({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId!,
      },
      select: {
        id: true,
        quantityOnHand: true,
        quantityReserved: true,
        averageCost: true,
        totalValue: true,
      },
      orderBy: {
        id: "asc",
      },
    });

  console.log("");
  console.log("PRE-POSTING SAFETY: PASS");

  console.dir(
    {
      billId: before.id,
      billNumber: before.billNumber,
      status: before.status,
      supplierId: before.supplierId,
      productId: item.productId,
      subtotal: before.subtotal.toString(),
      taxTotal: before.taxTotal.toString(),
      total: before.total.toString(),
      supplierLedgerCount: ledgerBefore,
      journalCount: journalBefore,
      stockMovementCount: stockBefore,
      inventoryBalanceCount: balancesBefore.length,
    },
    { depth: null },
  );

  /*
   * --------------------------------------------------------
   * SINGLE PRODUCTION POST
   * --------------------------------------------------------
   */

  console.log("");
  console.log("EXECUTING postSupplierBill() EXACTLY ONCE");

  const result = await postSupplierBill({
    tenantId: TENANT_ID,
    supplierBillId: BILL_ID,
    postedById: USER_ID,
  });

  console.log("");
  console.log("POSTING SERVICE RESULT");
  console.dir(result, { depth: null });

  /*
   * --------------------------------------------------------
   * VERIFY BUSINESS DOCUMENT
   * --------------------------------------------------------
   */

  const after = await prisma.supplierBill.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: BILL_ID,
      },
    },
  });

  assert(after, "Supplier Bill missing after posting");

  assert(
    after.status === "POSTED",
    `Expected POSTED, found ${after.status}`,
  );

  assert(
    after.postedAt !== null,
    "postedAt was not populated",
  );

  assert(
    equalMoney(after.subtotal, NET),
    "Posted subtotal changed",
  );

  assert(
    equalMoney(after.taxTotal, TAX),
    "Posted tax changed",
  );

  assert(
    equalMoney(after.total, TOTAL),
    "Posted total changed",
  );

  assert(
    equalMoney(after.amountPaid, ZERO),
    "amountPaid must remain zero",
  );

  assert(
    equalMoney(after.balanceDue, TOTAL),
    "balanceDue must remain 1150",
  );

  /*
   * --------------------------------------------------------
   * VERIFY SUPPLIER SUBLEDGER
   * --------------------------------------------------------
   */

  const ledgerEntries =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: BILL_ID,
      },
    });

  assert(
    ledgerEntries.length === 1,
    `Expected 1 Supplier Ledger entry, found ${ledgerEntries.length}`,
  );

  const ledger = ledgerEntries[0]!;

  assert(
    ledger.supplierId === before.supplierId,
    "Supplier Ledger supplier mismatch",
  );

  assert(
    ledger.entryType === "BILL",
    `Unexpected ledger entryType ${ledger.entryType}`,
  );

  assert(
    equalMoney(ledger.debit, ZERO),
    "Supplier Ledger debit must be 0",
  );

  assert(
    equalMoney(ledger.credit, TOTAL),
    "Supplier Ledger credit must be 1150",
  );

  /*
   * --------------------------------------------------------
   * VERIFY GL
   * --------------------------------------------------------
   */

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: BILL_ID,
      },
      include: {
        lines: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

  assert(
    journals.length === 1,
    `Expected 1 Journal, found ${journals.length}`,
  );

  const journal = journals[0]!;

  assert(
    journal.status === "POSTED",
    `Expected POSTED Journal, found ${journal.status}`,
  );

  assert(
    journal.lines.length === 3,
    `Expected 3 JournalLines, found ${journal.lines.length}`,
  );

  for (const line of journal.lines) {
    assert(
      line.tenantId === TENANT_ID,
      `Wrong tenantId on JournalLine ${line.id}`,
    );

    assert(
      line.journalEntryId === journal.id,
      `Wrong journalEntryId on JournalLine ${line.id}`,
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

  assert(inventory, "Inventory mapping missing");
  assert(inputTax, "Input Tax mapping missing");
  assert(ap, "AP mapping missing");

  const inventoryLine = journal.lines.find(
    (line) =>
      line.accountId === inventory.accountId,
  );

  const taxLine = journal.lines.find(
    (line) =>
      line.accountId === inputTax.accountId,
  );

  const apLine = journal.lines.find(
    (line) =>
      line.accountId === ap.accountId,
  );

  assert(inventoryLine, "Inventory line missing");
  assert(taxLine, "Input Tax line missing");
  assert(apLine, "AP line missing");

  assert(
    equalMoney(inventoryLine.debit, NET),
    "Inventory debit must be 1000",
  );

  assert(
    equalMoney(inventoryLine.credit, ZERO),
    "Inventory credit must be zero",
  );

  assert(
    equalMoney(taxLine.debit, TAX),
    "Input Tax debit must be 150",
  );

  assert(
    equalMoney(taxLine.credit, ZERO),
    "Input Tax credit must be zero",
  );

  assert(
    equalMoney(apLine.debit, ZERO),
    "AP debit must be zero",
  );

  assert(
    equalMoney(apLine.credit, TOTAL),
    "AP credit must be 1150",
  );

  assert(
    apLine.supplierId === before.supplierId,
    "AP supplier dimension is incorrect",
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
    equalMoney(totalDebits, TOTAL),
    "Journal debit total must be 1150",
  );

  assert(
    equalMoney(totalCredits, TOTAL),
    "Journal credit total must be 1150",
  );

  assert(
    equalMoney(totalDebits, totalCredits),
    "Journal is not balanced",
  );

  /*
   * --------------------------------------------------------
   * VERIFY NO PHYSICAL INVENTORY RECEIPT
   * --------------------------------------------------------
   */

  const stockAfter =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId!,
      },
    });

  const balancesAfter =
    await prisma.inventoryBalance.findMany({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId!,
      },
      select: {
        id: true,
        quantityOnHand: true,
        quantityReserved: true,
        averageCost: true,
        totalValue: true,
      },
      orderBy: {
        id: "asc",
      },
    });

  assert(
    stockAfter === stockBefore,
    "Supplier Bill created a physical StockMovement",
  );

  assert(
    balancesAfter.length === balancesBefore.length,
    "InventoryBalance row count changed",
  );

  for (let index = 0; index < balancesBefore.length; index++) {
    const oldBalance = balancesBefore[index]!;
    const newBalance = balancesAfter[index]!;

    assert(
      oldBalance.id === newBalance.id,
      "InventoryBalance identity changed",
    );

    assert(
      oldBalance.quantityOnHand.equals(
        newBalance.quantityOnHand,
      ),
      "quantityOnHand changed",
    );

    assert(
      oldBalance.quantityReserved.equals(
        newBalance.quantityReserved,
      ),
      "quantityReserved changed",
    );

    assert(
      oldBalance.averageCost.equals(
        newBalance.averageCost,
      ),
      "averageCost changed",
    );

    assert(
      oldBalance.totalValue.equals(
        newBalance.totalValue,
      ),
      "Inventory totalValue changed",
    );
  }

  /*
   * --------------------------------------------------------
   * DUPLICATE PROTECTION
   * --------------------------------------------------------
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
    "Duplicate Supplier Ledger entry exists",
  );

  assert(
    finalJournalCount === 1,
    "Duplicate Journal exists",
  );

  console.log("");
  console.log(
    "============================================================",
  );

  console.log(
    "15R.10N SUPPLIER BILL BEHAVIORAL VERIFICATION: PASS",
  );

  console.log(
    "============================================================",
  );

  console.log("");
  console.log("PERMANENT POSTING EVIDENCE");

  console.dir(
    {
      supplierBill: {
        id: after.id,
        billNumber: after.billNumber,
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
        inventoryAccount: inventory.account.code,
        inventoryDebit:
          inventoryLine.debit.toString(),

        inputTaxAccount: inputTax.account.code,
        inputTaxDebit:
          taxLine.debit.toString(),

        accountsPayableAccount: ap.account.code,
        accountsPayableCredit:
          apLine.credit.toString(),

        totalDebits: totalDebits.toString(),
        totalCredits: totalCredits.toString(),
      },

      tenantIntegrity: {
        journalTenantId: journal.tenantId,
        lineTenantIds:
          journal.lines.map(
            (line) => line.tenantId,
          ),
        journalEntryIds:
          journal.lines.map(
            (line) => line.journalEntryId,
          ),
      },

      physicalInventory: {
        stockMovementBefore: stockBefore,
        stockMovementAfter: stockAfter,
        inventoryBalanceRowsBefore:
          balancesBefore.length,
        inventoryBalanceRowsAfter:
          balancesAfter.length,
      },

      duplicateProtection: {
        rejected: duplicateRejected,
        errorCode: duplicateCode,
        supplierLedgerCount:
          finalLedgerCount,
        journalCount:
          finalJournalCount,
      },
    },
    { depth: null },
  );

  console.log("");
  console.log(
    "Supplier Bill accounting: VERIFIED",
  );

  console.log(
    "Tenant-safe JournalLine persistence: VERIFIED",
  );

  console.log(
    "Physical inventory separation: VERIFIED",
  );

  console.log(
    "Duplicate protection: VERIFIED",
  );

  console.log("");
  console.log("DO NOT RERUN 15R.10N.");
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10N SUPPLIER BILL BEHAVIORAL VERIFICATION: FAIL",
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });