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
  new Date("2098-07-02T00:00:00.000Z");

const DUE_DATE =
  new Date("2098-08-01T00:00:00.000Z");

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

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
    .equals(
      right.toDecimalPlaces(4),
    );
}

async function main(): Promise<void> {
  console.log(
    "=== 15R.10B SUPPLIER BILL BEHAVIORAL TEST ===",
  );

  /*
   * Fail closed if any successful 15R.10B evidence
   * already exists.
   */
  const priorEvidence =
    await prisma.supplierBill.findFirst({
      where: {
        tenantId: TENANT_ID,
        billNumber: {
          startsWith:
            "BILL-APTEST-B-2098-",
        },
      },
      select: {
        id: true,
        billNumber: true,
        status: true,
      },
    });

  if (priorEvidence) {
    throw new Error(
      `PERMANENT_15R10B_EVIDENCE_ALREADY_EXISTS: ${priorEvidence.billNumber}`,
    );
  }

  /*
   * Verify tenant / branch / user before mutations.
   */
  const tenant =
    await prisma.tenant.findUnique({
      where: {
        id: TENANT_ID,
      },
      select: {
        id: true,
        baseCurrencyCode: true,
      },
    });

  assert(
    tenant,
    "Test tenant must exist",
  );

  assert(
    tenant.baseCurrencyCode === "GHS",
    "Test tenant base currency must be GHS",
  );

  const branch =
    await prisma.branch.findFirst({
      where: {
        id: BRANCH_ID,
        tenantId: TENANT_ID,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

  assert(
    branch,
    "Active test branch must exist",
  );

  const user =
    await prisma.user.findUnique({
      where: {
        id: POSTED_BY_ID,
      },
      select: {
        id: true,
      },
    });

  assert(
    user,
    "Posting user must exist",
  );

  /*
   * Verify accounting mappings before fixture creation.
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

  const apMapping =
    mappings.find(
      (mapping) =>
        mapping.purpose ===
        "ACCOUNTS_PAYABLE",
    );

  const inventoryMapping =
    mappings.find(
      (mapping) =>
        mapping.purpose ===
        "INVENTORY",
    );

  const inputTaxMapping =
    mappings.find(
      (mapping) =>
        mapping.purpose ===
        "INPUT_TAX",
    );

  assert(
    apMapping,
    "Accounts Payable mapping must exist",
  );

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

  console.log("");
  console.log("ACCOUNTING MAPPINGS");
  console.dir(
    {
      accountsPayable: apMapping,
      inventory: inventoryMapping,
      inputTax: inputTaxMapping,
    },
    { depth: null },
  );

  const token =
    `${Date.now()}-${Math.floor(
      Math.random() * 1000000,
    )}`;

  /*
   * Fixture construction remains atomic.
   *
   * IMPORTANT:
   * SupplierBill and SupplierBillItem are created
   * separately to avoid Prisma nested-create relation
   * inference removing tenantId from the nested input.
   */
  const fixture =
    await prisma.$transaction(
      async (tx) => {
        const supplier =
          await tx.supplier.create({
            data: {
              tenantId: TENANT_ID,
              supplierCode:
                `APTEST-B-${token}`,
              name:
                `15R.10B AP Test Supplier ${token}`,
              paymentTermsDays: 30,
              currencyCode: "GHS",
              status: "ACTIVE",
              notes:
                "Permanent 15R.10B Supplier Bill posting evidence.",
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
                `APTEST-B-${token}`,
              name:
                `15R.10B Inventory Product ${token}`,
              description:
                "Permanent Supplier Bill posting test product.",
              type: "INVENTORY",
              defaultPurchasePrice:
                SUBTOTAL,
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
                `BILL-APTEST-B-2098-${token}`,
              supplierInvoiceNumber:
                `SUP-INV-B-2098-${token}`,
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
                "15R.10B inventory purchasing test item",
              quantity:
                new Prisma.Decimal("1.0000"),
              unitCost: SUBTOTAL,
              taxRate:
                new Prisma.Decimal(
                  "15.000000",
                ),
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
  console.dir(
    fixture,
    { depth: null },
  );

  /*
   * Verify fixture state before production posting.
   */
  const draftBill =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: fixture.bill.id,
        },
      },
      select: {
        id: true,
        status: true,
        postedAt: true,
        amountPaid: true,
        balanceDue: true,
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitCost: true,
            taxAmount: true,
            lineTotal: true,
          },
        },
      },
    });

  assert(
    draftBill,
    "Draft Supplier Bill must exist",
  );

  assert(
    draftBill.status === "DRAFT",
    "Fixture Supplier Bill must begin DRAFT",
  );

  assert(
    draftBill.postedAt === null,
    "Draft bill postedAt must be null",
  );

  assert(
    draftBill.items.length === 1,
    "Fixture must contain exactly one item",
  );

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

  assert(
    stockBefore === 0,
    "Test product must begin with no StockMovement",
  );

  assert(
    balanceBefore === 0,
    "Test product must begin with no InventoryBalance",
  );

  console.log("");
  console.log(
    "=== CALL PRODUCTION postSupplierBill ===",
  );

  const result =
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId:
        fixture.bill.id,
      postedById: POSTED_BY_ID,
    });

  console.log("");
  console.log("POSTING RESULT");
  console.dir(
    result,
    { depth: null },
  );

  assert(
    result.supplierBillId ===
      fixture.bill.id,
    "Returned Supplier Bill ID mismatch",
  );

  assert(
    result.status === "POSTED",
    "Posting result must be POSTED",
  );

  assert(
    sameMoney(
      result.total,
      TOTAL,
    ),
    "Posting result total must be 1150",
  );

  assert(
    sameMoney(
      result.amountPaid,
      ZERO,
    ),
    "Posting result amountPaid must be 0",
  );

  assert(
    sameMoney(
      result.balanceDue,
      TOTAL,
    ),
    "Posting result balanceDue must be 1150",
  );

  /*
   * Verify posted source document.
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
        supplierId: true,
        branchId: true,
        currencyCode: true,
        exchangeRate: true,
        subtotal: true,
        taxTotal: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        postedAt: true,
      },
    });

  assert(
    postedBill,
    "Posted Supplier Bill must exist",
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
    postedBill.supplierId ===
      fixture.supplier.id,
    "Supplier Bill supplier mismatch",
  );

  assert(
    postedBill.branchId === BRANCH_ID,
    "Supplier Bill branch mismatch",
  );

  assert(
    postedBill.currencyCode === "GHS",
    "Supplier Bill currency must remain GHS",
  );

  assert(
    postedBill.exchangeRate.equals(ONE),
    "Supplier Bill exchange rate must remain 1",
  );

  assert(
    sameMoney(
      postedBill.subtotal,
      SUBTOTAL,
    ),
    "Supplier Bill subtotal must be 1000",
  );

  assert(
    sameMoney(
      postedBill.taxTotal,
      TAX,
    ),
    "Supplier Bill tax must be 150",
  );

  assert(
    sameMoney(
      postedBill.total,
      TOTAL,
    ),
    "Supplier Bill total must be 1150",
  );

  assert(
    sameMoney(
      postedBill.amountPaid,
      ZERO,
    ),
    "Supplier Bill amountPaid must remain 0",
  );

  assert(
    sameMoney(
      postedBill.balanceDue,
      TOTAL,
    ),
    "Supplier Bill balanceDue must remain 1150",
  );

  /*
   * Supplier subledger verification.
   */
  const supplierLedger =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType:
          "SUPPLIER_BILL",
        referenceId:
          fixture.bill.id,
      },
      select: {
        id: true,
        supplierId: true,
        branchId: true,
        transactionDate: true,
        entryType: true,
        referenceType: true,
        referenceId: true,
        debit: true,
        credit: true,
        currencyCode: true,
      },
    });

  console.log("");
  console.log(
    "SUPPLIER LEDGER EVIDENCE",
  );

  console.dir(
    supplierLedger,
    { depth: null },
  );

  assert(
    supplierLedger.length === 1,
    "Exactly one Supplier Ledger entry must exist",
  );

  const ledger =
    supplierLedger[0]!;

  assert(
    ledger.supplierId ===
      fixture.supplier.id,
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
    ledger.referenceType ===
      "SUPPLIER_BILL",
    "Supplier Ledger referenceType mismatch",
  );

  assert(
    ledger.currencyCode === "GHS",
    "Supplier Ledger currency must be GHS",
  );

  assert(
    sameMoney(
      ledger.debit,
      ZERO,
    ),
    "Supplier Ledger debit must be zero",
  );

  assert(
    sameMoney(
      ledger.credit,
      TOTAL,
    ),
    "Supplier Ledger credit must be 1150",
  );

  /*
   * General Ledger verification.
   */
  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType:
          "SUPPLIER_BILL",
        sourceId:
          fixture.bill.id,
      },
      select: {
        id: true,
        journalNumber: true,
        status: true,
        sourceType: true,
        sourceId: true,
        currencyCode: true,
        lines: {
          select: {
            id: true,
            accountId: true,
            supplierId: true,
            debit: true,
            credit: true,
          },
        },
      },
    });

  console.log("");
  console.log(
    "GENERAL LEDGER EVIDENCE",
  );

  console.dir(
    journals,
    { depth: null },
  );

  assert(
    journals.length === 1,
    "Exactly one Supplier Bill journal must exist",
  );

  const journal =
    journals[0]!;

  assert(
    journal.status === "POSTED",
    "Supplier Bill journal must be POSTED",
  );

  assert(
    journal.sourceType ===
      "SUPPLIER_BILL",
    "Journal sourceType mismatch",
  );

  assert(
    journal.sourceId ===
      fixture.bill.id,
    "Journal sourceId mismatch",
  );

  assert(
    journal.currencyCode === "GHS",
    "Journal currency must be GHS",
  );

  assert(
    journal.lines.length === 3,
    "Supplier Bill journal must contain exactly 3

cd C:\Users\stanl\finatyx

$projectRoot = "C:\Users\stanl\finatyx"

$testPath = Join-Path `
    $projectRoot `
    "15r10b-supplier-bill-behavioral-test.ts"

$servicePath = Join-Path `
    $projectRoot `
    "src\modules\purchasing\supplier-bill-posting.service.ts"

$expectedServiceHash = `
    "18594605691A7D7FFFFEAE75D99FAEE1EC1A75C015B9945755F26FBC0C65F182"

Write-Host "=== 15R.10B CORRECTED SUPPLIER BILL BEHAVIORAL TEST ==="
Write-Host ""

# ------------------------------------------------------------
# 1. FAIL-CLOSED FILE / SERVICE CHECKS
# ------------------------------------------------------------

if (Test-Path -LiteralPath $testPath) {
    Write-Host "ABORTED: 15R.10B test already exists."
    Write-Host "DO NOT RERUN OR DELETE IT."
    exit 1
}

$serviceHash = (
    Get-FileHash `
        -LiteralPath $servicePath `
        -Algorithm SHA256
).Hash

Write-Host "Expected production SHA-256:" $expectedServiceHash
Write-Host "Actual production SHA-256:  " $serviceHash

if ($serviceHash -ne $expectedServiceHash) {
    Write-Host "ABORTED: Production service hash mismatch."
    exit 1
}

# ------------------------------------------------------------
# 2. CREATE CORRECTED TEST
# ------------------------------------------------------------

$content = @'
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
  new Date("2098-07-02T00:00:00.000Z");

const DUE_DATE =
  new Date("2098-08-01T00:00:00.000Z");

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

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
    "=== 15R.10B SUPPLIER BILL BEHAVIORAL TEST ===",
  );

  /*
   * A successful 15R.10B run is permanent evidence.
   * Refuse to create a second one.
   */
  const existingEvidence =
    await prisma.supplierBill.findFirst({
      where: {
        tenantId: TENANT_ID,
        billNumber: {
          startsWith: "BILL-APTEST-15R10B-",
        },
      },
      select: {
        id: true,
        billNumber: true,
        status: true,
      },
    });

  if (existingEvidence) {
    throw new Error(
      `PERMANENT_15R10B_EVIDENCE_ALREADY_EXISTS: ${existingEvidence.billNumber}`,
    );
  }

  /*
   * Validate stable dependencies before any mutation.
   */
  const tenant =
    await prisma.tenant.findUnique({
      where: {
        id: TENANT_ID,
      },
      select: {
        id: true,
        baseCurrencyCode: true,
      },
    });

  assert(
    tenant,
    "Test tenant must exist",
  );

  assert(
    tenant.baseCurrencyCode === "GHS",
    "Tenant base currency must be GHS",
  );

  const branch =
    await prisma.branch.findFirst({
      where: {
        id: BRANCH_ID,
        tenantId: TENANT_ID,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

  assert(
    branch,
    "Active test branch must exist",
  );

  const postingUser =
    await prisma.user.findUnique({
      where: {
        id: POSTED_BY_ID,
      },
      select: {
        id: true,
      },
    });

  assert(
    postingUser,
    "Posting user must exist",
  );

  /*
   * Accounting mappings.
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
    "Accounts Payable account must be active",
  );

  assert(
    inventoryMapping.account.status === "ACTIVE",
    "Inventory account must be active",
  );

  assert(
    inputTaxMapping.account.status === "ACTIVE",
    "Input Tax account must be active",
  );

  console.log("");
  console.log("ACCOUNTING MAPPINGS");
  console.dir(mappings, { depth: null });

  /*
   * Unique permanent evidence token.
   */
  const token =
    `${Date.now()}-${Math.floor(
      Math.random() * 1000000,
    )}`;

  /*
   * IMPORTANT:
   *
   * Supplier, Product, SupplierBill and SupplierBillItem
   * are created inside ONE transaction.
   *
   * SupplierBillItem is created DIRECTLY instead of through
   * SupplierBill.items nested-create. This avoids the
   * Prisma nested-create tenantId restriction encountered
   * in the preserved 15R.10 failed test.
   */
  const fixture =
    await prisma.$transaction(
      async (tx) => {
        const supplier =
          await tx.supplier.create({
            data: {
              tenantId: TENANT_ID,
              supplierCode:
                `APTEST-15R10B-${token}`,
              name:
                `15R.10B AP Test Supplier ${token}`,
              paymentTermsDays: 30,
              currencyCode: "GHS",
              status: "ACTIVE",
              notes:
                "Permanent 15R.10B Supplier Bill posting evidence.",
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
                `APTEST-15R10B-${token}`,
              name:
                `15R.10B Inventory Test Product ${token}`,
              description:
                "Permanent 15R.10B purchasing evidence.",
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
                `BILL-APTEST-15R10B-${token}`,
              supplierInvoiceNumber:
                `SUPINV-15R10B-${token}`,
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
                "15R.10B inventory purchasing test item",
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
   * The new product must have no stock history.
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

  assert(
    stockBefore === 0,
    "Test product must begin with zero stock movements",
  );

  assert(
    balancesBefore === 0,
    "Test product must begin with zero inventory balances",
  );

  /*
   * Execute the actual production service.
   */
  console.log("");
  console.log("=== EXECUTE PRODUCTION postSupplierBill ===");

  const result =
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId: fixture.bill.id,
      postedById: POSTED_BY_ID,
    });

  console.log("");
  console.log("POSTING RESULT");
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

  assert(
    sameMoney(result.amountPaid, ZERO),
    "Posting result amountPaid must equal 0",
  );

  assert(
    sameMoney(result.balanceDue, TOTAL),
    "Posting result balanceDue must equal 1150",
  );

  /*
   * Verify posted business document.
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
        supplierId: true,
        branchId: true,
        status: true,
        postedAt: true,
        currencyCode: true,
        exchangeRate: true,
        subtotal: true,
        taxTotal: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
      },
    });

  assert(
    postedBill,
    "Posted Supplier Bill must exist",
  );

  assert(
    postedBill.status === "POSTED",
    "Supplier Bill must be POSTED",
  );

  assert(
    postedBill.postedAt !== null,
    "Supplier Bill postedAt must exist",
  );

  assert(
    postedBill.supplierId ===
      fixture.supplier.id,
    "Supplier mismatch",
  );

  assert(
    postedBill.branchId === BRANCH_ID,
    "Branch mismatch",
  );

  assert(
    postedBill.currencyCode === "GHS",
    "Supplier Bill currency must be GHS",
  );

  assert(
    postedBill.exchangeRate.equals(ONE),
    "Supplier Bill exchange rate must be 1",
  );

  assert(
    sameMoney(
      postedBill.subtotal,
      SUBTOTAL,
    ),
    "Supplier Bill subtotal must equal 1000",
  );

  assert(
    sameMoney(
      postedBill.taxTotal,
      TAX,
    ),
    "Supplier Bill tax must equal 150",
  );

  assert(
    sameMoney(
      postedBill.total,
      TOTAL,
    ),
    "Supplier Bill total must equal 1150",
  );

  assert(
    sameMoney(
      postedBill.amountPaid,
      ZERO,
    ),
    "Supplier Bill amountPaid must remain 0",
  );

  assert(
    sameMoney(
      postedBill.balanceDue,
      TOTAL,
    ),
    "Supplier Bill balanceDue must remain 1150",
  );

  /*
   * Supplier subledger evidence.
   */
  const ledgerEntries =
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
        transactionDate: true,
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
  console.dir(
    ledgerEntries,
    { depth: null },
  );

  assert(
    ledgerEntries.length === 1,
    "Exactly one Supplier Ledger entry must exist",
  );

  const ledger =
    ledgerEntries[0]!;

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
    ledger.referenceType ===
      "SUPPLIER_BILL",
    "Supplier Ledger referenceType mismatch",
  );

  assert(
    ledger.currencyCode === "GHS",
    "Supplier Ledger currency must be GHS",
  );

  assert(
    sameMoney(ledger.debit, ZERO),
    "Supplier Ledger debit must be zero",
  );

  assert(
    sameMoney(ledger.credit, TOTAL),
    "Supplier Ledger credit must equal 1150",
  );

  /*
   * General Ledger evidence.
   */
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
            id: true,
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
  console.dir(
    journals,
    { depth: null },
  );

  assert(
    journals.length === 1,
    "Exactly one Supplier Bill journal must exist",
  );

  const journal =
    journals[0]!;

  assert(
    journal.status === "POSTED",
    "Supplier Bill journal must be POSTED",
  );

  assert(
    journal.sourceType === "SUPPLIER_BILL",
    "Journal sourceType mismatch",
  );

  assert(
    journal.sourceId === fixture.bill.id,
    "Journal sourceId mismatch",
  );

  assert(
    journal.lines.length === 3,
    "Journal must contain exactly 3 lines",
  );

  const inventoryLine =
    journal.lines.find(
      (line) =>
        line.accountId ===
        inventoryMapping.accountId,
    );

  const inputTaxLine =
    journal.lines.find(
      (line) =>
        line.accountId ===
        inputTaxMapping.accountId,
    );

  const apLine =
    journal.lines.find(
      (line) =>
        line.accountId ===
        apMapping.accountId,
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
    ) &&
      sameMoney(
        inventoryLine.credit,
        ZERO,
      ),
    "Inventory must be DR 1000 / CR 0",
  );

  assert(
    sameMoney(
      inputTaxLine.debit,
      TAX,
    ) &&
      sameMoney(
        inputTaxLine.credit,
        ZERO,
      ),
    "Input Tax must be DR 150 / CR 0",
  );

  assert(
    sameMoney(
      apLine.debit,
      ZERO,
    ) &&
      sameMoney(
        apLine.credit,
        TOTAL,
      ),
    "Accounts Payable must be DR 0 / CR 1150",
  );

  assert(
    apLine.supplierId ===
      fixture.supplier.id,
    "AP line must carry supplier dimension",
  );

  const totalDebit =
    journal.lines.reduce(
      (sum, line) =>
        sum.plus(line.debit),
      ZERO,
    );

  const totalCredit =
    journal.lines.reduce(
      (sum, line) =>
        sum.plus(line.credit),
      ZERO,
    );

  assert(
    sameMoney(totalDebit, TOTAL),
    "Total journal debit must equal 1150",
  );

  assert(
    sameMoney(totalCredit, TOTAL),
    "Total journal credit must equal 1150",
  );

  /*
   * Supplier Bill must NOT receive stock.
   * Goods Receipt owns the physical inventory event.
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
    "Supplier Bill must not create StockMovement",
  );

  assert(
    balancesAfter === balancesBefore,
    "Supplier Bill must not mutate InventoryBalance",
  );

  /*
   * Duplicate posting protection.
   */
  console.log("");
  console.log("=== DUPLICATE POSTING PROTECTION ===");

  let duplicateRejected = false;

  try {
    await postSupplierBill({
      tenantId: TENANT_ID,
      supplierBillId: fixture.bill.id,
      postedById: POSTED_BY_ID,
    });
  } catch (error) {
    console.log(
      "Duplicate rejection:",
      error instanceof
        SupplierBillPostingError
        ? {
            name: error.name,
            code: error.code,
            message: error.message,
          }
        : error,
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

  /*
   * Counts must remain exactly one after duplicate attempt.
   */
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
    "Exactly one Supplier Ledger entry must remain",
  );

  assert(
    finalJournalCount === 1,
    "Exactly one Supplier Bill journal must remain",
  );

  console.log("");
  console.log(
    "============================================================",
  );

  console.log(
    "15R.10B SUPPLIER BILL BEHAVIORAL TEST: PASS",
  );

  console.log(
    "============================================================",
  );

  console.log("");
  console.log("PERMANENT 2098 EVIDENCE");

  console.dir(
    {
      supplierId:
        fixture.supplier.id,

      supplierCode:
        fixture.supplier.supplierCode,

      productId:
        fixture.product.id,

      sku:
        fixture.product.sku,

      supplierBillId:
        fixture.bill.id,

      billNumber:
        fixture.bill.billNumber,

      supplierBillItemId:
        fixture.item.id,

      supplierLedgerEntryId:
        ledger.id,

      journalId:
        journal.id,

      journalNumber:
        journal.journalNumber,

      accounting: {
        inventoryDebit:
          "1000.0000",

        inputTaxDebit:
          "150.0000",

        accountsPayableCredit:
          "1150.0000",
      },

      stockMovementCreated:
        stockAfter !== stockBefore,

      inventoryBalanceCreated:
        balancesAfter !== balancesBefore,

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
      "15R.10B SUPPLIER BILL BEHAVIORAL TEST: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });