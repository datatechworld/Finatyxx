import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

async function main() {
  console.log(
    "=== 15Q.12C BANKING DATA PREFLIGHT ===",
  );

  const financialAccount =
    await prisma.financialAccount.findFirst({
      where: {
        id: FINANCIAL_ACCOUNT_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        name: true,
        accountType: true,
        currencyCode: true,
        ledgerAccountId: true,
        openingBalance: true,
        currentBalanceCache: true,
        status: true,
      },
    });

  console.log("");
  console.log("=== FINANCIAL ACCOUNT ===");

  if (!financialAccount) {
    throw new Error(
      "STOP: test financial account not found.",
    );
  }

  console.log({
    ...financialAccount,
    openingBalance:
      financialAccount.openingBalance.toString(),
    currentBalanceCache:
      financialAccount.currentBalanceCache.toString(),
  });

  const bankTransactionCount =
    await prisma.bankTransaction.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const accountBankTransactionCount =
    await prisma.bankTransaction.count({
      where: {
        tenantId: TENANT_ID,
        financialAccountId: FINANCIAL_ACCOUNT_ID,
      },
    });

  const reconciliationCount =
    await prisma.bankReconciliation.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  console.log("");
  console.log("=== COUNTS ===");

  console.log({
    tenantBankTransactions:
      bankTransactionCount,
    financialAccountBankTransactions:
      accountBankTransactionCount,
    tenantBankReconciliations:
      reconciliationCount,
  });

  console.log("");
  console.log(
    "15Q.12C BANKING DATA PREFLIGHT: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.12C BANKING DATA PREFLIGHT: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });