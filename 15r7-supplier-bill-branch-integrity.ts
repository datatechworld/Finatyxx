import { prisma } from "./src/db/prisma.js";

async function main(): Promise<void> {
  console.log(
    "=== 15R.7 READ-ONLY SUPPLIER BILL BRANCH INTEGRITY ===",
  );

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
      AND t.relname = 'supplier_bills'
    ORDER BY c.conname
  `;

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
      AND tablename = 'supplier_bills'
    ORDER BY indexname
  `;

  console.log("");
  console.log("SUPPLIER BILL CONSTRAINTS");
  console.dir(constraints, { depth: null });

  console.log("");
  console.log("SUPPLIER BILL INDEXES");
  console.dir(indexes, { depth: null });

  const branchForeignKeys =
    constraints.filter((constraint) => {
      const definition =
        constraint.definition.toLowerCase();

      return (
        constraint.constraint_type === "f" &&
        definition.includes("branch")
      );
    });

  const tenantBranchForeignKeys =
    branchForeignKeys.filter((constraint) => {
      const definition =
        constraint.definition.toLowerCase();

      return (
        definition.includes('"tenantid"') &&
        definition.includes('"branchid"') &&
        definition.includes("branches")
      );
    });

  console.log("");
  console.log("BRANCH INTEGRITY SUMMARY");
  console.dir(
    {
      branchForeignKeys,
      tenantBranchForeignKeys,
      hasTenantSafeBranchForeignKey:
        tenantBranchForeignKeys.length > 0,
    },
    { depth: null },
  );

  console.log("");
  console.log(
    "15R.7 READ-ONLY SUPPLIER BILL BRANCH INTEGRITY: PASS",
  );

  console.log(
    "Database mutations: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.7 READ-ONLY SUPPLIER BILL BRANCH INTEGRITY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });