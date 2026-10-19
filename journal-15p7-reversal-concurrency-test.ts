import { prisma } from "./src/db/prisma.js";
import {
  JournalReversalError,
  reverseJournal,
} from "./src/modules/accounting/journal-reversal.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ORIGINAL_ID = "0e07d241-4097-446c-bdb1-cf710e67ce9f";
const ACTOR_ID = "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  console.log("Checkpoint 15P.7N.8B — Reversal Concurrency Protection");
  console.log("");

  const originalBefore = await prisma.journalEntry.findUnique({
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
      reversalOfId: true,
    },
  });

  assert(
    originalBefore !== null,
    "Concurrency-test original journal must exist.",
  );

  assert(
    originalBefore.status === "POSTED",
    `Expected original to be POSTED before test, found ${originalBefore.status}.`,
  );

  assert(
    originalBefore.reversalOfId === null,
    "Concurrency-test original must not itself be a reversal.",
  );

  const reversalsBefore = await prisma.journalEntry.count({
    where: {
      tenantId: TENANT_ID,
      reversalOfId: ORIGINAL_ID,
    },
  });

  assert(
    reversalsBefore === 0,
    `Expected zero reversals before test, found ${reversalsBefore}.`,
  );

  console.log(
    `Original before: ${originalBefore.journalNumber} | ${originalBefore.status}`,
  );
  console.log("PASS: no reversal exists before concurrent calls");
  console.log("");

  const makeInput = (label: string) => ({
    tenantId: TENANT_ID,
    journalEntryId: ORIGINAL_ID,
    reversalDate: new Date("2098-06-15T00:00:00.000Z"),
    reason: `15P.7N.8 concurrent reversal attempt ${label}`,
    reversedById: ACTOR_ID,
  });

  const results = await Promise.allSettled([
    reverseJournal(makeInput("A")),
    reverseJournal(makeInput("B")),
  ]);

  const fulfilled = results.filter(
    (
      result,
    ): result is PromiseFulfilledResult<
      Awaited<ReturnType<typeof reverseJournal>>
    > => result.status === "fulfilled",
  );

  const rejected = results.filter(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected",
  );

  console.log(`Fulfilled calls: ${fulfilled.length}`);
  console.log(`Rejected calls: ${rejected.length}`);
  console.log("");

  assert(
    fulfilled.length === 1,
    `Exactly one reversal call must succeed; found ${fulfilled.length}.`,
  );

  assert(
    rejected.length === 1,
    `Exactly one reversal call must be rejected; found ${rejected.length}.`,
  );

  const winner = fulfilled[0];

  assert(
    winner !== undefined,
    "Successful reversal result is missing.",
  );

  console.log(
    `Winning reversal: ${winner.value.reversalJournal.journalNumber}`,
  );

  const loser = rejected[0];

  assert(
    loser !== undefined,
    "Rejected reversal result is missing.",
  );

  assert(
    loser.reason instanceof JournalReversalError,
    "Rejected concurrent call must return JournalReversalError.",
  );

  assert(
    loser.reason.code === "ALREADY_REVERSED",
    `Expected ALREADY_REVERSED from losing call, found ${loser.reason.code}.`,
  );

  console.log(
    `PASS: losing concurrent call rejected with ${loser.reason.code}`,
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
    "Original journal must still exist after concurrency test.",
  );

  assert(
    originalAfter.status === "REVERSED",
    `Original must be REVERSED after successful concurrency test, found ${originalAfter.status}.`,
  );

  const reversalsAfter = await prisma.journalEntry.findMany({
    where: {
      tenantId: TENANT_ID,
      reversalOfId: ORIGINAL_ID,
    },
    select: {
      id: true,
      journalNumber: true,
      status: true,
      sourceType: true,
      sourceId: true,
      reversalOfId: true,
      lines: {
        select: {
          debit: true,
          credit: true,
        },
      },
    },
  });

  assert(
    reversalsAfter.length === 1,
    `Exactly one reversal must persist; found ${reversalsAfter.length}.`,
  );

  const persistedReversal = reversalsAfter[0];

  assert(
    persistedReversal !== undefined,
    "Persisted reversal is missing.",
  );

  assert(
    persistedReversal.id === winner.value.reversalJournal.id,
    "Persisted reversal must be the successful call's reversal.",
  );

  assert(
    persistedReversal.status === "POSTED",
    `Persisted reversal must be POSTED, found ${persistedReversal.status}.`,
  );

  assert(
    persistedReversal.sourceType === "JOURNAL_REVERSAL",
    "Persisted reversal must have sourceType JOURNAL_REVERSAL.",
  );

  assert(
    persistedReversal.sourceId === ORIGINAL_ID,
    "Persisted reversal sourceId must reference the original journal.",
  );

  assert(
    persistedReversal.reversalOfId === ORIGINAL_ID,
    "Persisted reversal reversalOfId must reference the original journal.",
  );

  const totalDebit = persistedReversal.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    persistedReversal.lines[0]!.debit.mul(0),
  );

  const totalCredit = persistedReversal.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    persistedReversal.lines[0]!.credit.mul(0),
  );

  assert(
    persistedReversal.lines.length >= 2,
    "Persisted reversal must contain at least two journal lines.",
  );

  assert(
    totalDebit.equals(totalCredit),
    `Persisted reversal must balance; debit=${totalDebit.toString()} credit=${totalCredit.toString()}.`,
  );

  console.log("PASS: exactly one reversal persisted");
  console.log("PASS: original persisted as REVERSED");
  console.log("PASS: persisted reversal is POSTED");
  console.log("PASS: persisted reversal references original correctly");
  console.log(
    `PASS: persisted reversal balances (${totalDebit.toString()} = ${totalCredit.toString()})`,
  );
  console.log("");
  console.log("15P.7N.8B REVERSAL CONCURRENCY PROTECTION: PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });