import { prisma } from "./src/db/prisma.js";

async function main(): Promise<void> {
  console.log("");
  console.log("=== 15S.1 DATABASE DISCOVERY ===");

  const constraints =
    await prisma.$queryRawUnsafe<
      Array<{
        table_name: string;
        constraint_name: string;
        constraint_type: string;
        definition: string;
      }>
    >(`
      SELECT
        c.relname::text AS table_name,
        con.conname::text AS constraint_name,
        CASE con.contype
          WHEN 'p' THEN 'PRIMARY KEY'
          WHEN 'f' THEN 'FOREIGN KEY'
          WHEN 'u' THEN 'UNIQUE'
          WHEN 'c' THEN 'CHECK'
          WHEN 'x' THEN 'EXCLUSION'
          ELSE con.contype::text
        END::text AS constraint_type,
        pg_get_constraintdef(con.oid)::text AS definition
      FROM pg_constraint con
      JOIN pg_class c
        ON c.oid = con.conrelid
      JOIN pg_namespace n
        ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND (
          c.relname ILIKE '%expense%'
          OR c.relname IN (
            'financial_accounts',
            'system_account_mappings'
          )
        )
      ORDER BY
        c.relname,
        con.conname
    `);

  console.log("");
  console.log("=== RELEVANT CONSTRAINTS ===");

  console.dir(
    constraints,
    { depth: null },
  );

  const indexes =
    await prisma.$queryRawUnsafe<
      Array<{
        table_name: string;
        index_name: string;
        index_definition: string;
      }>
    >(`
      SELECT
        tablename::text AS table_name,
        indexname::text AS index_name,
        indexdef::text AS index_definition
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (
          tablename ILIKE '%expense%'
          OR tablename IN (
            'financial_accounts',
            'system_account_mappings'
          )
        )
      ORDER BY
        tablename,
        indexname
    `);

  console.log("");
  console.log("=== RELEVANT INDEXES ===");

  console.dir(
    indexes,
    { depth: null },
  );

  const columns =
    await prisma.$queryRawUnsafe<
      Array<{
        table_name: string;
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
        column_default: string | null;
      }>
    >(`
      SELECT
        table_name::text,
        column_name::text,
        data_type::text,
        udt_name::text,
        is_nullable::text,
        column_default::text
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name ILIKE '%expense%'
      ORDER BY
        table_name,
        ordinal_position
    `);

  console.log("");
  console.log("=== EXPENSE TABLE COLUMNS ===");

  console.dir(
    columns,
    { depth: null },
  );

  const mappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId:
          "9af89483-476a-4367-99b0-8cc15abc0011",
      },
      include: {
        account: true,
      },
      orderBy: {
        purpose: "asc",
      },
    });

  console.log("");
  console.log("=== SYSTEM ACCOUNT MAPPINGS ===");

  console.dir(
    mappings.map((mapping) => ({
      id: mapping.id,
      purpose: mapping.purpose,
      accountId: mapping.accountId,
      accountCode: mapping.account.code,
      accountName: mapping.account.name,
      accountType: mapping.account.accountType,
      normalBalance:
        mapping.account.normalBalance,
      status: mapping.account.status,
      isControlAccount:
        mapping.account.isControlAccount,
      allowManualPosting:
        mapping.account.allowManualPosting,
    })),
    { depth: null },
  );

  const expenseAccounts =
    await prisma.account.findMany({
      where: {
        tenantId:
          "9af89483-476a-4367-99b0-8cc15abc0011",
        accountType: "EXPENSE",
      },
      select: {
        id: true,
        code: true,
        name: true,
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
  console.log("=== AVAILABLE EXPENSE GL ACCOUNTS ===");

  console.dir(
    expenseAccounts,
    { depth: null },
  );

  const financialAccounts =
    await prisma.financialAccount.findMany({
      where: {
        tenantId:
          "9af89483-476a-4367-99b0-8cc15abc0011",
      },
      select: {
        id: true,
        branchId: true,
        name: true,
        accountType: true,
        currencyCode: true,
        ledgerAccountId: true,
        status: true,
        openingBalance: true,
        currentBalanceCache: true,
      },
      orderBy: {
        name: "asc",
      },
    });

  console.log("");
  console.log("=== FINANCIAL ACCOUNTS ===");

  console.dir(
    financialAccounts.map((account) => ({
      ...account,
      openingBalance:
        account.openingBalance.toString(),
      currentBalanceCache:
        account.currentBalanceCache.toString(),
    })),
    { depth: null },
  );

  console.log("");
  console.log(
    "15S.1 DATABASE DISCOVERY: PASS",
  );

  console.log(
    "DATABASE MUTATIONS: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15S.1 DATABASE DISCOVERY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });