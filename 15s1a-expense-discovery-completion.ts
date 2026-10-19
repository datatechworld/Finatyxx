import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main(): Promise<void> {
  console.log(
    "=== 15S.1A EXPENSE DISCOVERY COMPLETION ===",
  );

  const expenseAccounts =
    await prisma.account.findMany({
      where: {
        tenantId: TENANT_ID,
        type: "EXPENSE",
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        normalBalance: true,
        status: true,
        isControlAccount: true,
        allowManualPosting: true,
        parentId: true,
      },
      orderBy: {
        code: "asc",
      },
    });

  console.log("");
  console.log("=== EXPENSE GL ACCOUNTS ===");

  console.dir(expenseAccounts, {
    depth: null,
  });

  const financialAccounts =
    await prisma.financialAccount.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      include: {
        ledgerAccount: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            normalBalance: true,
            status: true,
            isControlAccount: true,
            allowManualPosting: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

  console.log("");
  console.log("=== FINANCIAL ACCOUNTS ===");

  console.dir(
    financialAccounts.map((account) => ({
      id: account.id,
      branchId: account.branchId,
      name: account.name,
      accountType: account.accountType,
      currencyCode: account.currencyCode,
      status: account.status,
      ledgerAccountId: account.ledgerAccountId,
      openingBalance:
        account.openingBalance.toString(),
      currentBalanceCache:
        account.currentBalanceCache.toString(),
      ledgerAccount: account.ledgerAccount,
    })),
    { depth: null },
  );

  const expenseCount =
    await prisma.expense.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  console.log("");
  console.log(
    "Existing test-tenant Expense count:",
    expenseCount,
  );

  console.log("");
  console.log(
    "15S.1A DISCOVERY: PASS",
  );
  console.log(
    "DATABASE MUTATIONS: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("15S.1A: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });