import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

function money(
  value: Prisma.Decimal | null | undefined,
): string {
  return value?.toString() ?? "0";
}

async function main(): Promise<void> {
  console.log(
    "=== 15U.1 FINANCIAL REPORTING ARCHITECTURE DISCOVERY ===",
  );

  /*
   * ---------------------------------------------------------
   * TENANT
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

  console.log("");
  console.log("=== TENANT ===");
  console.dir(tenant, { depth: null });

  /*
   * ---------------------------------------------------------
   * ACCOUNTING SETTINGS
   * ---------------------------------------------------------
   */

  const accountingSettings =
    await prisma.accountingSetting.findMany({
      where: {
        tenantId: TENANT_ID,
      },
    });

  console.log("");
  console.log("=== ACCOUNTING SETTINGS ===");
  console.dir(accountingSettings, {
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
      orderBy: {
        code: "asc",
      },
    });

  console.log("");
  console.log("=== CHART OF ACCOUNTS ===");

  for (const account of accounts) {
    console.log({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      normalBalance: account.normalBalance,
      parentId: account.parentId,
      isControlAccount:
        account.isControlAccount,
      allowManualPosting:
        account.allowManualPosting,
      status: account.status,
    });
  }

  console.log("");
  console.log(
    "Account count:",
    accounts.length,
  );

  /*
   * ---------------------------------------------------------
   * POSTED JOURNAL ENTRIES
   * ---------------------------------------------------------
   */

  const postedEntries =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        status: "POSTED",
      },
      include: {
        lines: true,
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
    "=== POSTED JOURNAL ENTRIES ===",
  );

  for (const entry of postedEntries) {
    console.log("");
    console.log({
      id: entry.id,
      journalNumber:
        entry.journalNumber,
      journalDate:
        entry.journalDate,
      description:
        entry.description,
      sourceType:
        entry.sourceType,
      sourceId:
        entry.sourceId,
      status:
        entry.status,
      currencyCode:
        entry.currencyCode,
      exchangeRate:
        money(entry.exchangeRate),
      lineCount:
        entry.lines.length,
    });

    for (const line of entry.lines) {
      console.log({
        lineId: line.id,
        accountId:
          line.accountId,
        debit:
          money(line.debit),
        credit:
          money(line.credit),
        description:
          line.description,
        customerId:
          line.customerId,
        supplierId:
          line.supplierId,
        employeeId:
          line.employeeId,
        projectId:
          line.projectId,
      });
    }
  }

  console.log("");
  console.log(
    "Posted Journal Entry count:",
    postedEntries.length,
  );

  /*
   * ---------------------------------------------------------
   * AUTHORITATIVE POSTED LEDGER AGGREGATION
   * ---------------------------------------------------------
   */

  const balances =
    await prisma.$queryRaw<
      Array<{
        accountId: string;
        code: string;
        name: string;
        type: string;
        normalBalance: string;
        debit: string;
        credit: string;
        netDebit: string;
      }>
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
      FROM "accounts" a
      LEFT JOIN "journal_lines" jl
        ON jl."tenantId" = a."tenantId"
       AND jl."accountId" = a."id"
      LEFT JOIN "journal_entries" je
        ON je."tenantId" = jl."tenantId"
       AND je."id" = jl."journalEntryId"
       AND je."status" = 'POSTED'
      WHERE
        a."tenantId" = ${TENANT_ID}::uuid
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
    "=== POSTED ACCOUNT BALANCES ===",
  );

  for (const balance of balances) {
    console.log(balance);
  }

  /*
   * ---------------------------------------------------------
   * GLOBAL TRIAL BALANCE CHECK
   * ---------------------------------------------------------
   */

  const totals =
    await prisma.$queryRaw<
      Array<{
        totalDebit: string;
        totalCredit: string;
        difference: string;
      }>
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
      FROM "journal_lines" jl
      INNER JOIN "journal_entries" je
        ON je."tenantId" = jl."tenantId"
       AND je."id" = jl."journalEntryId"
      WHERE
        jl."tenantId" = ${TENANT_ID}::uuid
        AND je."status" = 'POSTED'
    `;

  const total = totals[0];

  if (!total) {
    throw new Error(
      "Trial balance totals query returned no row.",
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

  const difference =
    new Prisma.Decimal(
      total.difference,
    );

  if (!difference.equals(0)) {
    throw new Error(
      `POSTED GENERAL LEDGER IS NOT BALANCED. Difference: ${difference.toString()}`,
    );
  }

  console.log("");
  console.log(
    "GLOBAL POSTED LEDGER BALANCE: PASS",
  );

  /*
   * ---------------------------------------------------------
   * ACCOUNT TYPE AGGREGATION
   * ---------------------------------------------------------
   */

  const byType =
    await prisma.$queryRaw<
      Array<{
        type: string;
        debit: string;
        credit: string;
        netDebit: string;
      }>
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
      FROM "accounts" a
      LEFT JOIN "journal_lines" jl
        ON jl."tenantId" = a."tenantId"
       AND jl."accountId" = a."id"
      LEFT JOIN "journal_entries" je
        ON je."tenantId" = jl."tenantId"
       AND je."id" = jl."journalEntryId"
       AND je."status" = 'POSTED'
      WHERE
        a."tenantId" = ${TENANT_ID}::uuid
      GROUP BY
        a."type"
      ORDER BY
        a."type"
    `;

  console.log("");
  console.log(
    "=== BALANCES BY ACCOUNT TYPE ===",
  );

  console.dir(byType, {
    depth: null,
  });

  /*
   * ---------------------------------------------------------
   * REPORTING CONTRACT SUMMARY
   * ---------------------------------------------------------
   */

  console.log("");
  console.log(
    "=== REPORTING CONTRACT CANDIDATE ===",
  );

  console.log(
    "Trial Balance source: POSTED JournalEntry + JournalLine.",
  );

  console.log(
    "Profit & Loss candidate account types: REVENUE + EXPENSE.",
  );

  console.log(
    "Balance Sheet candidate account types: ASSET + LIABILITY + EQUITY.",
  );

  console.log(
    "Report currency candidate:",
    tenant.baseCurrencyCode,
  );

  console.log(
    "JournalLine debit/credit remain authoritative monetary values.",
  );

  console.log("");
  console.log(
    "15U.1 DATABASE MUTATIONS: NONE",
  );

  console.log(
    "15U.1 FINANCIAL REPORTING DISCOVERY: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15U.1 FINANCIAL REPORTING DISCOVERY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });