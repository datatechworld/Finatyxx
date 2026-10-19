import { Prisma } from "./src/generated/prisma/client.js";
import {
  AccountType,
  AccountingFramework,
  NormalBalance,
  RecordStatus,
  SystemAccountPurpose,
} from "./src/generated/prisma/enums.js";
import { prisma } from "./src/db/prisma.js";
import {
  createAccountInTransaction,
} from "./src/modules/accounting/chart-of-accounts.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";

type AccountDefinition = {
  code: string;
  name: string;
  type: AccountType;
  normalBalance?: NormalBalance;
  parentCode?: string;
  isControlAccount?: boolean;
  allowManualPosting?: boolean;
};

const ACCOUNT_DEFINITIONS: readonly AccountDefinition[] = [
  // ---------------------------------------------------------------------------
  // Assets
  // ---------------------------------------------------------------------------
  {
    code: "1000",
    name: "Assets",
    type: AccountType.ASSET,
    allowManualPosting: false,
  },
  {
    code: "1100",
    name: "Cash",
    type: AccountType.ASSET,
    parentCode: "1000",
  },
  {
    code: "1110",
    name: "Bank",
    type: AccountType.ASSET,
    parentCode: "1000",
  },
  {
    code: "1200",
    name: "Accounts Receivable",
    type: AccountType.ASSET,
    parentCode: "1000",
    isControlAccount: true,
    allowManualPosting: false,
  },

  // ---------------------------------------------------------------------------
  // Liabilities
  // ---------------------------------------------------------------------------
  {
    code: "2000",
    name: "Liabilities",
    type: AccountType.LIABILITY,
    allowManualPosting: false,
  },
  {
    code: "2100",
    name: "Accounts Payable",
    type: AccountType.LIABILITY,
    parentCode: "2000",
    isControlAccount: true,
    allowManualPosting: false,
  },
  {
    code: "2200",
    name: "Output Tax Payable",
    type: AccountType.LIABILITY,
    parentCode: "2000",
    isControlAccount: true,
    allowManualPosting: false,
  },

  // ---------------------------------------------------------------------------
  // Equity
  // ---------------------------------------------------------------------------
  {
    code: "3000",
    name: "Equity",
    type: AccountType.EQUITY,
    allowManualPosting: false,
  },
  {
    code: "3100",
    name: "Owner's Equity",
    type: AccountType.EQUITY,
    parentCode: "3000",
  },
  {
    code: "3200",
    name: "Retained Earnings",
    type: AccountType.EQUITY,
    parentCode: "3000",
    isControlAccount: true,
    allowManualPosting: false,
  },

  // ---------------------------------------------------------------------------
  // Revenue
  // ---------------------------------------------------------------------------
  {
    code: "4000",
    name: "Revenue",
    type: AccountType.REVENUE,
    allowManualPosting: false,
  },
  {
    code: "4100",
    name: "Sales Revenue",
    type: AccountType.REVENUE,
    parentCode: "4000",
  },
  {
    code: "4200",
    name: "Sales Returns",
    type: AccountType.REVENUE,
    normalBalance: NormalBalance.DEBIT,
    parentCode: "4000",
  },
  {
    code: "4300",
    name: "Sales Discounts",
    type: AccountType.REVENUE,
    normalBalance: NormalBalance.DEBIT,
    parentCode: "4000",
  },

  // ---------------------------------------------------------------------------
  // Cost of Sales
  // ---------------------------------------------------------------------------
  {
    code: "5000",
    name: "Cost of Sales",
    type: AccountType.EXPENSE,
    allowManualPosting: false,
  },
  {
    code: "5100",
    name: "Cost of Goods Sold",
    type: AccountType.EXPENSE,
    parentCode: "5000",
  },

  // ---------------------------------------------------------------------------
  // Operating Expenses
  // ---------------------------------------------------------------------------
  {
    code: "6000",
    name: "Operating Expenses",
    type: AccountType.EXPENSE,
    allowManualPosting: false,
  },
  {
    code: "6100",
    name: "Salary Expense",
    type: AccountType.EXPENSE,
    parentCode: "6000",
  },
];

const SYSTEM_MAPPINGS: ReadonlyArray<{
  purpose: SystemAccountPurpose;
  accountCode: string;
}> = [
  {
    purpose: SystemAccountPurpose.ACCOUNTS_RECEIVABLE,
    accountCode: "1200",
  },
  {
    purpose: SystemAccountPurpose.ACCOUNTS_PAYABLE,
    accountCode: "2100",
  },
  {
    purpose: SystemAccountPurpose.SALES_REVENUE,
    accountCode: "4100",
  },
  {
    purpose: SystemAccountPurpose.SALES_RETURNS,
    accountCode: "4200",
  },
  {
    purpose: SystemAccountPurpose.SALES_DISCOUNTS,
    accountCode: "4300",
  },
  {
    purpose: SystemAccountPurpose.OUTPUT_TAX,
    accountCode: "2200",
  },
  {
    purpose: SystemAccountPurpose.CASH,
    accountCode: "1100",
  },
  {
    purpose: SystemAccountPurpose.BANK,
    accountCode: "1110",
  },
  {
    purpose: SystemAccountPurpose.COST_OF_GOODS_SOLD,
    accountCode: "5100",
  },
  {
    purpose: SystemAccountPurpose.PAYROLL_PAYABLE,
    accountCode: "2100",
  },
  {
    purpose: SystemAccountPurpose.SALARY_EXPENSE,
    accountCode: "6100",
  },
  {
    purpose: SystemAccountPurpose.RETAINED_EARNINGS,
    accountCode: "3200",
  },
];

async function main(): Promise<void> {
  console.log("Checkpoint 15Q.8 — Accounting Bootstrap");
  console.log("");

  const tenant = await prisma.tenant.findUnique({
    where: {
      id: TENANT_ID,
    },
    select: {
      id: true,
      legalName: true,
      baseCurrencyCode: true,
      status: true,
    },
  });

  if (!tenant) {
    throw new Error(`Tenant ${TENANT_ID} does not exist.`);
  }

  console.log(`Tenant: ${tenant.legalName}`);
  console.log(`Base currency: ${tenant.baseCurrencyCode}`);
  console.log(`Status: ${tenant.status}`);
  console.log("");

  const existingCodes = await prisma.account.findMany({
    where: {
      tenantId: TENANT_ID,
      code: {
        in: ACCOUNT_DEFINITIONS.map((definition) => definition.code),
      },
    },
    select: {
      code: true,
    },
  });

  if (existingCodes.length > 0) {
    throw new Error(
      [
        "Bootstrap stopped before making changes.",
        "One or more production baseline account codes already exist:",
        existingCodes.map((account) => account.code).join(", "),
        "Review the existing accounts before retrying.",
      ].join(" "),
    );
  }

  const existingMappings = await prisma.systemAccountMapping.count({
    where: {
      tenantId: TENANT_ID,
    },
  });

  if (existingMappings !== 0) {
    throw new Error(
      `Bootstrap stopped before making changes. Tenant already has ${existingMappings} system account mapping(s).`,
    );
  }

  const existingProfile = await prisma.accountingProfile.findUnique({
    where: {
      tenantId: TENANT_ID,
    },
    select: {
      tenantId: true,
      framework: true,
      frameworkEdition: true,
      effectiveFrom: true,
    },
  });

  if (existingProfile) {
    throw new Error(
      [
        "Bootstrap stopped before making changes.",
        "The tenant already has an AccountingProfile:",
        `${existingProfile.framework} ${existingProfile.frameworkEdition}.`,
        "Review it before retrying.",
      ].join(" "),
    );
  }

  console.log("PASS: no conflicting baseline account codes");
  console.log("PASS: no existing system account mappings");
  console.log("PASS: no existing accounting profile");
  console.log("");

  const result = await prisma.$transaction(
    async (tx) => {
      const createdAccounts = new Map<
        string,
        {
          id: string;
          code: string;
          name: string;
        }
      >();

      for (const definition of ACCOUNT_DEFINITIONS) {
        let parentId: string | null = null;

        if (definition.parentCode) {
          const parent = createdAccounts.get(definition.parentCode);

          if (!parent) {
            throw new Error(
              `Parent account ${definition.parentCode} must be created before child ${definition.code}.`,
            );
          }

          parentId = parent.id;
        }

        const account = await createAccountInTransaction(tx, {
          tenantId: TENANT_ID,
          code: definition.code,
          name: definition.name,
          type: definition.type,
          normalBalance: definition.normalBalance,
          parentId,
          isControlAccount: definition.isControlAccount ?? false,
          allowManualPosting: definition.allowManualPosting ?? true,
          status: RecordStatus.ACTIVE,
        });

        createdAccounts.set(definition.code, {
          id: account.id,
          code: account.code,
          name: account.name,
        });
      }

      await tx.accountingProfile.create({
        data: {
          tenantId: TENANT_ID,
          framework: AccountingFramework.IFRS_FOR_SMES,
          frameworkEdition: "Third Edition (2025)",
          effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
        },
      });

      for (const mapping of SYSTEM_MAPPINGS) {
        const account = createdAccounts.get(mapping.accountCode);

        if (!account) {
          throw new Error(
            `Cannot create ${mapping.purpose} mapping because account ${mapping.accountCode} was not created.`,
          );
        }

        await tx.systemAccountMapping.create({
          data: {
            tenantId: TENANT_ID,
            purpose: mapping.purpose,
            accountId: account.id,
          },
        });
      }

      return {
        accounts: [...createdAccounts.values()],
        mappingCount: SYSTEM_MAPPINGS.length,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30_000,
    },
  );

  console.log("=== CREATED ACCOUNTS ===");

  for (const account of result.accounts) {
    console.log(
      `${account.code} | ${account.name} | ${account.id}`,
    );
  }

  console.log("");
  console.log(`Created accounts: ${result.accounts.length}`);
  console.log(`Created system mappings: ${result.mappingCount}`);
  console.log("");
  console.log("15Q.8 ACCOUNTING BOOTSTRAP: COMPLETE");
}

main()
  .catch((error) => {
    console.error("");
    console.error("15Q.8 ACCOUNTING BOOTSTRAP: FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });