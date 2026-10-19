import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";

type EnumValueRow = {
  enum_name: string;
  enum_value: string;
};

async function main(): Promise<void> {
  console.log("Checkpoint 15Q.4 — Sales/AR Accounting Configuration Preflight");
  console.log("");

  // ----------------------------------------------------------
  // 1. PostgreSQL enum values relevant to document numbering
  // ----------------------------------------------------------

  const enumValues = await prisma.$queryRaw<EnumValueRow[]>(Prisma.sql`
    SELECT
      typ.typname::text AS enum_name,
      enum.enumlabel::text AS enum_value
    FROM pg_type AS typ
    JOIN pg_enum AS enum
      ON enum.enumtypid = typ.oid
    JOIN pg_namespace AS ns
      ON ns.oid = typ.typnamespace
    WHERE ns.nspname = 'public'
      AND typ.typname IN (
        'DocumentType',
        'SystemAccountPurpose'
      )
    ORDER BY typ.typname, enum.enumsortorder
  `);

  console.log("=== RELEVANT ENUM VALUES ===");

  if (enumValues.length === 0) {
    console.log("No matching PostgreSQL enums found.");
  } else {
    for (const row of enumValues) {
      console.log(`${row.enum_name}: ${row.enum_value}`);
    }
  }

  console.log("");

  // ----------------------------------------------------------
  // 2. Existing Chart of Accounts for test tenant
  // ----------------------------------------------------------

  const accounts = await prisma.account.findMany({
    where: {
      tenantId: TENANT_ID,
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      normalBalance: true,
      isControlAccount: true,
      allowManualPosting: true,
      status: true,
      parentId: true,
    },
    orderBy: [
      {
        code: "asc",
      },
      {
        name: "asc",
      },
    ],
  });

  console.log("=== TEST TENANT CHART OF ACCOUNTS ===");
  console.log(`Count: ${accounts.length}`);

  for (const account of accounts) {
    console.log(
      [
        `code=${account.code}`,
        `name=${account.name}`,
        `type=${account.type}`,
        `normal=${account.normalBalance}`,
        `control=${account.isControlAccount}`,
        `manual=${account.allowManualPosting}`,
        `status=${account.status}`,
        `id=${account.id}`,
        `parent=${account.parentId ?? "NULL"}`,
      ].join(" | "),
    );
  }

  console.log("");

  // ----------------------------------------------------------
  // 3. Existing document sequences for test tenant
  // ----------------------------------------------------------

  const sequences = await prisma.documentSequence.findMany({
    where: {
      tenantId: TENANT_ID,
    },
    select: {
      documentType: true,
      branchId: true,
      year: true,
      prefix: true,
      nextNumber: true,
    },
    orderBy: [
      {
        documentType: "asc",
      },
      {
        year: "asc",
      },
    ],
  });

  console.log("=== TEST TENANT DOCUMENT SEQUENCES ===");
  console.log(`Count: ${sequences.length}`);

  for (const sequence of sequences) {
    console.log(
      [
        `type=${sequence.documentType}`,
        `branch=${sequence.branchId ?? "NULL"}`,
        `year=${sequence.year ?? "NULL"}`,
        `prefix=${sequence.prefix}`,
        `next=${sequence.nextNumber}`,
      ].join(" | "),
    );
  }

  console.log("");
  console.log("15Q.4 READ-ONLY ACCOUNTING CONFIGURATION PREFLIGHT: COMPLETE");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });