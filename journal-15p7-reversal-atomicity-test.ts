import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  reverseJournalInExistingTransaction,
} from "./src/modules/accounting/journal-reversal.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ORIGINAL_ID = "bfa5cca1-bf42-463f-9907-4a3c87c726af";
const ACTOR_ID = "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const ROLLBACK_SENTINEL =
  "15P_7N_7_INTENTIONAL_ROLLBACK_AFTER_SUCCESSFUL_REVERSAL";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  console.log("Checkpoint 15P.7N.7 — Reversal Transaction Atomicity");
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
    "Atomicity-test original journal must exist.",
  );

  assert(
    originalBefore.status === "POSTED",
    `Expected original to be POSTED before test, found ${originalBefore.status}.`,
  );

  assert(
    originalBefore.reversalOfId === null,
    "Atomicity-test original must not itself be a reversal.",
  );

  const reversalsBefore = await prisma.journalEntry.count({
    where: {
      tenantId: TENANT_ID,
      reversalOfId: ORIGINAL_ID,
    },
  });

  assert(
    reversalsBefore === 0,
    "Atomicity-test journal must not already have a reversal.",
  );

  console.log(
    `Original before: ${originalBefore.journalNumber} | ${originalBefore.status}`,
  );
  console.log("PASS: no reversal exists before transaction");
  console.log("");

  let reversalIdInsideTransaction: string | null = null;
  let reversalNumberInsideTransaction: string | null = null;
  let intentionalRollbackObserved = false;

  try {
    await prisma.$transaction(
      async (tx) => {
        const result = await reverseJournalInExistingTransaction(tx, {
          tenantId: TENANT_ID,
          journalEntryId: ORIGINAL_ID,
          reversalDate: new Date("2098-06-15T00:00:00.000Z"),
          reason: "15P.7N.7 atomic rollback verification",
          reversedById: ACTOR_ID,
        });

        reversalIdInsideTransaction = result.reversalJournal.id;
        reversalNumberInsideTransaction =
          result.reversalJournal.journalNumber;

        assert(
          result.originalStatus === "REVERSED",
          "Inside transaction, original must transition to REVERSED.",
        );

        assert(
          result.reversalJournal.status === "POSTED",
          "Inside transaction, reversal must transition to POSTED.",
        );

        assert(
          result.reversalJournal.reversalOfId === ORIGINAL_ID,
          "Inside transaction, reversal must reference the original.",
        );

        const originalInside = await tx.journalEntry.findUnique({
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
          originalInside !== null,
          "Original must exist inside transaction.",
        );

        assert(
          originalInside.status === "REVERSED",
          "Database must see original as REVERSED inside transaction.",
        );

        const reversalInside = await tx.journalEntry.findFirst({
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
          reversalInside !== null,
          "Database must see reversal inside transaction.",
        );

        assert(
          reversalInside.id === result.reversalJournal.id,
          "Inside-transaction reversal must match service result.",
        );

        assert(
          reversalInside.status === "POSTED",
          "Database must see reversal as POSTED inside transaction.",
        );

        console.log(
          `PASS: reversal completed inside transaction as ${reversalInside.journalNumber}`,
        );

        console.log(
          "PASS: original is REVERSED inside transaction",
        );

        console.log(
          "PASS: reversal is POSTED inside transaction",
        );

        throw new Error(ROLLBACK_SENTINEL);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    throw new Error(
      "ATOMICITY FAILURE: transaction unexpectedly committed.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === ROLLBACK_SENTINEL
    ) {
      intentionalRollbackObserved = true;

      console.log(
        "PASS: intentional post-reversal failure triggered rollback",
      );
    } else {
      throw error;
    }
  }

  assert(
    intentionalRollbackObserved,
    "Intentional rollback must have been observed.",
  );

  assert(
    reversalIdInsideTransaction !== null,
    "A reversal must have existed before rollback.",
  );

  assert(
    reversalNumberInsideTransaction !== null,
    "A reversal number must have been allocated before rollback.",
  );

  console.log(
    `Rolled-back reversal: ${reversalNumberInsideTransaction}`,
  );
  console.log("");

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
      reversalOfId: true,
    },
  });

  assert(
    originalAfter !== null,
    "Original journal must still exist after rollback.",
  );

  assert(
    originalAfter.status === "POSTED",
    `Original must return to POSTED after rollback, found ${originalAfter.status}.`,
  );

  assert(
    originalAfter.reversalOfId === null,
    "Original must remain a normal source journal after rollback.",
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
    reversalsAfter.length === 0,
    "No reversal may survive the rolled-back transaction.",
  );

  const rolledBackJournal = await prisma.journalEntry.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: reversalIdInsideTransaction,
      },
    },
    select: {
      id: true,
    },
  });

  assert(
    rolledBackJournal === null,
    "The reversal created inside the transaction must not persist.",
  );

  console.log("PASS: original returned to POSTED after rollback");
  console.log("PASS: no reversal relationship survived rollback");
  console.log("PASS: rolled-back reversal journal does not exist");
  console.log("");
  console.log("15P.7N.7 REVERSAL TRANSACTION ATOMICITY: PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });