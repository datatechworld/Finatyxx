import { prisma } from "./src/db/prisma.js";

async function main(): Promise<void> {
  console.log(
    "=== 15R.6 READ-ONLY DUPLICATE PREFLIGHT ===",
  );

  const duplicates = await prisma.$queryRaw<
    Array<{
      tenant_id: string;
      reference_type: string;
      reference_id: string;
      row_count: bigint;
    }>
  >`
    SELECT
      "tenantId"::text AS tenant_id,
      "referenceType"::text AS reference_type,
      "referenceId"::text AS reference_id,
      COUNT(*)::bigint AS row_count
    FROM supplier_ledger_entries
    GROUP BY
      "tenantId",
      "referenceType",
      "referenceId"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `;

  const rowCountResult = await prisma.$queryRaw<
    Array<{
      row_count: bigint;
    }>
  >`
    SELECT COUNT(*)::bigint AS row_count
    FROM supplier_ledger_entries
  `;

  const rowCount =
    rowCountResult[0]?.row_count ?? 0n;

  console.log("");
  console.log(
    "Supplier ledger row count:",
    rowCount.toString(),
  );

  console.log("");
  console.log("Duplicate source groups:");
  console.dir(
    duplicates.map((row) => ({
      ...row,
      row_count: row.row_count.toString(),
    })),
    { depth: null },
  );

  if (duplicates.length !== 0) {
    throw new Error(
      "SUPPLIER_LEDGER_SOURCE_DUPLICATES_EXIST",
    );
  }

  console.log("");
  console.log(
    "15R.6 DUPLICATE PREFLIGHT: PASS",
  );

  console.log(
    "Database mutations: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.6 DUPLICATE PREFLIGHT: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });