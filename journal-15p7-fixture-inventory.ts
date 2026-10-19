import { prisma } from "./src/db/prisma.js";

const tenantId = "9af89483-476a-4367-99b0-8cc15abc0011";

async function main() {
  const start = new Date("2098-01-01T00:00:00.000Z");
  const end = new Date("2099-01-01T00:00:00.000Z");

  const journals = await prisma.journalEntry.findMany({
    where: {
      tenantId,
      journalDate: { gte: start, lt: end },
      sourceType: {
        in: ["GL_TEST", "GL_TEST_IDEMPOTENCY", "GL_TEST_SYSTEM"],
      },
    },
    select: {
      id: true,
      journalNumber: true,
      status: true,
      sourceType: true,
      lines: { select: { id: true } },
    },
    orderBy: { journalNumber: "asc" },
  });

  console.log("Checkpoint 15P.7L — Fixture Inventory");
  console.log("Test journals:", journals.length);

  for (const journal of journals) {
    console.log(
      `${journal.journalNumber} | ${journal.status} | ${journal.sourceType} | ${journal.lines.length} lines`
    );
  }

  const accounts = await prisma.account.count({
    where: {
      tenantId,
      code: { startsWith: "GLT-" },
    },
  });

  const periods = await prisma.fiscalPeriod.count({
    where: {
      tenantId,
      fiscalYear: { year: 2098 },
    },
  });

  const sequences = await prisma.documentSequence.count({
    where: {
      tenantId,
      documentType: "JOURNAL",
      year: 2098,
    },
  });

  console.log("GLT fixture accounts:", accounts);
  console.log("2098 fiscal periods:", periods);
  console.log("2098 journal sequences:", sequences);
  console.log("Inventory completed: READ ONLY");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });