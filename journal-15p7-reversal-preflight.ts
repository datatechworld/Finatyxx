import { prisma } from "./src/db/prisma.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";

async function main() {
  const journals = await prisma.journalEntry.findMany({
    where: {
      tenantId: TENANT_ID,
      journalDate: {
        gte: new Date("2098-01-01T00:00:00.000Z"),
        lt: new Date("2099-01-01T00:00:00.000Z"),
      },
      sourceType: {
        in: [
          "GL_TEST",
          "GL_TEST_SYSTEM",
          "GL_TEST_IDEMPOTENCY",
        ],
      },
    },
    select: {
      id: true,
      journalNumber: true,
      journalDate: true,
      status: true,
      sourceType: true,
      sourceId: true,
      branchId: true,
      currencyCode: true,
      exchangeRate: true,
      reversalOfId: true,
      lines: {
        select: {
          id: true,
          accountId: true,
          description: true,
          debit: true,
          credit: true,
          customerId: true,
          supplierId: true,
          employeeId: true,
          projectId: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: {
      journalNumber: "asc",
    },
  });

  console.log("Checkpoint 15P.7N.2 — Reversal Preflight");
  console.log("Journals found:", journals.length);
  console.log("");

  for (const journal of journals) {
    console.log("=".repeat(72));
    console.log("Journal:", journal.journalNumber);
    console.log("ID:", journal.id);
    console.log("Date:", journal.journalDate.toISOString());
    console.log("Status:", journal.status);
    console.log("Source:", journal.sourceType);
    console.log("Source ID:", journal.sourceId ?? "NULL");
    console.log("Branch ID:", journal.branchId ?? "NULL");
    console.log("Currency:", journal.currencyCode);
    console.log("Exchange rate:", journal.exchangeRate.toString());
    console.log("Reversal of:", journal.reversalOfId ?? "NULL");
    console.log("Lines:", journal.lines.length);

    for (const [index, line] of journal.lines.entries()) {
      console.log(
        `  ${index + 1}. account=${line.accountId} debit=${line.debit.toString()} credit=${line.credit.toString()}`,
      );

      console.log(
        `     customer=${line.customerId ?? "NULL"} supplier=${line.supplierId ?? "NULL"} employee=${line.employeeId ?? "NULL"} project=${line.projectId ?? "NULL"}`,
      );
    }

    console.log("");
  }

  const existingReversals = await prisma.journalEntry.findMany({
    where: {
      tenantId: TENANT_ID,
      sourceType: "JOURNAL_REVERSAL",
    },
    select: {
      id: true,
      journalNumber: true,
      status: true,
      reversalOfId: true,
      sourceId: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log("=".repeat(72));
  console.log("Existing JOURNAL_REVERSAL journals:", existingReversals.length);

  for (const reversal of existingReversals) {
    console.log(
      `${reversal.journalNumber} | ${reversal.status} | reversalOf=${reversal.reversalOfId ?? "NULL"} | sourceId=${reversal.sourceId ?? "NULL"}`,
    );
  }

  console.log("");
  console.log("Preflight completed: READ ONLY");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });