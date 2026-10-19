import { prisma } from "./src/db/prisma.js";

async function main(): Promise<void> {
  console.log(
    "=== 15R.8 POST-DEPLOY BRANCH VERIFICATION ===",
  );

  const constraints =
    await prisma.$queryRaw<
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
        AND t.relname = 'supplier_bills'
        AND c.conname =
          'supplier_bills_tenantId_branchId_fkey'
    `;

  console.log("");
  console.log("DEPLOYED CONSTRAINT");
  console.dir(constraints, { depth: null });

  if (constraints.length !== 1) {
    throw new Error(
      "SUPPLIER_BILL_BRANCH_FK_MISSING",
    );
  }

  const constraint = constraints[0]!;

  if (constraint.constraint_type !== "f") {
    throw new Error(
      "SUPPLIER_BILL_BRANCH_CONSTRAINT_NOT_FOREIGN_KEY",
    );
  }

  const definition =
    constraint.definition.toLowerCase();

  if (
    !definition.includes('"tenantid"') ||
    !definition.includes('"branchid"') ||
    !definition.includes("branches") ||
    !definition.includes("on update cascade") ||
    !definition.includes("on delete restrict")
  ) {
    throw new Error(
      "SUPPLIER_BILL_BRANCH_FK_CONTRACT_INVALID",
    );
  }

  const invalidRows = await prisma.$queryRaw<
    Array<{
      invalid_count: bigint;
    }>
  >`
    SELECT COUNT(*)::bigint AS invalid_count
    FROM supplier_bills sb
    LEFT JOIN branches b
      ON b."tenantId" = sb."tenantId"
     AND b.id = sb."branchId"
    WHERE b.id IS NULL
  `;

  const invalidCount =
    invalidRows[0]?.invalid_count ?? 0n;

  console.log(
    "Invalid branch references:",
    invalidCount.toString(),
  );

  if (invalidCount !== 0n) {
    throw new Error(
      "INVALID_SUPPLIER_BILL_BRANCH_REFERENCE_AFTER_DEPLOY",
    );
  }

  console.log("");
  console.log(
    "15R.8 POST-DEPLOY BRANCH VERIFICATION: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.8 POST-DEPLOY BRANCH VERIFICATION: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });