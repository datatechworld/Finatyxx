import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main() {
  console.log(
    "=== 15Q.11B FINANCIAL ACCOUNT INTEGRITY PREFLIGHT ===",
  );

  console.log("");
  console.log("=== TEST TENANT FINANCIAL ACCOUNTS ===");

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
        branchId: true,
        name: true,
        accountType: true,
        currencyCode: true,
        bankName: true,
        mobileMoneyProvider: true,
        ledgerAccountId: true,
        status: true,
        openingBalance: true,
        currentBalanceCache: true,
      },
    });

  console.log(
    financialAccounts.map((account) => ({
      ...account,
      openingBalance:
        account.openingBalance.toString(),
      currentBalanceCache:
        account.currentBalanceCache.toString(),
    })),
  );

  console.log(
    "Financial account count:",
    financialAccounts.length,
  );

  console.log("");
  console.log("=== PAYMENT COUNTS ===");

  const paymentCount = await prisma.payment.count({
    where: {
      tenantId: TENANT_ID,
    },
  });

  const allocationCount =
    await prisma.paymentAllocation.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  console.log({
    paymentCount,
    allocationCount,
  });

  console.log("");
  console.log(
    "=== PHYSICAL FOREIGN KEY CONSTRAINTS ===",
  );

  /*
   * Cast every PostgreSQL catalog value to text.
   * Prisma's PG adapter cannot safely deserialize every
   * native catalog type directly.
   */
  const constraints = await prisma.$queryRaw<
    Array<{
      table_name: string;
      constraint_name: string;
      constraint_definition: string;
    }>
  >`
    SELECT
      c.conrelid::regclass::text AS table_name,
      c.conname::text AS constraint_name,
      pg_get_constraintdef(c.oid)::text
        AS constraint_definition
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid IN (
        'public.financial_accounts'::regclass,
        'public.payments'::regclass,
        'public.payment_allocations'::regclass
      )
    ORDER BY
      c.conrelid::regclass::text,
      c.conname::text
  `;

  console.table(constraints);

  console.log("");
  console.log(
    "=== RELEVANT PHYSICAL INDEXES ===",
  );

  const indexes = await prisma.$queryRaw<
    Array<{
      table_name: string;
      index_name: string;
      index_definition: string;
    }>
  >`
    SELECT
      tablename::text AS table_name,
      indexname::text AS index_name,
      indexdef::text AS index_definition
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (
        'financial_accounts',
        'payments',
        'payment_allocations'
      )
    ORDER BY
      tablename,
      indexname
  `;

  console.table(indexes);

  console.log("");
  console.log(
    "=== LEDGER ACCOUNT REFERENCE VALIDITY ===",
  );

  const ledgerReferences = await prisma.$queryRaw<
    Array<{
      financial_account_id: string;
      financial_account_name: string;
      financial_account_type: string;
      ledger_account_id: string | null;
      ledger_code: string | null;
      ledger_name: string | null;
      ledger_status: string | null;
      same_tenant: boolean | null;
    }>
  >`
    SELECT
      fa.id::text AS financial_account_id,
      fa.name::text AS financial_account_name,
      fa."accountType"::text AS financial_account_type,
      fa."ledgerAccountId"::text AS ledger_account_id,
      a.code::text AS ledger_code,
      a.name::text AS ledger_name,
      a.status::text AS ledger_status,
      CASE
        WHEN a.id IS NULL THEN NULL
        ELSE a."tenantId" = fa."tenantId"
      END AS same_tenant
    FROM public.financial_accounts fa
    LEFT JOIN public.accounts a
      ON a.id = fa."ledgerAccountId"
    WHERE fa."tenantId" = ${TENANT_ID}::uuid
    ORDER BY fa.name
  `;

  console.table(ledgerReferences);

  console.log("");
  console.log(
    "=== PAYMENT/FINANCIAL ACCOUNT FK DETECTION ===",
  );

  const paymentFinancialAccountFk =
    constraints.filter(
      (row) =>
        row.table_name.endsWith("payments") &&
        row.constraint_definition.includes(
          "financialAccountId",
        ),
    );

  const financialLedgerAccountFk =
    constraints.filter(
      (row) =>
        row.table_name.endsWith(
          "financial_accounts",
        ) &&
        row.constraint_definition.includes(
          "ledgerAccountId",
        ),
    );

  console.log({
    paymentFinancialAccountFkCount:
      paymentFinancialAccountFk.length,
    financialLedgerAccountFkCount:
      financialLedgerAccountFk.length,
  });

  console.log("");
  console.log(
    "=== 15Q.11B PREFLIGHT COMPLETE ===",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.11B FINANCIAL ACCOUNT INTEGRITY PREFLIGHT: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });