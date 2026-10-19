import { prisma } from "./db/prisma.ts";

type AuditResult = {
  check_name: string;
  invalid_count: bigint;
};

async function main() {
  console.log("Finatyx — Migration #9 Preflight Audit");
  console.log("======================================");
  console.log("READ-ONLY audit. No database changes will be made.\n");

  const results = await prisma.$queryRaw<AuditResult[]>`
    SELECT *
    FROM (
      SELECT
        'JournalEntry.branchId -> Branch'::text AS check_name,
        COUNT(*)::bigint AS invalid_count
      FROM journal_entries je
      LEFT JOIN branches b
        ON b.id = je."branchId"
       AND b."tenantId" = je."tenantId"
      WHERE je."branchId" IS NOT NULL
        AND b.id IS NULL

      UNION ALL

      SELECT
        'JournalLine.customerId -> Customer'::text,
        COUNT(*)::bigint
      FROM journal_lines jl
      LEFT JOIN customers c
        ON c.id = jl."customerId"
       AND c."tenantId" = jl."tenantId"
      WHERE jl."customerId" IS NOT NULL
        AND c.id IS NULL

      UNION ALL

      SELECT
        'JournalLine.supplierId -> Supplier'::text,
        COUNT(*)::bigint
      FROM journal_lines jl
      LEFT JOIN suppliers s
        ON s.id = jl."supplierId"
       AND s."tenantId" = jl."tenantId"
      WHERE jl."supplierId" IS NOT NULL
        AND s.id IS NULL

      UNION ALL

      SELECT
        'JournalLine.employeeId -> Employee'::text,
        COUNT(*)::bigint
      FROM journal_lines jl
      LEFT JOIN employees e
        ON e.id = jl."employeeId"
       AND e."tenantId" = jl."tenantId"
      WHERE jl."employeeId" IS NOT NULL
        AND e.id IS NULL

      UNION ALL

      SELECT
        'JournalLine.projectId -> Project'::text,
        COUNT(*)::bigint
      FROM journal_lines jl
      LEFT JOIN projects p
        ON p.id = jl."projectId"
       AND p."tenantId" = jl."tenantId"
      WHERE jl."projectId" IS NOT NULL
        AND p.id IS NULL
    ) audit
    ORDER BY check_name;
  `;

  let failed = false;

  console.log("Results:");
  console.log("--------");

  for (const result of results) {
    const count = Number(result.invalid_count);

    console.log(
      `${count === 0 ? "PASS" : "FAIL"} | ${result.check_name} | invalid rows: ${count}`,
    );

    if (count !== 0) {
      failed = true;
    }
  }

  console.log("");

  if (failed) {
    console.error(
      "PRECHECK FAILED: Migration #9 must NOT be created or deployed.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    "PRECHECK PASSED: No orphaned or cross-tenant GL dimension references were found.",
  );
}

main()
  .catch((error) => {
    console.error("PRECHECK ERROR:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });