import { prisma } from "./src/db/prisma.js";
import {
  reverseJournal,
  JournalReversalError,
} from "./src/modules/accounting/journal-reversal.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ORIGINAL_ID = "46936eb1-fa00-415d-8a54-3ff612688405";
const REVERSAL_ID = "7fa03f8f-f97d-4cdb-b940-33a965bf696e";
const ACTOR_ID = "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  console.log(
    "Checkpoint 15P.7N.6 — Reversal-of-Reversal Protection",
  );
  console.log("");

  const reversalBefore = await prisma.journalEntry.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: REVERSAL_ID,
      },
    },
    select: {
      id: true,
      journalNumber: true,
      status: true,
      sourceType: true,
      sourceId: true,
      reversalOfId: true,
    },
  });

  assert(reversalBefore !== null, "Reversal journal must exist.");

  assert(
    reversalBefore.status === "POSTED",
    "Reversal journal must initially be POSTED.",
  );

  assert(
    reversalBefore.sourceType === "JOURNAL_REVERSAL",
    "Target journal must be a JOURNAL_REVERSAL.",
  );

  assert(
    reversalBefore.sourceId === ORIGINAL_ID,
    "Reversal sourceId must reference the original.",
  );

  assert(
    reversalBefore.reversalOfId === ORIGINAL_ID,
    "Target must reference the original through reversalOfId.",
  );

  const childReversalsBefore = await prisma.journalEntry.count({
    where: {
      tenantId: TENANT_ID,
      reversalOfId: REVERSAL_ID,
    },
  });

  assert(
    childReversalsBefore === 0,
    "Reversal journal must not already have its own reversal.",
  );

  console.log(
    `Target: ${reversalBefore.journalNumber} | ${reversalBefore.status}`,
  );
  console.log(`Reversal Of: ${reversalBefore.reversalOfId}`);
  console.log("");

  let rejected = false;

  try {
    await reverseJournal({
      tenantId: TENANT_ID,
      journalEntryId: REVERSAL_ID,
      reversalDate: new Date("2098-06-15T00:00:00.000Z"),
      reason: "15P.7 reversal-of-reversal rejection test",
      reversedById: ACTOR_ID,
    });

    throw new Error(
      "SECURITY FAILURE: reversal-of-reversal was unexpectedly allowed.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("SECURITY FAILURE:")
    ) {
      throw error;
    }

    assert(
      error instanceof JournalReversalError,
      "Attempt must return JournalReversalError.",
    );

    assert(
      error.code === "REVERSAL_OF_REVERSAL_NOT_ALLOWED",
      `Expected REVERSAL_OF_REVERSAL_NOT_ALLOWED, received ${error.code}.`,
    );

    rejected = true;

    console.log(
      `PASS: reversal-of-reversal rejected with ${error.code}`,
    );
  }

  assert(
    rejected,
    "Reversal-of-reversal attempt must be rejected.",
  );

  const reversalAfter = await prisma.journalEntry.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: REVERSAL_ID,
      },
    },
    select: {
      id: true,
      journalNumber: true,
      status: true,
      sourceType: true,
      sourceId: true,
      reversalOfId: true,
    },
  });

  assert(
    reversalAfter !== null,
    "Reversal journal must still exist.",
  );

  assert(
    reversalAfter.status === "POSTED",
    "Reversal journal must remain POSTED.",
  );

  assert(
    reversalAfter.sourceType === reversalBefore.sourceType,
    "Reversal sourceType must remain unchanged.",
  );

  assert(
    reversalAfter.sourceId === reversalBefore.sourceId,
    "Reversal sourceId must remain unchanged.",
  );

  assert(
    reversalAfter.reversalOfId === reversalBefore.reversalOfId,
    "reversalOfId must remain unchanged.",
  );

  const childReversalsAfter = await prisma.journalEntry.count({
    where: {
      tenantId: TENANT_ID,
      reversalOfId: REVERSAL_ID,
    },
  });

  assert(
    childReversalsAfter === 0,
    "Rejected attempt must not create a child reversal.",
  );

  const originalAfter = await prisma.journalEntry.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: ORIGINAL_ID,
      },
    },
    select: {
      status: true,
    },
  });

  assert(
    originalAfter !== null,
    "Original journal must still exist.",
  );

  assert(
    originalAfter.status === "REVERSED",
    "Original journal must remain REVERSED.",
  );

  console.log("PASS: reversal journal remains POSTED");
  console.log("PASS: no child reversal was created");
  console.log("PASS: original journal remains REVERSED");
  console.log("");
  console.log(
    "15P.7N.6 REVERSAL-OF-REVERSAL PROTECTION: PASS",
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