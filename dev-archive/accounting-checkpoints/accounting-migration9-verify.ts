import { prisma } from "./db/prisma.ts";

type Check = {
  name: string;
  passed: boolean;
  detail: string;
};

async function main() {
  const checks: Check[] = [];

  const add = (name: string, passed: boolean, detail: string) => {
    checks.push({ name, passed, detail });
  };

  console.log("Finatyx — Migration #9 Physical Database Verification");
  console.log("=====================================================");
  console.log("READ-ONLY audit. No database changes will be made.\n");

  // 1. New tables
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name::text AS table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('accounting_profiles', 'system_account_mappings')
    ORDER BY table_name
  `;
  const tableNames = new Set(tables.map((r) => r.table_name));
  for (const name of ["accounting_profiles", "system_account_mappings"]) {
    add(`table ${name}`, tableNames.has(name), tableNames.has(name) ? "exists" : "MISSING");
  }

  // 2. New enum types
  const enums = await prisma.$queryRaw<Array<{ enum_name: string }>>`
    SELECT t.typname::text AS enum_name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname IN ('AccountingFramework', 'SystemAccountPurpose')
    ORDER BY t.typname
  `;
  const enumNames = new Set(enums.map((r) => r.enum_name));
  for (const name of ["AccountingFramework", "SystemAccountPurpose"]) {
    add(`enum ${name}`, enumNames.has(name), enumNames.has(name) ? "exists" : "MISSING");
  }

  // 3. Migration #9 foreign keys: existence + validation
  const expectedFks = [
    "accounting_profiles_tenantId_fkey",
    "system_account_mappings_tenantId_fkey",
    "system_account_mappings_tenantId_accountId_fkey",
    "journal_entries_tenantId_branchId_fkey",
    "journal_lines_tenantId_customerId_fkey",
    "journal_lines_tenantId_supplierId_fkey",
    "journal_lines_tenantId_employeeId_fkey",
    "journal_lines_tenantId_projectId_fkey",
  ];

  const fks = await prisma.$queryRaw<Array<{
    constraint_name: string;
    validated: boolean;
    definition: string;
  }>>`
    SELECT
      c.conname::text AS constraint_name,
      c.convalidated AS validated,
      pg_get_constraintdef(c.oid, true)::text AS definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
      AND c.contype = 'f'
      AND c.conname IN (
        'accounting_profiles_tenantId_fkey',
        'system_account_mappings_tenantId_fkey',
        'system_account_mappings_tenantId_accountId_fkey',
        'journal_entries_tenantId_branchId_fkey',
        'journal_lines_tenantId_customerId_fkey',
        'journal_lines_tenantId_supplierId_fkey',
        'journal_lines_tenantId_employeeId_fkey',
        'journal_lines_tenantId_projectId_fkey'
      )
    ORDER BY c.conname
  `;

  const fkMap = new Map(fks.map((r) => [r.constraint_name, r]));
  for (const name of expectedFks) {
    const row = fkMap.get(name);
    add(
      `FK ${name}`,
      Boolean(row?.validated),
      row ? `validated=${row.validated}; ${row.definition}` : "MISSING",
    );
  }

  // 4. Required indexes
  const expectedIndexes = [
    "system_account_mappings_tenantId_accountId_idx",
    "system_account_mappings_tenantId_purpose_key",
    "system_account_mappings_tenantId_id_key",
    "journal_lines_tenantId_employeeId_idx",
    "journal_lines_tenantId_projectId_idx",
  ];

  const indexes = await prisma.$queryRaw<Array<{
    index_name: string;
    definition: string;
  }>>`
    SELECT
      indexname::text AS index_name,
      indexdef::text AS definition
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'system_account_mappings_tenantId_accountId_idx',
        'system_account_mappings_tenantId_purpose_key',
        'system_account_mappings_tenantId_id_key',
        'journal_lines_tenantId_employeeId_idx',
        'journal_lines_tenantId_projectId_idx'
      )
    ORDER BY indexname
  `;
  const indexMap = new Map(indexes.map((r) => [r.index_name, r.definition]));
  for (const name of expectedIndexes) {
    const definition = indexMap.get(name);
    add(`index ${name}`, Boolean(definition), definition ?? "MISSING");
  }

  // 5. RLS enabled on both new tenant-owned tables
  const rls = await prisma.$queryRaw<Array<{
    table_name: string;
    rls_enabled: boolean;
    force_rls: boolean;
  }>>`
    SELECT
      c.relname::text AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS force_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN ('accounting_profiles', 'system_account_mappings')
    ORDER BY c.relname
  `;
  const rlsMap = new Map(rls.map((r) => [r.table_name, r]));
  for (const name of ["accounting_profiles", "system_account_mappings"]) {
    const row = rlsMap.get(name);
    add(
      `RLS ${name}`,
      Boolean(row?.rls_enabled) && row?.force_rls === false,
      row
        ? `enabled=${row.rls_enabled}; forced=${row.force_rls}`
        : "MISSING",
    );
  }

  // 6. Tenant SELECT policies
  const policies = await prisma.$queryRaw<Array<{
    table_name: string;
    policy_name: string;
    command: string;
    roles: string;
    using_expression: string | null;
  }>>`
    SELECT
      tablename::text AS table_name,
      policyname::text AS policy_name,
      cmd::text AS command,
      array_to_string(roles, ',')::text AS roles,
      qual::text AS using_expression
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'accounting_profiles_tenant_select',
        'system_account_mappings_tenant_select'
      )
    ORDER BY policyname
  `;

  const expectedPolicies = new Map([
    ["accounting_profiles_tenant_select", "accounting_profiles"],
    ["system_account_mappings_tenant_select", "system_account_mappings"],
  ]);

  for (const [policyName, tableName] of expectedPolicies) {
    const row = policies.find((p) => p.policy_name === policyName);
    const roleOk = Boolean(row?.roles.split(",").map((s) => s.trim()).includes("authenticated"));
    const usingOk = Boolean(row?.using_expression?.includes('is_active_tenant_member'));
    add(
      `policy ${policyName}`,
      Boolean(row) &&
        row?.table_name === tableName &&
        row?.command === "SELECT" &&
        roleOk &&
        usingOk,
      row
        ? `table=${row.table_name}; cmd=${row.command}; roles=${row.roles}; using=${row.using_expression}`
        : "MISSING",
    );
  }

  // 7. Browser-role direct CRUD privileges must remain zero.
  const privileges = await prisma.$queryRaw<Array<{
    grantee: string;
    table_name: string;
    privilege_type: string;
  }>>`
    SELECT
      grantee::text AS grantee,
      table_name::text AS table_name,
      privilege_type::text AS privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('accounting_profiles', 'system_account_mappings')
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ORDER BY grantee, table_name, privilege_type
  `;
  add(
    "browser-role CRUD privileges on new tables",
    privileges.length === 0,
    privileges.length === 0
      ? "none"
      : privileges.map((p) => `${p.grantee}:${p.table_name}:${p.privilege_type}`).join("; "),
  );

  // 8. Protected document sequence index must still exist and retain
  // NULLS NOT DISTINCT behavior.
  const protectedIndex = await prisma.$queryRaw<Array<{
    index_name: string;
    definition: string;
    nulls_not_distinct: boolean;
  }>>`
    SELECT
      i.relname::text AS index_name,
      pg_get_indexdef(i.oid)::text AS definition,
      x.indnullsnotdistinct AS nulls_not_distinct
    FROM pg_class i
    JOIN pg_namespace n ON n.oid = i.relnamespace
    JOIN pg_index x ON x.indexrelid = i.oid
    WHERE n.nspname = 'public'
      AND i.relname = 'document_sequences_scope_uidx'
  `;
  const protectedRow = protectedIndex[0];
  add(
    "protected document_sequences_scope_uidx",
    Boolean(protectedRow) && protectedRow?.nulls_not_distinct === true,
    protectedRow
      ? `nulls_not_distinct=${protectedRow.nulls_not_distinct}; ${protectedRow.definition}`
      : "MISSING",
  );

  // 9. Existing physical journal-reversal names must remain unchanged.
  const reversalFk = await prisma.$queryRaw<Array<{ object_name: string }>>`
    SELECT c.conname::text AS object_name
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
      AND c.conname = 'journal_entries_tenantid_reversalofid_fkey'
  `;
  add(
    "existing journal reversal FK physical name",
    reversalFk.length === 1,
    reversalFk.length === 1
      ? "journal_entries_tenantid_reversalofid_fkey preserved"
      : "MISSING or renamed",
  );

  const reversalIndex = await prisma.$queryRaw<Array<{ object_name: string }>>`
    SELECT i.relname::text AS object_name
    FROM pg_class i
    JOIN pg_namespace n ON n.oid = i.relnamespace
    WHERE n.nspname = 'public'
      AND i.relkind = 'i'
      AND i.relname = 'journal_entries_tenantid_reversalofid_key'
  `;
  add(
    "existing journal reversal index physical name",
    reversalIndex.length === 1,
    reversalIndex.length === 1
      ? "journal_entries_tenantid_reversalofid_key preserved"
      : "MISSING or renamed",
  );

  console.log("Results:");
  console.log("--------");
  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} | ${check.name} | ${check.detail}`);
  }

  const failed = checks.filter((c) => !c.passed);

  console.log("\nSummary:");
  console.log("--------");
  console.log(`Total checks: ${checks.length}`);
  console.log(`Passed: ${checks.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.error("\nVERIFICATION FAILED: One or more Migration #9 physical database checks failed.");
    process.exitCode = 1;
  } else {
    console.log("\nVERIFICATION PASSED: Migration #9 physical database state matches the approved design.");
  }
}

main()
  .catch((error) => {
    console.error("\nVERIFICATION ERROR:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
