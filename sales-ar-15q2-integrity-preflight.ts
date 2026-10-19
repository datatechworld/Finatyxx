import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

type CheckRow = {
  table_name: string;
  constraint_name: string;
  definition: string;
};

type TriggerRow = {
  table_name: string;
  trigger_name: string;
  definition: string;
};

type IndexRow = {
  table_name: string;
  index_name: string;
  definition: string;
};

async function main(): Promise<void> {
  console.log("Checkpoint 15Q.2 — Sales/AR Integrity Preflight");
  console.log("");

  const checks = await prisma.$queryRaw<CheckRow[]>(Prisma.sql`
    SELECT
      cls.relname::text AS table_name,
      con.conname::text AS constraint_name,
      pg_get_constraintdef(con.oid)::text AS definition
    FROM pg_constraint AS con
    JOIN pg_class AS cls
      ON cls.oid = con.conrelid
    JOIN pg_namespace AS ns
      ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname IN (
        'customers',
        'invoices',
        'invoice_items',
        'payments',
        'payment_allocations',
        'customer_ledger_entries',
        'tax_rates',
        'credit_notes',
        'credit_note_items'
      )
      AND con.contype = 'c'
    ORDER BY cls.relname, con.conname
  `);

  console.log("=== CHECK CONSTRAINTS ===");
  console.log(`Count: ${checks.length}`);

  for (const row of checks) {
    console.log(
      `${row.table_name}.${row.constraint_name}: ${row.definition}`,
    );
  }

  console.log("");

  const triggers = await prisma.$queryRaw<TriggerRow[]>(Prisma.sql`
    SELECT
      cls.relname::text AS table_name,
      trg.tgname::text AS trigger_name,
      pg_get_triggerdef(trg.oid)::text AS definition
    FROM pg_trigger AS trg
    JOIN pg_class AS cls
      ON cls.oid = trg.tgrelid
    JOIN pg_namespace AS ns
      ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname IN (
        'customers',
        'invoices',
        'invoice_items',
        'payments',
        'payment_allocations',
        'customer_ledger_entries',
        'tax_rates',
        'credit_notes',
        'credit_note_items'
      )
      AND NOT trg.tgisinternal
    ORDER BY cls.relname, trg.tgname
  `);

  console.log("=== USER TRIGGERS ===");
  console.log(`Count: ${triggers.length}`);

  for (const row of triggers) {
    console.log(
      `${row.table_name}.${row.trigger_name}: ${row.definition}`,
    );
  }

  console.log("");

  const indexes = await prisma.$queryRaw<IndexRow[]>(Prisma.sql`
    SELECT
      tablename::text AS table_name,
      indexname::text AS index_name,
      indexdef::text AS definition
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (
        'invoices',
        'invoice_items',
        'payments',
        'payment_allocations',
        'customer_ledger_entries'
      )
    ORDER BY tablename, indexname
  `);

  console.log("=== INDEXES / UNIQUENESS ===");
  console.log(`Count: ${indexes.length}`);

  for (const row of indexes) {
    console.log(
      `${row.table_name}.${row.index_name}: ${row.definition}`,
    );
  }

  console.log("");
  console.log("15Q.2 READ-ONLY PREFLIGHT: COMPLETE");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });