import { prisma } from "./src/db/prisma.ts";

const MIGRATION_NAME =
  "20261007143000_customer_ledger_source_idempotency";

const INDEX_NAME =
  "customer_ledger_entries_source_uidx";

async function main() {
  console.log("=== 15Q.9D MIGRATION #13 PHYSICAL VERIFICATION ===");
  console.log("");

  let failures = 0;

  // ------------------------------------------------------------
  // 1. Prisma migration history
  // ------------------------------------------------------------

  const migrationRows = await prisma.$queryRaw<
    Array<{
      migration_name: string;
      finished_at: string | null;
      rolled_back_at: string | null;
    }>
  >`
    SELECT
      migration_name::text AS migration_name,
      finished_at::text AS finished_at,
      rolled_back_at::text AS rolled_back_at
    FROM public._prisma_migrations
    WHERE migration_name = ${MIGRATION_NAME}
  `;

  console.log("=== PRISMA MIGRATION HISTORY ===");

  if (migrationRows.length !== 1) {
    failures++;
    console.error(
      `FAIL: expected exactly 1 migration-history row, found ${migrationRows.length}`
    );
  } else {
    const migration = migrationRows[0];

    console.log(`Migration: ${migration.migration_name}`);
    console.log(`Finished: ${migration.finished_at !== null}`);
    console.log(`Rolled back: ${migration.rolled_back_at !== null}`);

    if (
      migration.finished_at !== null &&
      migration.rolled_back_at === null
    ) {
      console.log("PASS migration history");
    } else {
      failures++;
      console.error("FAIL migration history");
    }
  }

  // ------------------------------------------------------------
  // 2. Physical index definition
  // ------------------------------------------------------------

  const indexRows = await prisma.$queryRaw<
    Array<{
      index_name: string;
      is_unique: string;
      is_valid: string;
      is_ready: string;
      table_name: string;
    }>
  >`
    SELECT
      idx.relname::text AS index_name,
      i.indisunique::text AS is_unique,
      i.indisvalid::text AS is_valid,
      i.indisready::text AS is_ready,
      tbl.relname::text AS table_name
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class idx
      ON idx.oid = i.indexrelid
    JOIN pg_catalog.pg_class tbl
      ON tbl.oid = i.indrelid
    JOIN pg_catalog.pg_namespace ns
      ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public'
      AND idx.relname = ${INDEX_NAME}
  `;

  console.log("");
  console.log("=== PHYSICAL UNIQUE INDEX ===");

  if (indexRows.length !== 1) {
    failures++;
    console.error(
      `FAIL: expected exactly 1 physical index, found ${indexRows.length}`
    );
  } else {
    const index = indexRows[0];

    console.log(`Index: ${index.index_name}`);
    console.log(`Table: ${index.table_name}`);
    console.log(`Unique: ${index.is_unique}`);
    console.log(`Valid: ${index.is_valid}`);
    console.log(`Ready: ${index.is_ready}`);

    const indexOk =
      index.index_name === INDEX_NAME &&
      index.table_name === "customer_ledger_entries" &&
      index.is_unique === "true" &&
      index.is_valid === "true" &&
      index.is_ready === "true";

    if (indexOk) {
      console.log("PASS physical index");
    } else {
      failures++;
      console.error("FAIL physical index");
    }
  }

  // ------------------------------------------------------------
  // 3. Exact ordered key columns
  // ------------------------------------------------------------

  const columnRows = await prisma.$queryRaw<
    Array<{
      ordinal_position: string;
      column_name: string;
    }>
  >`
    SELECT
      ord.ordinality::text AS ordinal_position,
      att.attname::text AS column_name
    FROM pg_catalog.pg_class idx
    JOIN pg_catalog.pg_namespace ns
      ON ns.oid = idx.relnamespace
    JOIN pg_catalog.pg_index i
      ON i.indexrelid = idx.oid
    CROSS JOIN LATERAL
      unnest(i.indkey) WITH ORDINALITY AS ord(attnum, ordinality)
    JOIN pg_catalog.pg_attribute att
      ON att.attrelid = i.indrelid
     AND att.attnum = ord.attnum
    WHERE ns.nspname = 'public'
      AND idx.relname = ${INDEX_NAME}
    ORDER BY ord.ordinality
  `;

  console.log("");
  console.log("=== INDEX KEY ORDER ===");

  for (const column of columnRows) {
    console.log(
      `${column.ordinal_position}: ${column.column_name}`
    );
  }

  const expectedColumns = [
    "tenantId",
    "referenceType",
    "referenceId",
  ];

  const actualColumns = columnRows.map(
    (column) => column.column_name
  );

  const columnsOk =
    actualColumns.length === expectedColumns.length &&
    actualColumns.every(
      (column, index) => column === expectedColumns[index]
    );

  if (columnsOk) {
    console.log("PASS exact index key order");
  } else {
    failures++;
    console.error("FAIL exact index key order");
    console.error("Expected:", expectedColumns);
    console.error("Actual:", actualColumns);
  }

  // ------------------------------------------------------------
  // Final result
  // ------------------------------------------------------------

  console.log("");
  console.log("=== FINAL RESULT ===");

  if (failures > 0) {
    console.error(
      `15Q.9D MIGRATION #13 VERIFICATION: FAILED (${failures} issue(s))`
    );
    process.exitCode = 1;
    return;
  }

  console.log("15Q.9D MIGRATION #13 VERIFICATION: PASS");
  console.log(
    "Customer Ledger source idempotency is physically enforced."
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("15Q.9D MIGRATION #13 VERIFICATION: ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });