import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

async function main(): Promise<void> {
  console.log(
    "=== 15R.2 READ-ONLY AP DATABASE PREFLIGHT ===",
  );

  const tenant =
    await prisma.tenant.findUnique({
      where: {
        id: TENANT_ID,
      },
      select: {
        id: true,
        legalName: true,
        baseCurrencyCode: true,
      },
    });

  if (!tenant) {
    throw new Error(
      "TEST_TENANT_NOT_FOUND",
    );
  }

  const branch =
    await prisma.branch.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: BRANCH_ID,
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });

  if (!branch) {
    throw new Error(
      "TEST_BRANCH_NOT_FOUND",
    );
  }

  const mappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
        purpose: {
          in: [
            "ACCOUNTS_PAYABLE",
            "INPUT_TAX",
            "INVENTORY",
            "COST_OF_GOODS_SOLD",
            "CASH",
            "BANK",
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
            type: true,
            normalBalance: true,
            status: true,
            allowManualPosting: true,
          },
        },
      },
      orderBy: {
        purpose: "asc",
      },
    });

  const suppliers =
    await prisma.supplier.findMany({
      where: {
        tenantId: TENANT_ID,
        status: "ACTIVE",
      },
      select: {
        id: true,
        supplierCode: true,
        name: true,
        currencyCode: true,
        paymentTermsDays: true,
        status: true,
      },
      orderBy: {
        supplierCode: "asc",
      },
      take: 10,
    });

  const billCount =
    await prisma.supplierBill.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const supplierLedgerCount =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const supplierPaymentCount =
    await prisma.supplierPayment.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  console.log("");
  console.log("TENANT");
  console.dir(tenant);

  console.log("");
  console.log("BRANCH");
  console.dir(branch);

  console.log("");
  console.log("AP ACCOUNT MAPPINGS");
  console.dir(
    mappings,
    { depth: null },
  );

  console.log("");
  console.log("ACTIVE SUPPLIERS");
  console.dir(
    suppliers,
    { depth: null },
  );

  console.log("");
  console.log("CURRENT AP COUNTS");
  console.dir({
    supplierBills: billCount,
    supplierLedgerEntries:
      supplierLedgerCount,
    supplierPayments:
      supplierPaymentCount,
  });

  const ap =
    mappings.find(
      (mapping) =>
        mapping.purpose ===
        "ACCOUNTS_PAYABLE",
    );

  if (!ap) {
    throw new Error(
      "ACCOUNTS_PAYABLE_MAPPING_MISSING",
    );
  }

  if (
    ap.account.status !== "ACTIVE"
  ) {
    throw new Error(
      "ACCOUNTS_PAYABLE_ACCOUNT_NOT_ACTIVE",
    );
  }

  /*
   * Accounts Payable is a system-controlled control account.
   * allowManualPosting=false is valid and desirable.
   * Supplier Bill posting reaches it through the controlled
   * accounting posting engine rather than manual journals.
   */

  const inputTax =
    mappings.find(
      (mapping) =>
        mapping.purpose ===
        "INPUT_TAX",
    );

  console.log("");
  console.log("AP FOUNDATION");

  console.dir({
    accountsPayable: ap,
    inputTax:
      inputTax ?? "NOT_CONFIGURED",
    activeSupplierCount:
      suppliers.length,
  }, {
    depth: null,
  });

  console.log("");
  console.log(
    "15R.2 READ-ONLY DATABASE PREFLIGHT: PASS",
  );

  console.log(
    "Database mutations: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.2 READ-ONLY DATABASE PREFLIGHT: FAIL",
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });