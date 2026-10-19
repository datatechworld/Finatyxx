import { prisma } from "./src/db/prisma.ts";

const MIGRATION_NAME =
  "20261007223000_financial_account_integrity";

async function main() {
  console.log(
    "=== 15Q.11I FINANCIAL ACCOUNT INTEGRITY PHYSICAL VERIFIER ===",
  );

  console.log("");
  console.log("=== MIGRATION STATE ===");

  const migrations = await prisma.$queryRaw<
    Array<{
      migration_name: string;
      finished_at: string | null;
      rolled_back_at: string | null;
      applied_steps_count: string;
    }>
  >`
    SELECT
      migration_name::text AS migration_name,
      finished_at::text AS finished_at,
      rolled_back_at::text AS rolled_back_at,
      applied_steps_count::text AS applied_steps_count
    FROM public._prisma_migrations
    WHERE migration_name = ${MIGRATION_NAME}
  `;

  console.table(migrations);

  console.log("");
  console.log("=== PHYSICAL FOREIGN KEYS ===");

  const constraints = await prisma.$queryRaw<
    Array<{
      table_name: string;
      constraint_name: string;
      constraint_definition: string;
      validated: string;
    }>
  >`
    SELECT
      c.conrelid::regclass::text AS table_name,
      c.conname::text AS constraint_name,
      pg_get_constraintdef(c.oid)::text
        AS constraint_definition,
      c.convalidated::text AS validated
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conname IN (
        'financial_accounts_tenantId_ledgerAccountId_fkey',
        'payments_tenantId_financialAccountId_fkey'
      )
    ORDER BY c.conname
  `;

  console.table(constraints);

  console.log("");
  console.log("=== COLUMN-LEVEL FK STRUCTURE ===");

  const columns = await prisma.$queryRaw<
    Array<{
      constraint_name: string;
      source_table: string;
      source_columns: string;
      target_table: string;
      target_columns: string;
      update_action: string;
      delete_action: string;
      validated: string;
    }>
  >`
    SELECT
      c.conname::text AS constraint_name,
      c.conrelid::regclass::text AS source_table,

      (
        SELECT string_agg(
          a.attname::text,
          ',' ORDER BY u.ordinality
        )
        FROM unnest(c.conkey)
          WITH ORDINALITY AS u(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = u.attnum
      )::text AS source_columns,

      c.confrelid::regclass::text AS target_table,

      (
        SELECT string_agg(
          a.attname::text,
          ',' ORDER BY u.ordinality
        )
        FROM unnest(c.confkey)
          WITH ORDINALITY AS u(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = c.confrelid
         AND a.attnum = u.attnum
      )::text AS target_columns,

      c.confupdtype::text AS update_action,
      c.confdeltype::text AS delete_action,
      c.convalidated::text AS validated

    FROM pg_constraint c

    WHERE c.contype = 'f'
      AND c.conname IN (
        'financial_accounts_tenantId_ledgerAccountId_fkey',
        'payments_tenantId_financialAccountId_fkey'
      )

    ORDER BY c.conname
  `;

  console.table(columns);

  console.log("");
  console.log("=== ASSERTIONS ===");

  const migration =
    migrations.length === 1
      ? migrations[0]
      : undefined;

  const migrationPassed =
    migration !== undefined &&
    migration.finished_at !== null &&
    migration.rolled_back_at === null;

  console.log(
    "Migration recorded and finished:",
    migrationPassed,
  );

  const financialFk = columns.find(
    (row) =>
      row.constraint_name ===
      "financial_accounts_tenantId_ledgerAccountId_fkey",
  );

  const paymentFk = columns.find(
    (row) =>
      row.constraint_name ===
      "payments_tenantId_financialAccountId_fkey",
  );

  const financialFkPassed =
    financialFk !== undefined &&
    financialFk.source_table.endsWith(
      "financial_accounts",
    ) &&
    financialFk.source_columns ===
      "tenantId,ledgerAccountId" &&
    financialFk.target_table.endsWith("accounts") &&
    financialFk.target_columns === "tenantId,id" &&
    financialFk.update_action === "c" &&
    financialFk.delete_action === "r" &&
    financialFk.validated === "true";

  const paymentFkPassed =
    paymentFk !== undefined &&
    paymentFk.source_table.endsWith("payments") &&
    paymentFk.source_columns ===
      "tenantId,financialAccountId" &&
    paymentFk.target_table.endsWith(
      "financial_accounts",
    ) &&
    paymentFk.target_columns === "tenantId,id" &&
    paymentFk.update_action === "c" &&
    paymentFk.delete_action === "r" &&
    paymentFk.validated === "true";

  console.log(
    "FinancialAccount -> Account FK:",
    financialFkPassed,
  );

  console.log(
    "Payment -> FinancialAccount FK:",
    paymentFkPassed,
  );

  const passed =
    migrationPassed &&
    constraints.length === 2 &&
    financialFkPassed &&
    paymentFkPassed;

  console.log("");
  console.log(
    passed
      ? "15Q.11I PHYSICAL VERIFICATION: PASS"
      : "15Q.11I PHYSICAL VERIFICATION: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.11I PHYSICAL VERIFICATION: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });