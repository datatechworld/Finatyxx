import { prisma } from "./src/db/prisma.ts";

async function main() {
  console.log("=== 15Q.9B CUSTOMER LEDGER IDEMPOTENCY PREFLIGHT ===");
  console.log("");

  const duplicateSources = await prisma.$queryRaw<
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
    FROM public.customer_ledger_entries
    GROUP BY "tenantId", "referenceType", "referenceId"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, "tenantId", "referenceType", "referenceId"
  `;

  const totalEntries = await prisma.customerLedgerEntry.count();

  console.log("Customer ledger entries:", totalEntries);
  console.log("Duplicate source identities:", duplicateSources.length);

  if (duplicateSources.length > 0) {
    console.log("");
    console.error("Duplicate source identities found:");

    for (const row of duplicateSources) {
      console.error(
        `${row.tenant_id} | ${row.reference_type} | ${row.reference_id} | rows=${row.row_count.toString()}`
      );
    }

    console.log("");
    console.error("15Q.9B PREFLIGHT: FAILED");
    console.error(
      "Do NOT create the uniqueness migration until these duplicates are investigated."
    );

    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("15Q.9B PREFLIGHT: PASS");
  console.log(
    "No duplicate (tenantId, referenceType, referenceId) identities exist."
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("15Q.9B PREFLIGHT: ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });