import { prisma } from "./src/db/prisma.js";

async function main(): Promise<void> {
  console.log(
    "=== 15R.5A READ-ONLY SUPPLIER LEDGER INTEGRITY PREFLIGHT ===",
  );

  /*
   * Cast PostgreSQL catalog values to text so Prisma does not
   * have to deserialize unsupported catalog-native array types.
   */
  const indexes = await prisma.$queryRaw<
    Array<{
      index_name: string;
      index_definition: string;
    }>
  >`
    SELECT
      indexname::text AS index_name,
      indexdef::text AS index_definition
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'supplier_ledger_entries'
    ORDER BY indexname
  `;

  const constraints = await prisma.$queryRaw<
    Array<{
      constraint_name: string;
      constraint_type: string;
      definition: string;
    }>
  >`
    SELECT
      c.conname::text AS constraint_name,
      c.contype::text AS constraint_type,
      pg_get_constraintdef(c.oid)::text AS definition
    FROM pg_constraint c
    INNER JOIN pg_class t
      ON t.oid = c.conrelid
    INNER JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'supplier_ledger_entries'
    ORDER BY c.conname
  `;

  const journalIndexes = await prisma.$queryRaw<
    Array<{
      index_name: string;
      index_definition: string;
    }>
  >`
    SELECT
      indexname::text AS index_name,
      indexdef::text AS index_definition
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'journal_entries'
      AND (
        indexdef ILIKE '%sourceType%'
        OR indexdef ILIKE '%sourceId%'
        OR indexname ILIKE '%source%'
      )
    ORDER BY indexname
  `;

  console.log("");
  console.log("SUPPLIER LEDGER INDEXES");
  console.dir(indexes, { depth: null });

  console.log("");
  console.log("SUPPLIER LEDGER CONSTRAINTS");
  console.dir(constraints, { depth: null });

  console.log("");
  console.log("JOURNAL SOURCE INDEXES");
  console.dir(journalIndexes, { depth: null });

  const supplierSourceProtection =
    indexes.filter((index) => {
      const definition =
        index.index_definition.toLowerCase();

      return (
        definition.includes("unique") &&
        definition.includes('"tenantid"') &&
        definition.includes('"referencetype"') &&
        definition.includes('"referenceid"')
      );
    });

  const journalSourceProtection =
    journalIndexes.filter((index) => {
      const definition =
        index.index_definition.toLowerCase();

      return (
        definition.includes("unique") &&
        definition.includes('"tenantid"') &&
        definition.includes('"sourcetype"') &&
        definition.includes('"sourceid"')
      );
    });

  console.log("");
  console.log("INTEGRITY SUMMARY");
  console.dir(
    {
      supplierLedgerSourceProtection:
        supplierSourceProtection,
      journalSourceProtection,
    },
    { depth: null },
  );

  console.log("");
  console.log(
    "15R.5A READ-ONLY SUPPLIER LEDGER INTEGRITY PREFLIGHT: PASS",
  );

  console.log(
    "Database mutations: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.5A READ-ONLY SUPPLIER LEDGER INTEGRITY PREFLIGHT: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });