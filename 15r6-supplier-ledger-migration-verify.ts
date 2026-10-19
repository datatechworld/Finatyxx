import { prisma } from "./src/db/prisma.js";

async function main(): Promise<void> {
  console.log(
    "=== 15R.6 POST-DEPLOY VERIFICATION ===",
  );

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
      AND indexname =
        'supplier_ledger_entries_source_idempotency_uidx'
  `;

  console.log("");
  console.log("DEPLOYED INDEX");
  console.dir(indexes, { depth: null });

  if (indexes.length !== 1) {
    throw new Error(
      "SUPPLIER_LEDGER_IDEMPOTENCY_INDEX_MISSING",
    );
  }

  const definition =
    indexes[0]!.index_definition.toLowerCase();

  if (
    !definition.includes("unique") ||
    !definition.includes('"tenantid"') ||
    !definition.includes('"referencetype"') ||
    !definition.includes('"referenceid"')
  ) {
    throw new Error(
      "SUPPLIER_LEDGER_IDEMPOTENCY_INDEX_INVALID",
    );
  }

  const duplicates = await prisma.$queryRaw<
    Array<{
      duplicate_groups: bigint;
    }>
  >`
    SELECT COUNT(*)::bigint AS duplicate_groups
    FROM (
      SELECT
        "tenantId",
        "referenceType",
        "referenceId"
      FROM supplier_ledger_entries
      GROUP BY
        "tenantId",
        "referenceType",
        "referenceId"
      HAVING COUNT(*) > 1
    ) AS duplicate_sources
  `;

  const duplicateGroups =
    duplicates[0]?.duplicate_groups ?? 0n;

  console.log(
    "Duplicate source groups:",
    duplicateGroups.toString(),
  );

  if (duplicateGroups !== 0n) {
    throw new Error(
      "SUPPLIER_LEDGER_DUPLICATES_DETECTED",
    );
  }

  console.log("");
  console.log(
    "15R.6 POST-DEPLOY VERIFICATION: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.6 POST-DEPLOY VERIFICATION: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });