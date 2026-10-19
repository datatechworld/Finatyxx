import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const FAILED_BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

type ConstraintRow = {
  constraint_name: string;
  table_name: string;
  constraint_type: string;
  definition: string;
};

type ColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

type PriorJournalRow = {
  journal_id: string;
  journal_tenant_id: string;
  journal_number: string;
  line_id: string;
  line_tenant_id: string;
  line_journal_entry_id: string;
  tenant_match: boolean;
  journal_id_match: boolean;
};

async function main(): Promise<void> {
  console.log(
    "=== 15R.10H GL FK FAILURE DIAGNOSTIC ===",
  );

  /*
   * 1. Verify the exact failed Supplier Bill fixture.
   */
  const bill =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: FAILED_BILL_ID,
        },
      },
      include: {
        items: true,
      },
    });

  console.log("");
  console.log("FAILED 15R.10G SUPPLIER BILL STATE");
  console.dir(bill, { depth: null });

  if (!bill) {
    throw new Error(
      "DIAGNOSTIC_FAILED: 15R.10G Supplier Bill not found",
    );
  }

  /*
   * 2. Verify rollback of the failed posting transaction.
   */
  const supplierLedgerEntries =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: FAILED_BILL_ID,
      },
      select: {
        id: true,
        debit: true,
        credit: true,
        referenceType: true,
        referenceId: true,
      },
    });

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: FAILED_BILL_ID,
      },
      select: {
        id: true,
        journalNumber: true,
        status: true,
        sourceType: true,
        sourceId: true,
      },
    });

  console.log("");
  console.log("FAILED POSTING TRANSACTION STATE");

  console.dir(
    {
      supplierLedgerEntries,
      journals,
    },
    { depth: null },
  );

  /*
   * 3. Read the live PostgreSQL definitions of constraints
   *    involving journal_lines.
   *
   * Every catalog value is cast to text because Prisma 7
   * adapter-pg does not reliably deserialize PostgreSQL
   * catalog-specific native types.
   */
  const constraints =
    await prisma.$queryRaw<ConstraintRow[]>(
      Prisma.sql`
        SELECT
          c.conname::text AS constraint_name,
          t.relname::text AS table_name,
          c.contype::text AS constraint_type,
          pg_get_constraintdef(c.oid, true)::text AS definition
        FROM pg_constraint c
        JOIN pg_class t
          ON t.oid = c.conrelid
        JOIN pg_namespace n
          ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'journal_lines'
        ORDER BY c.conname
      `,
    );

  console.log("");
  console.log("LIVE journal_lines CONSTRAINTS");
  console.dir(constraints, { depth: null });

  /*
   * 4. Inspect the actual journal_lines column contract.
   */
  const columns =
    await prisma.$queryRaw<ColumnRow[]>(
      Prisma.sql`
        SELECT
          column_name::text AS column_name,
          data_type::text AS data_type,
          is_nullable::text AS is_nullable,
          column_default::text AS column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'journal_lines'
        ORDER BY ordinal_position
      `,
    );

  console.log("");
  console.log("LIVE journal_lines COLUMNS");
  console.dir(columns, { depth: null });

  /*
   * 5. Inspect previously successful JournalEntry/JournalLine
   *    relationships using only scalar catalog-safe values.
   */
  const priorJournalLines =
    await prisma.$queryRaw<PriorJournalRow[]>(
      Prisma.sql`
        SELECT
          je.id::text AS journal_id,
          je."tenantId"::text AS journal_tenant_id,
          je."journalNumber"::text AS journal_number,
          jl.id::text AS line_id,
          jl."tenantId"::text AS line_tenant_id,
          jl."journalEntryId"::text AS line_journal_entry_id,
          (je."tenantId" = jl."tenantId")::boolean AS tenant_match,
          (je.id = jl."journalEntryId")::boolean AS journal_id_match
        FROM journal_entries je
        JOIN journal_lines jl
          ON jl."tenantId" = je."tenantId"
         AND jl."journalEntryId" = je.id
        WHERE je."tenantId" = ${TENANT_ID}::uuid
        ORDER BY je."createdAt" DESC, jl."createdAt" ASC
        LIMIT 12
      `,
    );

  console.log("");
  console.log("RECENT SUCCESSFUL JOURNAL / LINE RELATIONSHIPS");
  console.dir(priorJournalLines, { depth: null });

  /*
   * 6. Diagnostic assertions.
   */
  if (bill.status !== "DRAFT") {
    throw new Error(
      `UNEXPECTED_STATE: failed bill status is ${bill.status}, expected DRAFT`,
    );
  }

  if (bill.postedAt !== null) {
    throw new Error(
      "UNEXPECTED_STATE: failed bill has postedAt",
    );
  }

  if (supplierLedgerEntries.length !== 0) {
    throw new Error(
      "UNEXPECTED_STATE: Supplier Ledger mutation survived failed posting",
    );
  }

  if (journals.length !== 0) {
    throw new Error(
      "UNEXPECTED_STATE: Journal mutation survived failed posting",
    );
  }

  const targetFk =
    constraints.find(
      (row) =>
        row.constraint_name ===
        "journal_lines_tenantId_journalEntryId_fkey",
    );

  if (!targetFk) {
    throw new Error(
      "DIAGNOSTIC_FAILED: target JournalLine FK not found",
    );
  }

  console.log("");
  console.log("TARGET FK");
  console.dir(targetFk, { depth: null });

  console.log("");
  console.log(
    "15R.10H GL FK FAILURE DIAGNOSTIC: PASS",
  );

  console.log(
    "Failed posting transaction rollback: VERIFIED",
  );

  console.log(
    "Database mutations performed by diagnostic: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10H GL FK FAILURE DIAGNOSTIC: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });