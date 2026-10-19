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

const TEST_DATE = new Date("2098-07-01T00:00:00.000Z");

const ZERO = new Prisma.Decimal(0);
const SUBTOTAL = new Prisma.Decimal("1000.0000");
const TAX = new Prisma.Decimal("150.0000");
const TOTAL = new Prisma.Decimal("1150.0000");

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

function sameMoney(
  left: Prisma.Decimal,
  right: Prisma.Decimal,
): boolean {
  return left.toDecimalPlaces(4).equals(
    right.toDecimalPlaces(4),
  );
}

async function main(): Promise<void> {
  console.log(
    "=== 15R.10 SUPPLIER BILL BEHAVIORAL TEST ===",
  );

  /*
   * Ensure the permanent evidence is not accidentally
   * recreated by rerunning this test.
   */
  const existingEvidence =
    await prisma.supplierBill.findFirst({
      where: {
        tenantId: TENANT_ID,
        billNumber: {
          startsWith: "BILL-APTEST-2098-",
        },
      },
      select: {
        id: true,
        billNumber: true,
      },
    });

  if (existingEvidence) {
    throw new Error(
      `PERMANENT_TEST_EVIDENCE_ALREADY_EXISTS: ${existingEvidence.billNumber}`,
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: {
      id: TENANT_ID,
    },
    select: {
      id: true,
      baseCurrencyCode: true,
    },
  });

  assert(tenant, "Test tenant must exist");
  assert(
    tenant.baseCurrencyCode === "GHS",
    "Test tenant base currency must be GHS",
  );

  const branch = await prisma.branch.findFirst({
    where: {
      id: BRANCH_ID,
      tenantId: TENANT_ID,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  assert(branch, "Active HO test branch must exist");

  const user = await prisma.user.findUnique({
    where: {
      id: POSTED_BY_ID,
    },
    select: {
      id: true,
    },
  });

  assert(user, "Posting test user must exist");

  /*
   * Verify the three accounting mappings before creating
   * permanent evidence.
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
            code: true,
            name: true,
            status: true,
          },
        },
      },
    });

  console.log("");
  console.log("ACCOUNTING MAPPINGS");
  console.dir(mappings, { depth: null });

  const apMapping = mappings.find(
    (mapping) =>
      mapping.purpose === "ACCOUNTS_PAYABLE",
  );

  const inventoryMapping = mappings.find(
    (mapping) =>
      mapping.purpose === "INVENTORY",
  );

  const inputTaxMapping = mappings.find(
    (mapping) =>
      mapping.purpose === "INPUT_TAX",
  );

  assert(apMapping, "AP mapping must exist");
  assert(
    inventoryMapping,
    "Inventory mapping must exist",
  );
  assert(
    inputTaxMapping,
    "Input Tax mapping must exist",
  );

  assert(
    apMapping.account.status === "ACTIVE",
    "AP account must be active",
  );

  assert(
    inventoryMapping.account.status === "ACTIVE",
    "Inventory account must be active",
  );

  assert(
    inputTaxMapping.account.status === "ACTIVE",
    "Input Tax account must be active",
  );

  const token =
    `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

  /*
   * Fixture creation is atomic. If fixture creation itself
   * fails, no partial supplier/product/bill remains.
   */
  const fixture = await prisma.$transaction(
    async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          tenantId: TENANT_ID,
          supplierCode: `APTEST-${token}`,
          name: `15R AP Test Supplier ${token}`,
          paymentTermsDays: 30,
          currencyCode: "GHS",
          status: "ACTIVE",
          notes:
            "Permanent 15R.10 Supplier Bill posting evidence.",
        },
        select: {
          id: true,
          supplierCode: true,
        },
      });

      const product = await tx.product.create({
        data: {
          tenantId: TENANT_ID,
          sku: `APTEST-${token}`,
          name: `15R Inventory Test Product ${token}`,
          description:
            "Permanent 15R.10 inventory purchasing evidence.",
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

      const bill = await tx.supplierBill.create({
        data: {
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          supplierId: supplier.id,
          billNumber: `BILL-APTEST-2098-${token}`,
          supplierInvoiceNumber:
            `SUP-INV-2098-${token}`,
          billDate: TEST_DATE,
          dueDate:
            new Date("2098-07-31T00:00:00.000Z"),
          currencyCode: "GHS",
          exchangeRate: new Prisma.Decimal(1),
          subtotal: SUBTOTAL,
          taxTotal: TAX,
          total: TOTAL,
          amountPaid: ZERO,
          balanceDue: TOTAL,
          status: "DRAFT",
          items: {
            create: {
              tenantId: TENANT_ID,
              productId: product.id,
              description:
                "15R inventory purchasing test item",
              quantity: new Prisma.Decimal(1),
              unitCost: SUBTOTAL,
              taxRate: new Prisma.Decimal("15.000000"),
              taxAmount: TAX,
              lineTotal: TOTAL,
            },
          },
        },
        select: {
          id: true,
          billNumber: true,
        },
      });

      return {
        supplier,
        product,
        bill,
      };
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  console.log("");
  console.log("FIXTURE CREATED");
  console.dir(fixture, { depth: null });

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

  assert(
    stockBefore === 0,
    "New test product must start with no stock movements",
  );

  assert(
    balancesBefore === 0,
    "New test product must start with no inventory balance",
  );

  console.log("");
  console.log("=== POST SUPPLIER BILL ===");

  const result = await postSupplierBill({
    tenantId: TENANT_ID,
    supplierBillId: fixture.bill.id,
    postedById: POSTED_BY_ID,
  });

  console.dir(result, { depth: null });

  assert(
    result.supplierBillId === fixture.bill.id,
    "Returned Supplier Bill ID mismatch",
  );

  assert(
    result.status === "POSTED",
    "Posting result must be POSTED",
  );

  assert(
    sameMoney(result.total, TOTAL),
    "Posting result total must equal 1150",
  );

  /*
   * Read permanent evidence after commit.
   */
  const postedBill =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: fixture.bill.id,
        },
      },
      select: {
        id: true,
        billNumber: true,
        status: true,
        postedAt: true,
        subtotal: true,
        taxTotal: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
      },
    });

  assert(postedBill, "Posted bill must exist");

  assert(
    postedBill.status === "POSTED",
    "Supplier Bill must be POSTED",
  );

  assert(
    postedBill.postedAt !== null,
    "Supplier Bill postedAt must be populated",
  );

  assert(
    sameMoney(postedBill.subtotal, SUBTOTAL),
    "Supplier Bill subtotal must remain 1000",
  );

  assert(
    sameMoney(postedBill.taxTotal, TAX),
    "Supplier Bill tax must remain 150",
  );

  assert(
    sameMoney(postedBill.total, TOTAL),
    "Supplier Bill total must remain 1150",
  );

  assert(
    sameMoney(postedBill.amountPaid, ZERO),
    "Supplier Bill amountPaid must remain 0",
  );

  assert(
    sameMoney(postedBill.balanceDue, TOTAL),
    "Supplier Bill balanceDue must remain 1150",
  );

  const supplierLedger =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: fixture.bill.id,
      },
      select: {
        id: true,
        supplierId: true,
        branchId: true,
        entryType: true,
        referenceType: true,
        referenceId: true,
        debit: true,
        credit: true,
        currencyCode: true,
      },
    });

  console.log("");
  console.log("SUPPLIER LEDGER EVIDENCE");
  console.dir(supplierLedger, { depth: null });

  assert(
    supplierLedger.length === 1,
    "Exactly one Supplier Ledger entry must exist",
  );

  const ledger = supplierLedger[0]!;

  assert(
    ledger.supplierId === fixture.supplier.id,
    "Supplier Ledger supplier mismatch",
  );

  assert(
    ledger.branchId === BRANCH_ID,
    "Supplier Ledger branch mismatch",
  );

  assert(
    ledger.entryType === "BILL",
    "Supplier Ledger entryType must be BILL",
  );

  assert(
    ledger.referenceType === "SUPPLIER_BILL",
    "Supplier Ledger referenceType mismatch",
  );

  assert(
    sameMoney(ledger.debit, ZERO),
    "Supplier Ledger debit must be 0",
  );

  assert(
    sameMoney(ledger.credit, TOTAL),
    "Supplier Ledger credit must be 1150",
  );

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: fixture.bill.id,
      },
      select: {
        id: true,
        journalNumber: true,
        status: true,
        sourceType: true,
        sourceId: true,
        lines: {
          select: {
            accountId: true,
            supplierId: true,
            debit: true,
            credit: true,
          },
        },
      },
    });

  console.log("");
  console.log("GENERAL LEDGER EVIDENCE");
  console.dir(journals, { depth: null });

  assert(
    journals.length === 1,
    "Exactly one journal must exist",
  );

  const journal = journals[0]!;

  assert(
    journal.status === "POSTED",
    "Journal must be POSTED",
  );

  assert(
    journal.lines.length === 3,
    "Supplier Bill journal must contain exactly 3 lines",
  );

  const inventoryLine = journal.lines.find(
    (line) =>
      line.accountId === inventoryMapping.accountId,
  );

  const inputTaxLine = journal.lines.find(
    (line) =>
      line.accountId === inputTaxMapping.accountId,
  );

  const apLine = journal.lines.find(
    (line) =>
      line.accountId === apMapping.accountId,
  );

  assert(
    inventoryLine,
    "Inventory journal line must exist",
  );

  assert(
    inputTaxLine,
    "Input Tax journal line must exist",
  );

  assert(
    apLine,
    "Accounts Payable journal line must exist",
  );

  assert(
    sameMoney(inventoryLine.debit, SUBTOTAL) &&
      sameMoney(inventoryLine.credit, ZERO),
    "Inventory must be DR 1000 / CR 0",
  );

  assert(
    sameMoney(inputTaxLine.debit, TAX) &&
      sameMoney(inputTaxLine.credit, ZERO),
    "Input Tax must be DR 150 / CR 0",
  );

  assert(
    sameMoney(apLine.debit, ZERO) &&
      sameMoney(apLine.credit, TOTAL),
    "Accounts Payable must be DR 0 / CR 1150",
  );

  assert(
    apLine.supplierId === fixture.supplier.id,
    "AP journal line must carry supplier dimension",
  );

  const totalDebit = journal.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    ZERO,
  );

  const totalCredit = journal.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    ZERO,
  );

  assert(
    sameMoney(totalDebit, TOTAL),
    "Journal debit total must be 1150",
  );

  assert(
    sameMoney(totalCredit, TOTAL),
    "Journal credit total must be 1150",
  );

  /*
   * Critical architectural assertion:
   * Supplier Bill posting must not receive physical stock.
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

  console.log("");
  console.log("INVENTORY SIDE-EFFECT CHECK");
  console.dir({
    stockBefore,
    stockAfter,
    balancesBefore,
    balancesAfter,
  });

  assert(
    stockAfter === stockBefore,
    "Supplier Bill posting must not create StockMovement",
  );

  assert(
    balancesAfter === balancesBefore,
    "Supplier Bill posting must not mutate InventoryBalance",
  );

  /*
   * Duplicate posting must fail and must not create
   * additional financial records.
   */
  console.log("");
  console.log("=== DUPLICATE POSTING TEST ===");

  let duplicateRejected = false;

  try {
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId: fixture.bill.id,
      postedById: POSTED_BY_ID,
    });
  } catch (error) {
    duplicateRejected =
      error instanceof SupplierBillPostingError &&
      (
        error.code === "SUPPLIER_BILL_NOT_POSTABLE" ||
        error.code === "DUPLICATE_SOURCE"
      );

    console.log(
      "Duplicate rejection:",
      error instanceof SupplierBillPostingError
        ? {
            name: error.name,
            code: error.code,
            message: error.message,
          }
        : error,
    );
  }

  assert(
    duplicateRejected,
    "Duplicate Supplier Bill posting must be rejected",
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
    "Duplicate attempt must leave exactly one Supplier Ledger entry",
  );

  assert(
    finalJournalCount === 1,
    "Duplicate attempt must leave exactly one journal",
  );

  console.log("");
  console.log("==================================================");
  console.log("15R.10 SUPPLIER BILL BEHAVIORAL TEST: PASS");
  console.log("==================================================");

  console.log("Permanent evidence:");
  console.dir(
    {
      supplierId: fixture.supplier.id,
      supplierCode: fixture.supplier.supplierCode,
      productId: fixture.product.id,
      sku: fixture.product.sku,
      supplierBillId: fixture.bill.id,
      billNumber: fixture.bill.billNumber,
      supplierLedgerEntryId: ledger.id,
      journalId: journal.id,
      journalNumber: journal.journalNumber,
      accounting: {
        inventoryDebit: "1000.0000",
        inputTaxDebit: "150.0000",
        accountsPayableCredit: "1150.0000",
      },
      stockMovementCreated: false,
      inventoryBalanceCreated: false,
      duplicateProtection: {
        supplierLedgerEntries: finalLedgerCount,
        journals: finalJournalCount,
      },
    },
    { depth: null },
  );

  console.log("");
  console.log(
    "IMPORTANT: Permanent 2098 evidence was intentionally retained.",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10 SUPPLIER BILL BEHAVIORAL TEST: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });