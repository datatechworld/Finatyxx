import { prisma } from "./src/db/prisma.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ORIGINAL_ID = "46936eb1-fa00-415d-8a54-3ff612688405";

async function expectDatabaseRejection(
  name: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
    throw new Error(`SECURITY FAILURE: ${name} was unexpectedly allowed.`);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("SECURITY FAILURE:")
    ) {
      throw error;
    }

    console.log(`PASS: ${name} rejected`);
  }
}

async function main() {
  console.log("Checkpoint 15P.7N.4 — Reversal Immutability Test");
  console.log("");

  const original = await prisma.journalEntry.findUnique({
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

  if (!original) {
    throw new Error("Original journal not found.");
  }

  if (original.status !== "REVERSED") {
    throw new Error(
      `Expected original journal to be REVERSED, found ${original.status}.`,
    );
  }

  const reversal = await prisma.journalEntry.findFirst({
    where: {
      tenantId: TENANT_ID,
      reversalOfId: ORIGINAL_ID,
    },
    include: {
      lines: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!reversal) {
    throw new Error("Reversal journal not found.");
  }

  if (reversal.status !== "POSTED") {
    throw new Error(
      `Expected reversal journal to be POSTED, found ${reversal.status}.`,
    );
  }

  const originalLine = original.lines[0];
  const reversalLine = reversal.lines[0];

  if (!originalLine || !reversalLine) {
    throw new Error("Expected journal lines were not found.");
  }

  console.log(
    `Original: ${original.journalNumber} | ${original.status}`,
  );
  console.log(
    `Reversal: ${reversal.journalNumber} | ${reversal.status}`,
  );
  console.log("");

  await expectDatabaseRejection(
    "UPDATE original REVERSED journal substance",
    () =>
      prisma.journalEntry.update({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: ORIGINAL_ID,
          },
        },
        data: {
          description: "ILLEGAL MUTATION TEST",
        },
      }),
  );

  await expectDatabaseRejection(
    "DELETE original REVERSED journal",
    () =>
      prisma.journalEntry.delete({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: ORIGINAL_ID,
          },
        },
      }),
  );

  await expectDatabaseRejection(
    "UPDATE original REVERSED journal line",
    () =>
      prisma.journalLine.update({
        where: {
          id: originalLine.id,
        },
        data: {
          description: "ILLEGAL LINE MUTATION TEST",
        },
      }),
  );

  await expectDatabaseRejection(
    "DELETE original REVERSED journal line",
    () =>
      prisma.journalLine.delete({
        where: {
          id: originalLine.id,
        },
      }),
  );

  await expectDatabaseRejection(
    "UPDATE reversal POSTED journal substance",
    () =>
      prisma.journalEntry.update({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: reversal.id,
          },
        },
        data: {
          description: "ILLEGAL REVERSAL MUTATION TEST",
        },
      }),
  );

  await expectDatabaseRejection(
    "DELETE reversal POSTED journal",
    () =>
      prisma.journalEntry.delete({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: reversal.id,
          },
        },
      }),
  );

  await expectDatabaseRejection(
    "UPDATE reversal POSTED journal line",
    () =>
      prisma.journalLine.update({
        where: {
          id: reversalLine.id,
        },
        data: {
          description: "ILLEGAL REVERSAL LINE MUTATION TEST",
        },
      }),
  );

  await expectDatabaseRejection(
    "DELETE reversal POSTED journal line",
    () =>
      prisma.journalLine.delete({
        where: {
          id: reversalLine.id,
        },
      }),
  );

  console.log("");
  console.log("15P.7N.4 REVERSAL IMMUTABILITY: PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });