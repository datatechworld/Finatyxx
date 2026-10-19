import { prisma } from "./src/db/prisma.js";

async function main(): Promise<void> {
  console.log(
    "=== 15R.8 READ-ONLY BRANCH PREFLIGHT ===",
  );

  const invalidRows = await prisma.$queryRaw<
    Array<{
      supplier_bill_id: string;
      tenant_id: string;
      branch_id: string;
    }>
  >`
    SELECT
      sb.id::text AS supplier_bill_id,
      sb."tenantId"::text AS tenant_id,
      sb."branchId"::text AS branch_id
    FROM supplier_bills sb
    LEFT JOIN branches b
      ON b."tenantId" = sb."tenantId"
     AND b.id = sb."branchId"
    WHERE b.id IS NULL
    ORDER BY sb.id
  `;

  const existingConstraints =
    await prisma.$queryRaw<
      Array<{
        constraint_name: string;
        definition: string;
      }>
    >`
      SELECT
        c.conname::text AS constraint_name,
        pg_get_constraintdef(c.oid)::text AS definition
      FROM pg_constraint c
      INNER JOIN pg_class t
        ON t.oid = c.conrelid
      INNER JOIN pg_namespace n
        ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'supplier_bills'
        AND c.contype = 'f'
      ORDER BY c.conname
    `;

  console.log("");
  console.log("INVALID SUPPLIER BILL BRANCH REFERENCES");
  console.dir(invalidRows, { depth: null });

  console.log("");
  console.log("EXISTING SUPPLIER BILL FOREIGN KEYS");
  console.dir(existingConstraints, { depth: null });

  if (invalidRows.length !== 0) {
    throw new Error(
      "INVALID_EXISTING_SUPPLIER_BILL_BRANCH_REFERENCES",
    );
  }

  const alreadyProtected =
    existingConstraints.some((constraint) => {
      const definition =
        constraint.definition.toLowerCase();

      return (
        definition.includes('"tenantid"') &&
        definition.includes('"branchid"') &&
        definition.includes("branches")
      );
    });

  if (alreadyProtected) {
    throw new Error(
      "SUPPLIER_BILL_BRANCH_INTEGRITY_ALREADY_EXISTS",
    );
  }

  console.log("");
  console.log(
    "15R.8 BRANCH PREFLIGHT: PASS",
  );

  console.log(
    "Database mutations: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.8 BRANCH PREFLIGHT: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });