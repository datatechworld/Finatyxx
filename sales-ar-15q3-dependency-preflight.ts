import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

type ForeignKeyRow = {
  table_name: string;
  constraint_name: string;
  definition: string;
};

type SystemPurposeRow = {
  purpose: string;
  count: bigint;
};

async function main(): Promise<void> {
  console.log("Checkpoint 15Q.3 — Sales/AR Accounting Dependency Preflight");
  console.log("");

  // ----------------------------------------------------------
  // 1. Physical foreign keys
  // ----------------------------------------------------------

  const foreignKeys = await prisma.$queryRaw<ForeignKeyRow[]>(Prisma.sql`
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
        'credit_notes',
        'credit_note_items'
      )
      AND con.contype = 'f'
    ORDER BY cls.relname, con.conname
  `);

  console.log("=== FOREIGN KEYS ===");
  console.log(`Count: ${foreignKeys.length}`);

  for (const row of foreignKeys) {
    console.log(
      `${row.table_name}.${row.constraint_name}: ${row.definition}`,
    );
  }

  console.log("");

  // ----------------------------------------------------------
  // 2. Relevant system-account purposes
  // ----------------------------------------------------------

  const purposes = await prisma.$queryRaw<SystemPurposeRow[]>(Prisma.sql`
    SELECT
      "purpose"::text AS purpose,
      COUNT(*)::bigint AS count
    FROM public.system_account_mappings
    WHERE "purpose"::text IN (
      'ACCOUNTS_RECEIVABLE',
      'SALES_REVENUE',
      'SALES_RETURNS',
      'SALES_DISCOUNTS',
      'OUTPUT_TAX',
      'TAX_PAYABLE',
      'CASH',
      'BANK'
    )
    GROUP BY "purpose"
    ORDER BY "purpose"
  `);

  console.log("=== SYSTEM ACCOUNT MAPPINGS CURRENTLY CONFIGURED ===");

  if (purposes.length === 0) {
    console.log("No relevant mappings currently configured.");
  } else {
    for (const row of purposes) {
      console.log(`${row.purpose}: ${row.count.toString()}`);
    }
  }

  console.log("");

  // ----------------------------------------------------------
  // 3. Test tenant mappings specifically
  // ----------------------------------------------------------

  const tenantMappings = await prisma.systemAccountMapping.findMany({
    where: {
      tenantId: "9af89483-476a-4367-99b0-8cc15abc0011",
      purpose: {
        in: [
          "ACCOUNTS_RECEIVABLE",
          "SALES_REVENUE",
          "SALES_RETURNS",
          "SALES_DISCOUNTS",
          "OUTPUT_TAX",
          "TAX_PAYABLE",
          "CASH",
          "BANK",
        ],
      },
    },
    select: {
      purpose: true,
      accountId: true,
    },
    orderBy: {
      purpose: "asc",
    },
  });

  console.log("=== TEST TENANT SYSTEM ACCOUNT MAPPINGS ===");
  console.log(`Count: ${tenantMappings.length}`);

  for (const mapping of tenantMappings) {
    console.log(`${mapping.purpose}: ${mapping.accountId}`);
  }

  console.log("");
  console.log("15Q.3 READ-ONLY DEPENDENCY PREFLIGHT: COMPLETE");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });