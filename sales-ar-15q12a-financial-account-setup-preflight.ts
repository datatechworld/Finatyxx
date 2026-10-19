import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

async function main() {
  console.log(
    "=== 15Q.12A FINANCIAL ACCOUNT SETUP PREFLIGHT ===",
  );

  console.log("");
  console.log("=== TENANT ===");

  const tenant = await prisma.tenant.findUnique({
    where: {
      id: TENANT_ID,
    },
    select: {
      id: true,
      legalName: true,
      tradingName: true,
      baseCurrencyCode: true,
      status: true,
    },
  });

  console.log(tenant);

  console.log("");
  console.log("=== TARGET BRANCH ===");

  const branch = await prisma.branch.findFirst({
    where: {
      id: BRANCH_ID,
      tenantId: TENANT_ID,
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      code: true,
      isHeadOffice: true,
      status: true,
    },
  });

  console.log(branch);

  console.log("");
  console.log("=== CASH / BANK GL ACCOUNTS ===");

  const accounts = await prisma.account.findMany({
    where: {
      tenantId: TENANT_ID,
      code: {
        in: ["1100", "1110"],
      },
    },
    orderBy: {
      code: "asc",
    },
    select: {
      id: true,
      tenantId: true,
      parentId: true,
      code: true,
      name: true,
      type: true,
      normalBalance: true,
      isControlAccount: true,
      allowManualPosting: true,
      status: true,
    },
  });

  console.table(accounts);

  console.log("");
  console.log("=== CASH / BANK SYSTEM MAPPINGS ===");

  const mappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
        purpose: {
          in: ["CASH", "BANK"],
        },
      },
      orderBy: {
        purpose: "asc",
      },
      select: {
        id: true,
        tenantId: true,
        purpose: true,
        accountId: true,
      },
    });

  console.table(mappings);

  console.log("");
  console.log("=== EXISTING FINANCIAL ACCOUNTS ===");

  const financialAccounts =
    await prisma.financialAccount.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        name: true,
        accountType: true,
        currencyCode: true,
        bankName: true,
        accountNumberMasked: true,
        mobileMoneyProvider: true,
        ledgerAccountId: true,
        openingBalance: true,
        currentBalanceCache: true,
        status: true,
      },
    });

  console.table(
    financialAccounts.map((row) => ({
      ...row,
      openingBalance: row.openingBalance.toString(),
      currentBalanceCache:
        row.currentBalanceCache.toString(),
    })),
  );

  console.log("");
  console.log("=== RECEIPT SEQUENCE STATE ===");

  const sequences = await prisma.documentSequence.findMany({
    where: {
      tenantId: TENANT_ID,
      documentType: "RECEIPT",
    },
    orderBy: [
      {
        year: "asc",
      },
      {
        branchId: "asc",
      },
    ],
  });

  console.table(sequences);

  console.log("");
  console.log(
    "15Q.12A FINANCIAL ACCOUNT SETUP PREFLIGHT: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.12A FINANCIAL ACCOUNT SETUP PREFLIGHT: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });