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
  console.log("Checkpoint 15P.7N.5 — Duplicate Reversal Protection");
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
    },
  });

  assert(originalBefore !== null, "Original journal must exist.");
  assert(
    originalBefore.status === "REVERSED",
    "Original journal must already be REVERSED.",
  );

  const reversalsBefore = await prisma.journalEntry.findMany({
    where: {
      tenantId: TENANT_ID,
      reversalOfId: ORIGINAL_ID,
    },
    select: {
      id: true,
      journalNumber: true,
      status: true,
    },
  });

  assert(
    reversalsBefore.length === 1,
    "Exactly one reversal must exist before the duplicate attempt.",
  );

  const existingReversal = reversalsBefore[0];

  assert(
    existingReversal !== undefined,
    "Existing reversal must be available.",
  );

  assert(
    existingReversal.status === "POSTED",
    "Existing reversal must be POSTED.",
  );

  console.log(
    `Original: ${originalBefore.journalNumber} | ${originalBefore.status}`,
  );
  console.log(
    `Existing reversal: ${existingReversal.journalNumber} | ${existingReversal.status}`,
  );
  console.log("");

  let rejected = false;

  try {
    await reverseJournal({
      tenantId: TENANT_ID,
      journalEntryId: ORIGINAL_ID,
      reversalDate: new Date("2098-06-15T00:00:00.000Z"),
      reason: "15P.7 duplicate reversal rejection test",
      reversedById: ACTOR_ID,
    });

    throw new Error(
      "SECURITY FAILURE: duplicate reversal was unexpectedly allowed.",
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
      "Duplicate attempt must return JournalReversalError.",
    );

    assert(
      error.code === "ALREADY_REVERSED",
      `Expected ALREADY_REVERSED, received ${error.code}.`,
    );

    rejected = true;

    console.log(
      `PASS: duplicate reversal rejected with ${error.code}`,
    );
  }

  assert(rejected, "Duplicate reversal must be rejected.");

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

  assert(originalAfter !== null, "Original journal must still exist.");

  assert(
    originalAfter.status === "REVERSED",
    "Original journal must remain REVERSED.",
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
    },
  });

  assert(
    reversalsAfter.length === 1,
    "Duplicate attempt must not create another reversal.",
  );

  const reversalAfter = reversalsAfter[0];

  assert(
    reversalAfter !== undefined,
    "Existing reversal must still exist.",
  );

  assert(
    reversalAfter.id === existingReversal.id,
    "Existing reversal identity must remain unchanged.",
  );

  assert(
    reversalAfter.journalNumber === existingReversal.journalNumber,
    "Existing reversal number must remain unchanged.",
  );

  assert(
    reversalAfter.status === "POSTED",
    "Existing reversal must remain POSTED.",
  );

  console.log("PASS: original remains REVERSED");
  console.log("PASS: exactly one reversal still exists");
  console.log("PASS: existing reversal remains unchanged");
  console.log("");
  console.log("15P.7N.5 DUPLICATE REVERSAL PROTECTION: PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });