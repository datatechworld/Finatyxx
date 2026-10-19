import { prisma } from "./src/db/prisma.js";

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{
    constraint_name: string;
    definition: string;
  }>>(`
    SELECT
      c.conname::text AS constraint_name,
      pg_get_constraintdef(c.oid)::text AS definition
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN ('journal_entries', 'journal_lines')
      AND c.contype = 'c'
    ORDER BY t.relname, c.conname;
  `);

  console.log("Checkpoint 15P.7F — Journal CHECK Constraint Preflight");
  console.log("CHECK constraints found:", rows.length);

  for (const row of rows) {
    console.log("");
    console.log(row.constraint_name);
    console.log(row.definition);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });