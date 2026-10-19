import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const FAILED_NUMBER =
  "CN-ARTEST-1791459384968-276102";

async function main(): Promise<void> {
  const failedCreditNote =
    await prisma.creditNote.findFirst({
      where: {
        tenantId: TENANT_ID,
        creditNoteNumber: FAILED_NUMBER,
      },
      select: {
        id: true,
        creditNoteNumber: true,
        status: true,
      },
    });

  const creditNoteCount =
    await prisma.creditNote.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const ledgerCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SALES_CREDIT_NOTE",
      },
    });

  const journalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SALES_CREDIT_NOTE",
      },
    });

  console.log({
    failedCreditNote,
    creditNoteCount,
    ledgerCount,
    journalCount,
  });

  if (failedCreditNote !== null) {
    throw new Error(
      "FAILED_FIXTURE_EXISTS",
    );
  }

  if (
    creditNoteCount !== 0 ||
    ledgerCount !== 0 ||
    journalCount !== 0
  ) {
    throw new Error(
      "CREDIT_NOTE_TEST_STATE_NOT_CLEAN",
    );
  }

  console.log(
    "15Q.16I.1 FAILED FIXTURE CHECK: PASS",
  );

  console.log(
    "Database mutations: NONE",
  );
}

main()
  .catch((error) => {
    console.error(
      "15Q.16I.1 FAILED FIXTURE CHECK: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });