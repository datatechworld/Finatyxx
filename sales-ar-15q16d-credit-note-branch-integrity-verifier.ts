import { prisma } from "./src/db/prisma.ts";

const MIGRATION_NAME =
  "20261008095000_credit_note_branch_integrity";

const CONSTRAINT_NAME =
  "credit_notes_tenantId_branchId_fkey";

async function main() {
  console.log(
    "=== 15Q.16D CREDIT NOTE BRANCH INTEGRITY VERIFIER ===",
  );

  const migrations = await prisma.$queryRaw<
    Array<{
      migration_name: string;
      finished_at: string | null;
      rolled_back_at: string | null;
      applied_steps_count: string;
    }>
  >`
    SELECT
      migration_name::text AS migration_name,
      finished_at::text AS finished_at,
      rolled_back_at::text AS rolled_back_at,
      applied_steps_count::text AS applied_steps_count
    FROM public._prisma_migrations
    WHERE migration_name = ${MIGRATION_NAME}
    ORDER BY started_at DESC
  `;

  const fk = await prisma.$queryRaw<
    Array<{
      constraint_name: string;
      source_table: string;
      source_columns: string;
      target_table: string;
      target_columns: string;
      update_action: string;
      delete_action: string;
      validated: string;
    }>
  >`
    SELECT
      con.conname::text AS constraint_name,
      src.relname::text AS source_table,

      (
        SELECT string_agg(
          a.attname::text,
          ','
          ORDER BY keys.ordinality
        )
        FROM unnest(con.conkey)
          WITH ORDINALITY
          AS keys(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = con.conrelid
         AND a.attnum = keys.attnum
      )::text AS source_columns,

      tgt.relname::text AS target_table,

      (
        SELECT string_agg(
          a.attname::text,
          ','
          ORDER BY keys.ordinality
        )
        FROM unnest(con.confkey)
          WITH ORDINALITY
          AS keys(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = con.confrelid
         AND a.attnum = keys.attnum
      )::text AS target_columns,

      con.confupdtype::text AS update_action,
      con.confdeltype::text AS delete_action,
      con.convalidated::text AS validated

    FROM pg_constraint con

    JOIN pg_class src
      ON src.oid = con.conrelid

    JOIN pg_namespace src_ns
      ON src_ns.oid = src.relnamespace

    JOIN pg_class tgt
      ON tgt.oid = con.confrelid

    WHERE src_ns.nspname = 'public'
      AND src.relname = 'credit_notes'
      AND con.conname = ${CONSTRAINT_NAME}
      AND con.contype = 'f'
  `;

  const unsafeReferences = await prisma.$queryRaw<
    Array<{
      credit_note_id: string;
      tenant_id: string;
      branch_id: string;
    }>
  >`
    SELECT
      cn.id::text AS credit_note_id,
      cn."tenantId"::text AS tenant_id,
      cn."branchId"::text AS branch_id
    FROM public.credit_notes cn
    LEFT JOIN public.branches b
      ON b."tenantId" = cn."tenantId"
     AND b.id = cn."branchId"
    WHERE b.id IS NULL
    ORDER BY cn.id
  `;

  console.log("");
  console.log("=== MIGRATION RECORD ===");
  console.table(migrations);

  console.log("");
  console.log("=== PHYSICAL FOREIGN KEY ===");
  console.table(fk);

  console.log("");
  console.log(
    "=== UNSAFE BRANCH REFERENCES ===",
  );
  console.table(unsafeReferences);

  const migration =
    migrations.length === 1
      ? migrations[0]
      : undefined;

  const constraint =
    fk.length === 1
      ? fk[0]
      : undefined;

  const assertions = {
    migrationRecorded:
      migrations.length === 1,

    migrationFinished:
      migration?.finished_at != null,

    migrationNotRolledBack:
      migration?.rolled_back_at == null,

    oneAppliedStep:
      migration?.applied_steps_count === "1",

    exactlyOnePhysicalFk:
      fk.length === 1,

    correctConstraintName:
      constraint?.constraint_name ===
      CONSTRAINT_NAME,

    correctSourceTable:
      constraint?.source_table ===
      "credit_notes",

    correctSourceColumns:
      constraint?.source_columns ===
      "tenantId,branchId",

    correctTargetTable:
      constraint?.target_table ===
      "branches",

    correctTargetColumns:
      constraint?.target_columns ===
      "tenantId,id",

    updateCascade:
      constraint?.update_action === "c",

    deleteRestrict:
      constraint?.delete_action === "r",

    constraintValidated:
      constraint?.validated === "true",

    noUnsafeReferences:
      unsafeReferences.length === 0,
  };

  console.log("");
  console.log("=== 15Q.16D ASSERTIONS ===");
  console.table(assertions);

  if (!Object.values(assertions).every(Boolean)) {
    throw new Error(
      "15Q.16D physical verification failed.",
    );
  }

  console.log("");
  console.log(
    "15Q.16D CREDIT NOTE BRANCH INTEGRITY: PHYSICAL PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.16D CREDIT NOTE BRANCH INTEGRITY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });