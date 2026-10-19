import { prisma } from "./src/db/prisma.ts";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";

const EXPECTED_ACCOUNTS = [
  { code: "1000", name: "Assets", type: "ASSET", normalBalance: "DEBIT", parentCode: null, control: false, manual: false },
  { code: "1100", name: "Cash", type: "ASSET", normalBalance: "DEBIT", parentCode: "1000", control: false, manual: true },
  { code: "1110", name: "Bank", type: "ASSET", normalBalance: "DEBIT", parentCode: "1000", control: false, manual: true },
  { code: "1200", name: "Accounts Receivable", type: "ASSET", normalBalance: "DEBIT", parentCode: "1000", control: true, manual: false },

  { code: "2000", name: "Liabilities", type: "LIABILITY", normalBalance: "CREDIT", parentCode: null, control: false, manual: false },
  { code: "2100", name: "Accounts Payable", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "2000", control: true, manual: false },
  { code: "2200", name: "Output Tax Payable", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "2000", control: true, manual: false },

  { code: "3000", name: "Equity", type: "EQUITY", normalBalance: "CREDIT", parentCode: null, control: false, manual: false },
  { code: "3100", name: "Owner's Equity", type: "EQUITY", normalBalance: "CREDIT", parentCode: "3000", control: false, manual: true },
  { code: "3200", name: "Retained Earnings", type: "EQUITY", normalBalance: "CREDIT", parentCode: "3000", control: true, manual: false },

  { code: "4000", name: "Revenue", type: "REVENUE", normalBalance: "CREDIT", parentCode: null, control: false, manual: false },
  { code: "4100", name: "Sales Revenue", type: "REVENUE", normalBalance: "CREDIT", parentCode: "4000", control: false, manual: true },
  { code: "4200", name: "Sales Returns", type: "REVENUE", normalBalance: "DEBIT", parentCode: "4000", control: false, manual: true },
  { code: "4300", name: "Sales Discounts", type: "REVENUE", normalBalance: "DEBIT", parentCode: "4000", control: false, manual: true },

  { code: "5000", name: "Cost of Sales", type: "EXPENSE", normalBalance: "DEBIT", parentCode: null, control: false, manual: false },
  { code: "5100", name: "Cost of Goods Sold", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", control: false, manual: true },

  { code: "6000", name: "Operating Expenses", type: "EXPENSE", normalBalance: "DEBIT", parentCode: null, control: false, manual: false },
  { code: "6100", name: "Salary Expense", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "6000", control: false, manual: true },
] as const;

const EXPECTED_MAPPINGS = {
  ACCOUNTS_RECEIVABLE: "1200",
  ACCOUNTS_PAYABLE: "2100",
  SALES_REVENUE: "4100",
  SALES_RETURNS: "4200",
  SALES_DISCOUNTS: "4300",
  OUTPUT_TAX: "2200",
  CASH: "1100",
  BANK: "1110",
  COST_OF_GOODS_SOLD: "5100",
  PAYROLL_PAYABLE: "2100",
  SALARY_EXPENSE: "6100",
  RETAINED_EARNINGS: "3200",
} as const;

async function main() {
  console.log("=== 15Q.8 POST-WRITE DATABASE VERIFICATION ===");
  console.log("");

  const accounts = await prisma.account.findMany({
    where: {
      tenantId: TENANT_ID,
      code: { in: EXPECTED_ACCOUNTS.map((a) => a.code) },
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      normalBalance: true,
      parentId: true,
      isControlAccount: true,
      allowManualPosting: true,
      status: true,
    },
    orderBy: { code: "asc" },
  });

  const accountByCode = new Map(accounts.map((a) => [a.code, a]));
  const codeById = new Map(accounts.map((a) => [a.id, a.code]));

  let failures = 0;

  console.log("=== ACCOUNTS ===");

  for (const expected of EXPECTED_ACCOUNTS) {
    const actual = accountByCode.get(expected.code);

    if (!actual) {
      failures++;
      console.error(`FAIL ${expected.code}: account missing`);
      continue;
    }

    const actualParentCode = actual.parentId
      ? codeById.get(actual.parentId) ?? `UNKNOWN:${actual.parentId}`
      : null;

    const checks = [
      actual.name === expected.name,
      actual.type === expected.type,
      actual.normalBalance === expected.normalBalance,
      actualParentCode === expected.parentCode,
      actual.isControlAccount === expected.control,
      actual.allowManualPosting === expected.manual,
      actual.status === "ACTIVE",
    ];

    if (checks.every(Boolean)) {
      console.log(
        `PASS ${actual.code} | ${actual.name} | ${actual.type} | ${actual.normalBalance} | parent=${actualParentCode ?? "ROOT"}`
      );
    } else {
      failures++;
      console.error(`FAIL ${expected.code}`);
      console.error("  Expected:", expected);
      console.error("  Actual:", {
        name: actual.name,
        type: actual.type,
        normalBalance: actual.normalBalance,
        parentCode: actualParentCode,
        control: actual.isControlAccount,
        manual: actual.allowManualPosting,
        status: actual.status,
      });
    }
  }

  console.log("");
  console.log(`Expected baseline accounts: ${EXPECTED_ACCOUNTS.length}`);
  console.log(`Baseline accounts found: ${accounts.length}`);

  if (accounts.length !== EXPECTED_ACCOUNTS.length) {
    failures++;
  }

  const mappings = await prisma.systemAccountMapping.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      purpose: true,
      accountId: true,
    },
    orderBy: { purpose: "asc" },
  });

  console.log("");
  console.log("=== SYSTEM ACCOUNT MAPPINGS ===");

  const expectedMappingEntries = Object.entries(EXPECTED_MAPPINGS);

  for (const [purpose, expectedCode] of expectedMappingEntries) {
    const mapping = mappings.find((m) => m.purpose === purpose);

    if (!mapping) {
      failures++;
      console.error(`FAIL ${purpose}: mapping missing`);
      continue;
    }

    const actualCode = codeById.get(mapping.accountId);

    if (actualCode === expectedCode) {
      console.log(`PASS ${purpose} -> ${actualCode}`);
    } else {
      failures++;
      console.error(
        `FAIL ${purpose}: expected ${expectedCode}, found ${actualCode ?? mapping.accountId}`
      );
    }
  }

  console.log("");
  console.log(`Expected mappings: ${expectedMappingEntries.length}`);
  console.log(`Mappings found: ${mappings.length}`);

  if (mappings.length !== expectedMappingEntries.length) {
    failures++;
  }

  const profile = await prisma.accountingProfile.findUnique({
    where: { tenantId: TENANT_ID },
    select: {
      framework: true,
      frameworkEdition: true,
      effectiveFrom: true,
    },
  });

  console.log("");
  console.log("=== ACCOUNTING PROFILE ===");

  if (!profile) {
    failures++;
    console.error("FAIL: accounting profile missing");
  } else {
    const frameworkOk = profile.framework === "IFRS_FOR_SMES";
    const editionOk = profile.frameworkEdition === "Third Edition (2025)";
    const effectiveOk =
      profile.effectiveFrom.toISOString().slice(0, 10) === "2027-01-01";

    console.log(`Framework: ${profile.framework}`);
    console.log(`Edition: ${profile.frameworkEdition}`);
    console.log(
      `Effective from: ${profile.effectiveFrom.toISOString().slice(0, 10)}`
    );

    if (frameworkOk && editionOk && effectiveOk) {
      console.log("PASS accounting profile");
    } else {
      failures++;
      console.error("FAIL accounting profile");
    }
  }

  console.log("");
  console.log("=== FINAL RESULT ===");

  if (failures > 0) {
    console.error(`15Q.8 POST-WRITE VERIFICATION: FAILED (${failures} issue(s))`);
    process.exitCode = 1;
    return;
  }

  console.log("15Q.8 POST-WRITE VERIFICATION: PASS");
  console.log("Accounting bootstrap persisted exactly as expected.");
}

main()
  .catch((error) => {
    console.error("");
    console.error("15Q.8 POST-WRITE VERIFICATION: ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });