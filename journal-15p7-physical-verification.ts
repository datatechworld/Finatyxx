import { prisma } from "./src/db/prisma.js";

type FunctionRow = {
  function_name: string;
};

type TriggerRow = {
  table_name: string;
  trigger_name: string;
  function_name: string;
};

async function main() {
  console.log("Checkpoint 15P.7J — Physical Database Verification");
  console.log("");

  const functions = await prisma.$queryRawUnsafe<FunctionRow[]>(`
    SELECT
      p.proname::text AS function_name
    FROM pg_proc p
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'protect_journal_entry_integrity',
        'protect_journal_line_integrity'
      )
    ORDER BY p.proname;
  `);

  const triggers = await prisma.$queryRawUnsafe<TriggerRow[]>(`
    SELECT
      c.relname::text AS table_name,
      t.tgname::text AS trigger_name,
      p.proname::text AS function_name
    FROM pg_trigger t
    JOIN pg_class c
      ON c.oid = t.tgrelid
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    JOIN pg_proc p
      ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND t.tgname IN (
        'journal_entries_integrity_trg',
        'journal_lines_integrity_trg'
      )
    ORDER BY c.relname, t.tgname;
  `);

  console.log("Integrity functions found:", functions.length);

  for (const row of functions) {
    console.log(`FUNCTION: ${row.function_name}`);
  }

  console.log("");
  console.log("Integrity triggers found:", triggers.length);

  for (const row of triggers) {
    console.log(
      `TRIGGER: ${row.trigger_name} | TABLE: ${row.table_name} | FUNCTION: ${row.function_name}`
    );
  }

  console.log("");

  const expectedFunctions = new Set([
    "protect_journal_entry_integrity",
    "protect_journal_line_integrity",
  ]);

  const expectedTriggers = new Map([
    [
      "journal_entries_integrity_trg",
      "journal_entries|protect_journal_entry_integrity",
    ],
    [
      "journal_lines_integrity_trg",
      "journal_lines|protect_journal_line_integrity",
    ],
  ]);

  const functionNames = new Set(
    functions.map((row) => row.function_name)
  );

  const functionsPass =
    functions.length === 2 &&
    [...expectedFunctions].every((name) => functionNames.has(name));

  const triggersPass =
    triggers.length === 2 &&
    triggers.every((row) => {
      const expected = expectedTriggers.get(row.trigger_name);

      return (
        expected === `${row.table_name}|${row.function_name}`
      );
    }) &&
    [...expectedTriggers.keys()].every((name) =>
      triggers.some((row) => row.trigger_name === name)
    );

  console.log(
    "Function verification:",
    functionsPass ? "PASS" : "FAIL"
  );

  console.log(
    "Trigger verification:",
    triggersPass ? "PASS" : "FAIL"
  );

  if (!functionsPass || !triggersPass) {
    throw new Error(
      "Checkpoint 15P.7J physical verification FAILED."
    );
  }

  console.log("");
  console.log(
    "Checkpoint 15P.7J physical verification: PASS"
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });