import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

async function main() {
  console.log("Checkpoint 15P.7O.1 — Journal Insert Hardening Preflight");
  console.log("");

  const triggers = await prisma.$queryRaw<
    Array<{
      trigger_name: string;
      trigger_definition: string;
    }>
  >(Prisma.sql`
    SELECT
      t.tgname::text AS trigger_name,
      pg_get_triggerdef(t.oid, true)::text AS trigger_definition
    FROM pg_trigger t
    JOIN pg_class c
      ON c.oid = t.tgrelid
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'journal_entries'
      AND NOT t.tgisinternal
    ORDER BY t.tgname;
  `);

  const functions = await prisma.$queryRaw<
    Array<{
      function_name: string;
      function_definition: string;
    }>
  >(Prisma.sql`
    SELECT
      p.proname::text AS function_name,
      pg_get_functiondef(p.oid)::text AS function_definition
    FROM pg_proc p
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'protect_journal_entry_integrity'
    ORDER BY p.proname;
  `);

  const checks = await prisma.$queryRaw<
    Array<{
      constraint_name: string;
      constraint_definition: string;
    }>
  >(Prisma.sql`
    SELECT
      con.conname::text AS constraint_name,
      pg_get_constraintdef(con.oid, true)::text AS constraint_definition
    FROM pg_constraint con
    JOIN pg_class c
      ON c.oid = con.conrelid
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'journal_entries'
      AND con.contype = 'c'
    ORDER BY con.conname;
  `);

  const statusInfo = await prisma.$queryRaw<
    Array<{
      column_name: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>
  >(Prisma.sql`
    SELECT
      column_name::text,
      udt_name::text,
      is_nullable::text,
      column_default::text
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'journal_entries'
      AND column_name = 'status';
  `);

  console.log("=== USER TRIGGERS ON journal_entries ===");
  console.log(`Count: ${triggers.length}`);
  for (const trigger of triggers) {
    console.log("");
    console.log(`Trigger: ${trigger.trigger_name}`);
    console.log(trigger.trigger_definition);
  }

  console.log("");
  console.log("=== protect_journal_entry_integrity() ===");
  console.log(`Count: ${functions.length}`);
  for (const fn of functions) {
    console.log("");
    console.log(`Function: ${fn.function_name}`);
    console.log(fn.function_definition);
  }

  console.log("");
  console.log("=== CHECK CONSTRAINTS ON journal_entries ===");
  console.log(`Count: ${checks.length}`);
  for (const check of checks) {
    console.log(
      `${check.constraint_name}: ${check.constraint_definition}`,
    );
  }

  console.log("");
  console.log("=== STATUS COLUMN ===");
  console.log(`Count: ${statusInfo.length}`);
  for (const column of statusInfo) {
    console.log(`Column: ${column.column_name}`);
    console.log(`Type: ${column.udt_name}`);
    console.log(`Nullable: ${column.is_nullable}`);
    console.log(`Default: ${column.column_default}`);
  }

  console.log("");
  console.log("15P.7O.1 READ-ONLY PREFLIGHT: COMPLETE");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });