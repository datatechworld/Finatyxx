import { prisma } from "./src/db/prisma.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ORIGINAL_ID = "46936eb1-fa00-415d-8a54-3ff612688405";

async function main() {
  console.log("Checkpoint 15P.7N.6 — Reversal-of-Reversal Preflight");
  console.log("");

  const reversal = await prisma.journalEntry.findFirst({
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
    },
  });

  if (!reversal) {
    throw new Error("Reversal journal was not found.");
  }

  console.log("Reversal ID:", reversal.id);
  console.log("Journal Number:", reversal.journalNumber);
  console.log("Status:", reversal.status);
  console.log("Source Type:", reversal.sourceType);
  console.log("Source ID:", reversal.sourceId);
  console.log("Reversal Of ID:", reversal.reversalOfId);
  console.log("");

  if (reversal.status !== "POSTED") {
    throw new Error(
      `Expected reversal to be POSTED, found ${reversal.status}.`,
    );
  }

  if (reversal.sourceType !== "JOURNAL_REVERSAL") {
    throw new Error(
      `Expected JOURNAL_REVERSAL, found ${reversal.sourceType}.`,
    );
  }

  if (reversal.reversalOfId !== ORIGINAL_ID) {
    throw new Error(
      "Reversal journal does not reference the expected original.",
    );
  }

  console.log("15P.7N.6 REVERSAL-OF-REVERSAL PREFLIGHT: PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });