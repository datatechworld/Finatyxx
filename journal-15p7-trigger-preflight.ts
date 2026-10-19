import { prisma } from "./src/db/prisma.ts";

const rows = await prisma.$queryRaw<Array<{
  trigger_name: string;
  table_name: string;
  trigger_definition: string;
}>>`
  SELECT
    t.tgname::text AS trigger_name,
    c.relname::text AS table_name,
    pg_get_triggerdef(t.oid)::text AS trigger_definition
  FROM pg_trigger t
  JOIN pg_class c
    ON c.oid = t.tgrelid
  JOIN pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('journal_entries', 'journal_lines')
    AND NOT t.tgisinternal
  ORDER BY c.relname, t.tgname
`;

console.log("Checkpoint 15P.7B — Journal Immutability Trigger Preflight");
console.log(`User-defined journal triggers: ${rows.length}`);

for (const row of rows) {
  console.log("");
  console.log(`Table: ${row.table_name}`);
  console.log(`Trigger: ${row.trigger_name}`);
  console.log(`Definition: ${row.trigger_definition}`);
}

await prisma.$disconnect();