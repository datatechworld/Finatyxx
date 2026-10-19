import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const BANK_GL_ACCOUNT_ID =
  "9a5deeb7-0392-41f9-9143-e480a9238658";

const TEST_ACCOUNT_NAME =
  "15Q Sales AR Test Bank";

async function main() {
  console.log(
    "=== 15Q.12B CREATE TEST FINANCIAL ACCOUNT ===",
  );

  /*
   * Refuse to create a duplicate fixture.
   */
  const existing =
    await prisma.financialAccount.findFirst({
      where: {
        tenantId: TENANT_ID,
        name: TEST_ACCOUNT_NAME,
      },
      select: {
        id: true,
        name: true,
      },
    });

  if (existing) {
    throw new Error(
      `STOP: test financial account already exists: ${existing.id}`,
    );
  }

  /*
   * Re-verify the tenant.
   */
  const tenant = await prisma.tenant.findUnique({
    where: {
      id: TENANT_ID,
    },
    select: {
      id: true,
      baseCurrencyCode: true,
      status: true,
    },
  });

  if (!tenant) {
    throw new Error("STOP: tenant not found.");
  }

  if (tenant.baseCurrencyCode !== "GHS") {
    throw new Error(
      `STOP: expected tenant base currency GHS, found ${tenant.baseCurrencyCode}.`,
    );
  }

  /*
   * Re-verify the target branch.
   */
  const branch = await prisma.branch.findFirst({
    where: {
      id: BRANCH_ID,
      tenantId: TENANT_ID,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      code: true,
    },
  });

  if (!branch) {
    throw new Error(
      "STOP: active target branch not found.",
    );
  }

  /*
   * Re-verify that the selected GL account really is
   * the tenant's active 1110 Bank asset account.
   */
  const bankAccount = await prisma.account.findFirst({
    where: {
      id: BANK_GL_ACCOUNT_ID,
      tenantId: TENANT_ID,
      code: "1110",
      type: "ASSET",
      normalBalance: "DEBIT",
      status: "ACTIVE",
    },
    select: {
      id: true,
      tenantId: true,
      code: true,
      name: true,
      type: true,
      normalBalance: true,
      status: true,
    },
  });

  if (!bankAccount) {
    throw new Error(
      "STOP: verified 1110 Bank GL account was not found.",
    );
  }

  /*
   * Confirm that BANK system mapping still points
   * to the same GL account.
   */
  const bankMapping =
    await prisma.systemAccountMapping.findFirst({
      where: {
        tenantId: TENANT_ID,
        purpose: "BANK",
        accountId: BANK_GL_ACCOUNT_ID,
      },
      select: {
        id: true,
        purpose: true,
        accountId: true,
      },
    });

  if (!bankMapping) {
    throw new Error(
      "STOP: BANK system mapping no longer points to account 1110.",
    );
  }

  /*
   * Create the test financial account.
   *
   * No fictitious real-world bank details are supplied.
   * The fixture represents an internal test bank account.
   */
  const created =
    await prisma.financialAccount.create({
      data: {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        name: TEST_ACCOUNT_NAME,
        accountType: "BANK",
        currencyCode: "GHS",
        openingBalance: "0.0000",
        currentBalanceCache: "0.0000",
        ledgerAccountId: BANK_GL_ACCOUNT_ID,
        status: "ACTIVE",
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

  console.log("");
  console.log("=== CREATED FINANCIAL ACCOUNT ===");

  console.log({
    ...created,
    openingBalance:
      created.openingBalance.toString(),
    currentBalanceCache:
      created.currentBalanceCache.toString(),
  });

  /*
   * Read through the new Prisma relations.
   * This also behaviorally verifies the contract added
   * during 15Q.11.
   */
  const verified =
    await prisma.financialAccount.findFirst({
      where: {
        id: created.id,
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
        status: true,

        ledgerAccount: {
          select: {
            id: true,
            tenantId: true,
            code: true,
            name: true,
            type: true,
            normalBalance: true,
            status: true,
          },
        },
      },
    });

  console.log("");
  console.log("=== RELATION VERIFICATION ===");
  console.dir(verified, {
    depth: null,
  });

  const passed =
    verified !== null &&
    verified.tenantId === TENANT_ID &&
    verified.branchId === BRANCH_ID &&
    verified.name === TEST_ACCOUNT_NAME &&
    verified.accountType === "BANK" &&
    verified.currencyCode === "GHS" &&
    verified.status === "ACTIVE" &&
    verified.ledgerAccountId ===
      BANK_GL_ACCOUNT_ID &&
    verified.ledgerAccount !== null &&
    verified.ledgerAccount.tenantId ===
      TENANT_ID &&
    verified.ledgerAccount.code === "1110" &&
    verified.ledgerAccount.name === "Bank" &&
    verified.ledgerAccount.type === "ASSET" &&
    verified.ledgerAccount.normalBalance ===
      "DEBIT" &&
    verified.ledgerAccount.status === "ACTIVE";

  console.log("");
  console.log(
    passed
      ? "15Q.12B FINANCIAL ACCOUNT SETUP: PASS"
      : "15Q.12B FINANCIAL ACCOUNT SETUP: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.12B FINANCIAL ACCOUNT SETUP: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });