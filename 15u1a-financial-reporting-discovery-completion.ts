import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

type AccountBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  normalBalance: string;
  debit: string;
  credit: string;
  netDebit: string;
};

type TrialBalanceTotalRow = {
  totalDebit: string;
  totalCredit: string;
  difference: string;
};

type AccountTypeRow = {
  type: string;
  debit: string;
  credit: string;
  netDebit: string;
};

function decimal(
  value: string,
): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

async function main(): Promise<void> {
  console.log(
    "=== 15U.1A FINANCIAL REPORTING DISCOVERY COMPLETION ===",
  );

  /*
   * ---------------------------------------------------------
   * TENANT / REPORTING CURRENCY
   * ---------------------------------------------------------
   */

  const tenant =
    await prisma.tenant.findUnique({
      where: {
        id: TENANT_ID,
      },
      select: {
        id: true,
        legalName: true,
        tradingName: true,
        status: true,
        baseCurrencyCode: true,
      },
    });

  if (!tenant) {
    throw new Error(
      "Test tenant not found.",
    );
  }

  if (
    tenant.status !== "TRIAL" &&
    tenant.status !== "ACTIVE"
  ) {
    throw new Error(
      `Tenant is not reportable: ${tenant.status}.`,
    );
  }

  console.log("");
  console.log("=== TENANT ===");
  console.dir(tenant, {
    depth: null,
  });

  /*
   * ---------------------------------------------------------
   * CHART OF ACCOUNTS
   * ---------------------------------------------------------
   */

  const accounts =
    await prisma.account.findMany({
      where: {
        tenantId: TENANT_ID,
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
      orderBy: {
        code: "asc",
      },
    });

  console.log("");
  console.log("=== CHART OF ACCOUNTS ===");

  for (const account of accounts) {
    console.log(account);
  }

  console.log("");
  console.log(
    "Account count:",
    accounts.length,
  );

  /*
   * ---------------------------------------------------------
   * POSTED JOURNAL SUMMARY
   * ---------------------------------------------------------
   */

  const postedEntries =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        status: "POSTED",
      },
      select: {
        id: true,
        journalNumber: true,
        journalDate: true,
        sourceType: true,
        sourceId: true,
        currencyCode: true,
        exchangeRate: true,
        status: true,
        _count: {
          select: {
            lines: true,
          },
        },
      },
      orderBy: [
        {
          journalDate: "asc",
        },
        {
          journalNumber: "asc",
        },
      ],
    });

  console.log("");
  console.log(
    "=== POSTED JOURNAL SUMMARY ===",
  );

  for (const entry of postedEntries) {
    console.log({
      id: entry.id,
      journalNumber:
        entry.journalNumber,
      journalDate:
        entry.journalDate,
      sourceType:
        entry.sourceType,
      sourceId:
        entry.sourceId,
      currencyCode:
        entry.currencyCode,
      exchangeRate:
        entry.exchangeRate.toString(),
      lineCount:
        entry._count.lines,
    });
  }

  console.log("");
  console.log(
    "Posted Journal Entry count:",
    postedEntries.length,
  );

  /*
   * ---------------------------------------------------------
   * AUTHORITATIVE POSTED ACCOUNT BALANCES
   *
   * IMPORTANT:
   * Start with POSTED journal_entries, then INNER JOIN lines.
   * This prevents DRAFT/VOID/non-posted lines from entering
   * financial reports.
   * ---------------------------------------------------------
   */

  const postedBalances =
    await prisma.$queryRaw<
      AccountBalanceRow[]
    >`
      SELECT
        a."id"::text AS "accountId",
        a."code"::text AS "code",
        a."name"::text AS "name",
        a."type"::text AS "type",
        a."normalBalance"::text AS "normalBalance",
        COALESCE(
          SUM(jl."debit"),
          0
        )::text AS "debit",
        COALESCE(
          SUM(jl."credit"),
          0
        )::text AS "credit",
        (
          COALESCE(
            SUM(jl."debit"),
            0
          )
          -
          COALESCE(
            SUM(jl."credit"),
            0
          )
        )::text AS "netDebit"
      FROM "journal_entries" je
      INNER JOIN "journal_lines" jl
        ON jl."tenantId" = je."tenantId"
       AND jl."journalEntryId" = je."id"
      INNER JOIN "accounts" a
        ON a."tenantId" = jl."tenantId"
       AND a."id" = jl."accountId"
      WHERE
        je."tenantId" = ${TENANT_ID}::uuid
        AND je."status" = 'POSTED'
      GROUP BY
        a."id",
        a."code",
        a."name",
        a."type",
        a."normalBalance"
      ORDER BY
        a."code"
    `;

  console.log("");
  console.log(
    "=== AUTHORITATIVE POSTED ACCOUNT BALANCES ===",
  );

  for (const row of postedBalances) {
    console.log(row);
  }

  /*
   * ---------------------------------------------------------
   * TRIAL BALANCE INTEGRITY
   * ---------------------------------------------------------
   */

  const totals =
    await prisma.$queryRaw<
      TrialBalanceTotalRow[]
    >`
      SELECT
        COALESCE(
          SUM(jl."debit"),
          0
        )::text AS "totalDebit",
        COALESCE(
          SUM(jl."credit"),
          0
        )::text AS "totalCredit",
        (
          COALESCE(
            SUM(jl."debit"),
            0
          )
          -
          COALESCE(
            SUM(jl."credit"),
            0
          )
        )::text AS "difference"
      FROM "journal_entries" je
      INNER JOIN "journal_lines" jl
        ON jl."tenantId" = je."tenantId"
       AND jl."journalEntryId" = je."id"
      WHERE
        je."tenantId" = ${TENANT_ID}::uuid
        AND je."status" = 'POSTED'
    `;

  const total = totals[0];

  if (!total) {
    throw new Error(
      "Trial Balance totals returned no row.",
    );
  }

  console.log("");
  console.log(
    "=== GLOBAL TRIAL BALANCE ===",
  );

  console.log(
    "Total Debit:",
    total.totalDebit,
  );

  console.log(
    "Total Credit:",
    total.totalCredit,
  );

  console.log(
    "Difference:",
    total.difference,
  );

  if (
    !decimal(total.difference).equals(0)
  ) {
    throw new Error(
      `Posted ledger is not balanced. Difference: ${total.difference}`,
    );
  }

  console.log(
    "GLOBAL POSTED LEDGER BALANCE: PASS",
  );

  /*
   * ---------------------------------------------------------
   * ACCOUNT TYPE TOTALS
   * ---------------------------------------------------------
   */

  const byType =
    await prisma.$queryRaw<
      AccountTypeRow[]
    >`
      SELECT
        a."type"::text AS "type",
        COALESCE(
          SUM(jl."debit"),
          0
        )::text AS "debit",
        COALESCE(
          SUM(jl."credit"),
          0
        )::text AS "credit",
        (
          COALESCE(
            SUM(jl."debit"),
            0
          )
          -
          COALESCE(
            SUM(jl."credit"),
            0
          )
        )::text AS "netDebit"
      FROM "journal_entries" je
      INNER JOIN "journal_lines" jl
        ON jl."tenantId" = je."tenantId"
       AND jl."journalEntryId" = je."id"
      INNER JOIN "accounts" a
        ON a."tenantId" = jl."tenantId"
       AND a."id" = jl."accountId"
      WHERE
        je."tenantId" = ${TENANT_ID}::uuid
        AND je."status" = 'POSTED'
      GROUP BY
        a."type"
      ORDER BY
        a."type"
    `;

  console.log("");
  console.log(
    "=== POSTED BALANCES BY ACCOUNT TYPE ===",
  );

  console.dir(byType, {
    depth: null,
  });

  /*
   * ---------------------------------------------------------
   * REPORT CLASSIFICATION CHECK
   * ---------------------------------------------------------
   */

  const profitAndLossAccounts =
    accounts.filter(
      (account) =>
        account.type === "REVENUE" ||
        account.type === "EXPENSE",
    );

  const balanceSheetAccounts =
    accounts.filter(
      (account) =>
        account.type === "ASSET" ||
        account.type === "LIABILITY" ||
        account.type === "EQUITY",
    );

  console.log("");
  console.log(
    "=== REPORT CLASSIFICATION ===",
  );

  console.log(
    "Profit & Loss account count:",
    profitAndLossAccounts.length,
  );

  console.log(
    "Balance Sheet account count:",
    balanceSheetAccounts.length,
  );

  console.log("");
  console.log(
    "Trial Balance: all POSTED ledger accounts.",
  );

  console.log(
    "Profit & Loss: REVENUE + EXPENSE.",
  );

  console.log(
    "Balance Sheet: ASSET + LIABILITY + EQUITY.",
  );

  console.log(
    "Reporting currency:",
    tenant.baseCurrencyCode,
  );

  /*
   * ---------------------------------------------------------
   * REPORTING ARCHITECTURE DECISION
   * ---------------------------------------------------------
   */

  console.log("");
  console.log(
    "=== 15U REPORTING ARCHITECTURE DECISION ===",
  );

  console.log(
    "Source of truth: POSTED JournalEntry + JournalLine.",
  );

  console.log(
    "No reporting balance table required for MVP.",
  );

  console.log(
    "No database migration required for MVP reporting.",
  );

  console.log(
    "Reports will be read-only deterministic ledger views.",
  );

  console.log(
    "Date filtering will use JournalEntry.journalDate.",
  );

  console.log(
    "Currency will use tenant base currency for MVP.",
  );

  console.log("");
  console.log(
    "DATABASE MUTATIONS: NONE",
  );

  console.log(
    "15U.1A FINANCIAL REPORTING DISCOVERY: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15U.1A FINANCIAL REPORTING DISCOVERY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });