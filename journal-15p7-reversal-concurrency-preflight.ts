import { prisma } from "./src/db/prisma.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ORIGINAL_ID = "0e07d241-4097-446c-bdb1-cf710e67ce9f";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  console.log("Checkpoint 15P.7N.8A — Reversal Concurrency Preflight");
  console.log("");

  const original = await prisma.journalEntry.findUnique({
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
      sourceType: true,
      sourceId: true,
    },
  });

  assert(original !== null, "Concurrency-test journal must exist.");

  assert(
    original.status === "POSTED",
    `Expected POSTED, found ${original.status}.`,
  );

  assert(
    original.reversalOfId === null,
    "Concurrency-test journal must not itself be a reversal.",
  );

  const existingReversals = await prisma.journalEntry.findMany({
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
    existingReversals.length === 0,
    "Concurrency-test journal must not already have a reversal.",
  );

  console.log("Journal ID:", original.id);
  console.log("Journal Number:", original.journalNumber);
  console.log("Status:", original.status);
  console.log("Source Type:", original.sourceType);
  console.log("Source ID:", original.sourceId);
  console.log("Existing Reversals:", existingReversals.length);
  console.log("");
  console.log("15P.7N.8A REVERSAL CONCURRENCY PREFLIGHT: PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });