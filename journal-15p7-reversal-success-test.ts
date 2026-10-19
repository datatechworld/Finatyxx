import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  reverseJournal,
  JournalReversalError,
} from "./src/modules/accounting/journal-reversal.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ORIGINAL_ID = "46936eb1-fa00-415d-8a54-3ff612688405";
const ACTOR_ID = "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  console.log("Checkpoint 15P.7N.3 — Successful Reversal Test");
  console.log("");

  const before = await prisma.journalEntry.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: ORIGINAL_ID,
      },
    },
    include: {
      lines: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  assert(before !== null, "Original journal must exist.");
  assert(
    before.status === "POSTED",
    "Original journal must initially be POSTED.",
  );
  assert(
    before.reversalOfId === null,
    "Original must not itself be a reversal.",
  );
  assert(
    before.lines.length === 2,
    "Original must have exactly two lines for this test.",
  );

  console.log("PASS: original journal exists and is POSTED");
  console.log("Original:", before.journalNumber);

  const originalDebit = before.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    new Prisma.Decimal(0),
  );

  const originalCredit = before.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    new Prisma.Decimal(0),
  );

  assert(
    originalDebit.eq(originalCredit),
    "Original journal must be balanced before reversal.",
  );

  console.log(
    `PASS: original is balanced (${originalDebit.toString()} = ${originalCredit.toString()})`,
  );

  const result = await reverseJournal({
    tenantId: TENANT_ID,
    journalEntryId: ORIGINAL_ID,
    reversalDate: new Date("2098-06-15T00:00:00.000Z"),
    reason: "15P.7 reversal engine verification",
    reversedById: ACTOR_ID,
  });

  console.log("PASS: reverseJournal completed");
  console.log("Reversal journal:", result.reversalJournal.journalNumber);

  assert(
    result.originalJournalId === ORIGINAL_ID,
    "Returned original journal ID must match.",
  );

  assert(
    result.originalStatus === "REVERSED",
    "Returned original status must be REVERSED.",
  );

  assert(
    result.reversalJournal.status === "POSTED",
    "Reversal journal must be POSTED.",
  );

  assert(
    result.reversalJournal.reversalOfId === ORIGINAL_ID,
    "Reversal must reference the original through reversalOfId.",
  );

  assert(
    result.reversalJournal.sourceType === "JOURNAL_REVERSAL",
    "Reversal sourceType must be JOURNAL_REVERSAL.",
  );

  assert(
    result.reversalJournal.sourceId === ORIGINAL_ID,
    "Reversal sourceId must equal the original journal ID.",
  );

  assert(
    result.reversalJournal.currencyCode === before.currencyCode,
    "Reversal must preserve the original currency.",
  );

  assert(
    result.reversalJournal.exchangeRate.eq(before.exchangeRate),
    "Reversal must preserve the original exchange rate.",
  );

  assert(
    result.reversalJournal.branchId === before.branchId,
    "Reversal must preserve the original branch.",
  );

  assert(
    result.reversalJournal.lines.length === before.lines.length,
    "Reversal must contain the same number of lines as the original.",
  );

  for (let i = 0; i < before.lines.length; i += 1) {
    const originalLine = before.lines[i];
    const reversalLine = result.reversalJournal.lines[i];

    assert(
      originalLine !== undefined,
      `Original line ${i + 1} must exist.`,
    );

    assert(
      reversalLine !== undefined,
      `Reversal line ${i + 1} must exist.`,
    );

    assert(
      reversalLine.accountId === originalLine.accountId,
      `Line ${i + 1} must preserve accountId.`,
    );

    assert(
      reversalLine.debit.eq(originalLine.credit),
      `Line ${i + 1} reversal debit must equal original credit.`,
    );

    assert(
      reversalLine.credit.eq(originalLine.debit),
      `Line ${i + 1} reversal credit must equal original debit.`,
    );

    assert(
      reversalLine.customerId === originalLine.customerId,
      `Line ${i + 1} must preserve customer dimension.`,
    );

    assert(
      reversalLine.supplierId === originalLine.supplierId,
      `Line ${i + 1} must preserve supplier dimension.`,
    );

    assert(
      reversalLine.employeeId === originalLine.employeeId,
      `Line ${i + 1} must preserve employee dimension.`,
    );

    assert(
      reversalLine.projectId === originalLine.projectId,
      `Line ${i + 1} must preserve project dimension.`,
    );
  }

  console.log(
    "PASS: every reversal line correctly mirrors the original",
  );

  const reversalDebit = result.reversalJournal.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    new Prisma.Decimal(0),
  );

  const reversalCredit = result.reversalJournal.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    new Prisma.Decimal(0),
  );

  assert(
    reversalDebit.eq(reversalCredit),
    "Reversal journal must be balanced.",
  );

  assert(
    reversalDebit.eq(originalCredit),
    "Reversal debit total must equal original credit total.",
  );

  assert(
    reversalCredit.eq(originalDebit),
    "Reversal credit total must equal original debit total.",
  );

  console.log(
    `PASS: reversal is balanced (${reversalDebit.toString()} = ${reversalCredit.toString()})`,
  );

  const originalAfter = await prisma.journalEntry.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: ORIGINAL_ID,
      },
    },
    select: {
      id: true,
      journalNumber: true,
      status: true,
    },
  });

  assert(
    originalAfter !== null,
    "Original journal must still exist.",
  );

  assert(
    originalAfter.status === "REVERSED",
    "Original journal must now be REVERSED.",
  );

  console.log("PASS: original transitioned POSTED -> REVERSED");

  const persistedReversal = await prisma.journalEntry.findFirst({
    where: {
      tenantId: TENANT_ID,
      reversalOfId: ORIGINAL_ID,
    },
    include: {
      lines: true,
    },
  });

  assert(
    persistedReversal !== null,
    "Persisted reversal journal must exist.",
  );

  assert(
    persistedReversal.id === result.reversalJournal.id,
    "Persisted reversal must match returned reversal.",
  );

  assert(
    persistedReversal.status === "POSTED",
    "Persisted reversal must remain POSTED.",
  );

  assert(
    persistedReversal.sourceType === "JOURNAL_REVERSAL",
    "Persisted reversal sourceType must be JOURNAL_REVERSAL.",
  );

  assert(
    persistedReversal.sourceId === ORIGINAL_ID,
    "Persisted reversal sourceId must equal original journal ID.",
  );

  assert(
    persistedReversal.reversalOfId === ORIGINAL_ID,
    "Persisted reversal must reference the original journal.",
  );

  console.log("PASS: reversal persisted as POSTED");
  console.log("");
  console.log("15P.7N.3 SUCCESSFUL REVERSAL: PASS");
}

main()
  .catch((error) => {
    if (error instanceof JournalReversalError) {
      console.error(
        `JournalReversalError [${error.code}]: ${error.message}`,
      );
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });