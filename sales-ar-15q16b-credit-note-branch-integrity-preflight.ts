import { prisma } from "./src/db/prisma.ts";

async function main() {
  console.log(
    "=== 15Q.16B CREDIT NOTE BRANCH INTEGRITY PREFLIGHT ===",
  );

  /*
   * READ ONLY.
   *
   * Determine whether every existing credit-note branch reference
   * resolves inside the same tenant.
   */

  const orphanedBranches = await prisma.$queryRaw<
    Array<{
      credit_note_id: string;
      tenant_id: string;
      branch_id: string;
      credit_note_number: string;
    }>
  >`
    SELECT
      cn.id::text AS credit_note_id,
      cn."tenantId"::text AS tenant_id,
      cn."branchId"::text AS branch_id,
      cn."creditNoteNumber"::text
        AS credit_note_number
    FROM public.credit_notes cn
    LEFT JOIN public.branches b
      ON b."tenantId" = cn."tenantId"
     AND b.id = cn."branchId"
    WHERE b.id IS NULL
    ORDER BY cn.id
  `;

  const creditNoteCount =
    await prisma.creditNote.count();

  const physicalFk = await prisma.$queryRaw<
    Array<{
      constraint_name: string;
      definition: string;
      validated: string;
    }>
  >`
    SELECT
      con.conname::text AS constraint_name,
      pg_get_constraintdef(con.oid)::text
        AS definition,
      con.convalidated::text AS validated
    FROM pg_constraint con
    JOIN pg_class rel
      ON rel.oid = con.conrelid
    JOIN pg_namespace n
      ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'credit_notes'
      AND con.contype = 'f'
      AND pg_get_constraintdef(con.oid)
          ILIKE '%"tenantId", "branchId"%'
  `;

  const branchUniqueIndex =
    await prisma.$queryRaw<
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
      AND tablename = 'branches'
      AND indexdef ILIKE
        '%"tenantId"%id%'
    ORDER BY indexname
  `;

  console.log("");
  console.log("Credit-note rows:", creditNoteCount);

  console.log("");
  console.log(
    "Orphan/cross-tenant branch references:",
  );
  console.table(orphanedBranches);

  console.log("");
  console.log(
    "Existing physical tenant-safe branch FK:",
  );
  console.table(physicalFk);

  console.log("");
  console.log(
    "Branch tenant/id supporting indexes:",
  );
  console.table(branchUniqueIndex);

  const assertions = {
    noUnsafeExistingReferences:
      orphanedBranches.length === 0,

    physicalFkCurrentlyMissing:
      physicalFk.length === 0,

    branchCompositeKeyAvailable:
      branchUniqueIndex.some(
        (index) =>
          index.index_definition.includes(
            '"tenantId"',
          ) &&
          index.index_definition.includes(
            "id",
          ) &&
          index.index_definition.includes(
            "UNIQUE",
          ),
      ),
  };

  console.log("");
  console.log(
    "=== 15Q.16B ASSERTIONS ===",
  );
  console.table(assertions);

  if (
    !Object.values(assertions).every(Boolean)
  ) {
    throw new Error(
      "15Q.16B branch-integrity preflight failed.",
    );
  }

  console.log("");
  console.log(
    "15Q.16B CREDIT NOTE BRANCH INTEGRITY PREFLIGHT: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.16B CREDIT NOTE BRANCH INTEGRITY PREFLIGHT: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });