import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ACTOR_ID = "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const POSTED_NUMBER = "SECURITY-TEST-DIRECT-POSTED";
const REVERSED_NUMBER = "SECURITY-TEST-DIRECT-REVERSED";
const DRAFT_NUMBER = "SECURITY-TEST-VALID-DRAFT";

const ROLLBACK_SENTINEL = "15P_7O_7_DRAFT_ROLLBACK";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function isIntegrityViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  const meta = error.meta as Record<string, unknown> | undefined;

  const databaseCode =
    typeof meta?.code === "string"
      ? meta.code
      : typeof meta?.database_error === "string"
        ? meta.database_error
        : null;

  return (
    databaseCode === "23514" ||
    error.message.includes("23514") ||
    error.message.includes(
      "Journal entries must be created in DRAFT status",
    )
  );
}

async function assertNoJournal(journalNumber: string): Promise<void> {
  const count = await prisma.journalEntry.count({
    where: {
      tenantId: TENANT_ID,
      journalNumber,
    },
  });

  assert(
    count === 0,
    `${journalNumber} unexpectedly exists in the database.`,
  );
}

async function main() {
  console.log(
    "Checkpoint 15P.7O.7 — Journal Insert Hardening Behavioral Verification",
  );
  console.log("");

  await assertNoJournal(POSTED_NUMBER);
  await assertNoJournal(REVERSED_NUMBER);
  await assertNoJournal(DRAFT_NUMBER);

  console.log("PASS: test journal numbers are clean before execution");
  console.log("");

  // ----------------------------------------------------------
  // 1. Direct POSTED insert must fail.
  // ----------------------------------------------------------

  let postedRejected = false;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.create({
        data: {
          tenantId: TENANT_ID,
          journalNumber: POSTED_NUMBER,
          journalDate: new Date("2098-06-15T00:00:00.000Z"),
          description: "15P.7O.7 direct POSTED insert test",
          sourceType: "SECURITY_TEST",
          currencyCode: "GHS",
          exchangeRate: new Prisma.Decimal(1),
          status: "POSTED",
          postedAt: new Date(),
          postedById: ACTOR_ID,
          createdById: ACTOR_ID,
        },
      });
    });

    throw new Error(
      "SECURITY FAILURE: direct POSTED journal insert unexpectedly succeeded.",
    );
  } catch (error) {
    if (isIntegrityViolation(error)) {
      postedRejected = true;
    } else {
      throw error;
    }
  }

  assert(
    postedRejected,
    "Direct POSTED insert must be rejected by database integrity protection.",
  );

  await assertNoJournal(POSTED_NUMBER);

  console.log("PASS: direct POSTED insert rejected");
  console.log("PASS: rejected POSTED journal did not persist");
  console.log("");

  // ----------------------------------------------------------
  // 2. Direct REVERSED insert must fail.
  // ----------------------------------------------------------

  let reversedRejected = false;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.create({
        data: {
          tenantId: TENANT_ID,
          journalNumber: REVERSED_NUMBER,
          journalDate: new Date("2098-06-15T00:00:00.000Z"),
          description: "15P.7O.7 direct REVERSED insert test",
          sourceType: "SECURITY_TEST",
          currencyCode: "GHS",
          exchangeRate: new Prisma.Decimal(1),
          status: "REVERSED",
          createdById: ACTOR_ID,
        },
      });
    });

    throw new Error(
      "SECURITY FAILURE: direct REVERSED journal insert unexpectedly succeeded.",
    );
  } catch (error) {
    if (isIntegrityViolation(error)) {
      reversedRejected = true;
    } else {
      throw error;
    }
  }

  assert(
    reversedRejected,
    "Direct REVERSED insert must be rejected by database integrity protection.",
  );

  await assertNoJournal(REVERSED_NUMBER);

  console.log("PASS: direct REVERSED insert rejected");
  console.log("PASS: rejected REVERSED journal did not persist");
  console.log("");

  // ----------------------------------------------------------
  // 3. Legitimate DRAFT insert must still work.
  //    Intentionally roll it back afterward.
  // ----------------------------------------------------------

  let draftObservedInsideTransaction = false;
  let rollbackObserved = false;

  try {
    await prisma.$transaction(async (tx) => {
      const draft = await tx.journalEntry.create({
        data: {
          tenantId: TENANT_ID,
          journalNumber: DRAFT_NUMBER,
          journalDate: new Date("2098-06-15T00:00:00.000Z"),
          description: "15P.7O.7 valid DRAFT insert test",
          sourceType: "SECURITY_TEST",
          currencyCode: "GHS",
          exchangeRate: new Prisma.Decimal(1),
          status: "DRAFT",
          createdById: ACTOR_ID,
        },
        select: {
          id: true,
          status: true,
          journalNumber: true,
        },
      });

      assert(
        draft.status === "DRAFT",
        `Expected inserted journal to be DRAFT, found ${draft.status}.`,
      );

      const persistedInside = await tx.journalEntry.findUnique({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: draft.id,
          },
        },
        select: {
          status: true,
          journalNumber: true,
        },
      });

      assert(
        persistedInside !== null,
        "DRAFT journal must be visible inside its transaction.",
      );

      assert(
        persistedInside.status === "DRAFT",
        "Database must preserve DRAFT status.",
      );

      draftObservedInsideTransaction = true;

      console.log("PASS: legitimate DRAFT insert accepted inside transaction");

      throw new Error(ROLLBACK_SENTINEL);
    });

    throw new Error(
      "TEST FAILURE: DRAFT rollback transaction unexpectedly committed.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === ROLLBACK_SENTINEL
    ) {
      rollbackObserved = true;
    } else {
      throw error;
    }
  }

  assert(
    draftObservedInsideTransaction,
    "Legitimate DRAFT insert was not observed inside transaction.",
  );

  assert(
    rollbackObserved,
    "Intentional DRAFT rollback was not observed.",
  );

  await assertNoJournal(DRAFT_NUMBER);

  console.log("PASS: legitimate DRAFT transaction rolled back");
  console.log("PASS: DRAFT test journal did not persist");
  console.log("");
  console.log(
    "15P.7O.7 JOURNAL INSERT HARDENING BEHAVIORAL VERIFICATION: PASS",
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