import { randomUUID } from "node:crypto";
import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  postJournalInExistingTransaction,
} from "./src/modules/accounting/general-ledger-posting.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ACTOR_ID = "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const TEST_YEAR = 2097;
const TEST_DATE = new Date("2097-06-15T12:00:00.000Z");

const D = (value: string | number) => new Prisma.Decimal(value);

const fiscalYearId = randomUUID();
const fiscalPeriodId = randomUUID();
const debitAccountId = randomUUID();
const creditAccountId = randomUUID();
const sourceId = randomUUID();

const ROLLBACK_SENTINEL = "15P_7O_8_POSTING_REGRESSION_ROLLBACK";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log(
    "Checkpoint 15P.7O.8 — Posting Engine Regression Under Migration #12",
  );
  console.log("");

  // ----------------------------------------------------------
  // Read-only preflight outside the test transaction.
  // ----------------------------------------------------------

  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: {
      id: true,
      status: true,
      baseCurrencyCode: true,
    },
  });

  assert(tenant, `Test tenant ${TENANT_ID} was not found.`);

  assert(
    tenant.status === "TRIAL" || tenant.status === "ACTIVE",
    `Test tenant is not operational: ${tenant.status}`,
  );

  assert(
    tenant.baseCurrencyCode === "GHS",
    `Expected tenant base currency GHS; found ${tenant.baseCurrencyCode}.`,
  );

  const currency = await prisma.currency.findUnique({
    where: { code: "GHS" },
    select: { active: true },
  });

  assert(currency?.active, "GHS currency must exist and be active.");

  const overlappingYear = await prisma.fiscalYear.findFirst({
    where: {
      tenantId: TENANT_ID,
      startDate: {
        lte: new Date(`${TEST_YEAR}-12-31T00:00:00.000Z`),
      },
      endDate: {
        gte: new Date(`${TEST_YEAR}-01-01T00:00:00.000Z`),
      },
    },
    select: { id: true },
  });

  assert(
    !overlappingYear,
    `A fiscal year already overlaps isolated regression year ${TEST_YEAR}.`,
  );

  const existingSequence = await prisma.documentSequence.findFirst({
    where: {
      tenantId: TENANT_ID,
      branchId: null,
      documentType: "JOURNAL",
      year: TEST_YEAR,
    },
    select: {
      id: true,
      nextNumber: true,
    },
  });

  assert(
    !existingSequence,
    `A JOURNAL document sequence already exists for regression year ${TEST_YEAR}.`,
  );

  console.log("PASS: tenant is operational");
  console.log("PASS: GHS base currency is valid");
  console.log(`PASS: isolated fiscal year ${TEST_YEAR} is available`);
  console.log("PASS: no pre-existing JOURNAL sequence exists");
  console.log("");

  let journalId: string | null = null;
  let journalNumber: string | null = null;
  let postingObserved = false;
  let rollbackObserved = false;

  try {
    await prisma.$transaction(
      async (tx) => {
        // ------------------------------------------------------
        // Create isolated fiscal year and OPEN posting period.
        // Everything is inside the outer transaction.
        // ------------------------------------------------------

        await tx.fiscalYear.create({
          data: {
            id: fiscalYearId,
            tenantId: TENANT_ID,
            name: `GL-REGRESSION-${TEST_YEAR}-${fiscalYearId.slice(0, 8)}`,
            startDate: new Date(`${TEST_YEAR}-01-01T00:00:00.000Z`),
            endDate: new Date(`${TEST_YEAR}-12-31T00:00:00.000Z`),
            status: "OPEN",
            periods: {
              create: {
                id: fiscalPeriodId,
                periodNumber: 6,
                name: `GL Regression Period ${TEST_YEAR}`,
                startDate: new Date(`${TEST_YEAR}-06-01T00:00:00.000Z`),
                endDate: new Date(`${TEST_YEAR}-06-30T00:00:00.000Z`),
                status: "OPEN",
              },
            },
          },
        });

        await tx.account.createMany({
          data: [
            {
              id: debitAccountId,
              tenantId: TENANT_ID,
              code: `GLR-D-${debitAccountId.slice(0, 8)}`,
              name: "GL Regression Debit Account",
              type: "ASSET",
              normalBalance: "DEBIT",
              isControlAccount: false,
              allowManualPosting: true,
              status: "ACTIVE",
            },
            {
              id: creditAccountId,
              tenantId: TENANT_ID,
              code: `GLR-C-${creditAccountId.slice(0, 8)}`,
              name: "GL Regression Credit Account",
              type: "LIABILITY",
              normalBalance: "CREDIT",
              isControlAccount: false,
              allowManualPosting: true,
              status: "ACTIVE",
            },
          ],
        });

        console.log("PASS: isolated fiscal year and OPEN period created");
        console.log("PASS: isolated posting accounts created");

        // ------------------------------------------------------
        // Exercise the actual V5 production posting engine.
        //
        // Expected internal lifecycle:
        // DRAFT entry + lines -> UPDATE entry to POSTED.
        // Migration #12 must permit this legitimate lifecycle.
        // ------------------------------------------------------

        const posted = await postJournalInExistingTransaction(
          tx,
          {
            tenantId: TENANT_ID,
            journalDate: TEST_DATE,
            description:
              "15P.7O.8 Migration #12 posting-engine regression verification",
            sourceType: "GL_INSERT_HARDENING_REGRESSION",
            sourceId,
            currencyCode: "GHS",
            exchangeRate: D(1),
            createdById: ACTOR_ID,
            lines: [
              {
                accountId: debitAccountId,
                description: "Regression debit",
                debit: D(100),
                credit: D(0),
              },
              {
                accountId: creditAccountId,
                description: "Regression credit",
                debit: D(0),
                credit: D(100),
              },
            ],
          },
          "SYSTEM",
        );

        journalId = posted.id;
        journalNumber = posted.journalNumber;

        assert(
          posted.status === "POSTED",
          `Expected posting engine result POSTED; found ${posted.status}.`,
        );

        assert(
          posted.lines.length === 2,
          `Expected exactly 2 journal lines; found ${posted.lines.length}.`,
        );

        const totalDebit = posted.lines.reduce(
          (sum, line) => sum.plus(line.debit),
          D(0),
        );

        const totalCredit = posted.lines.reduce(
          (sum, line) => sum.plus(line.credit),
          D(0),
        );

        assert(
          totalDebit.equals(totalCredit),
          `Posted journal is unbalanced: debit=${totalDebit.toString()} credit=${totalCredit.toString()}.`,
        );

        assert(
          totalDebit.equals(D(100)),
          `Expected total debit 100; found ${totalDebit.toString()}.`,
        );

        const persisted = await tx.journalEntry.findUnique({
          where: {
            tenantId_id: {
              tenantId: TENANT_ID,
              id: posted.id,
            },
          },
          include: {
            lines: true,
          },
        });

        assert(
          persisted !== null,
          "Posted journal was not visible inside the transaction.",
        );

        assert(
          persisted.status === "POSTED",
          `Database journal status should be POSTED; found ${persisted.status}.`,
        );

        assert(
          persisted.lines.length === 2,
          `Database journal should contain 2 lines; found ${persisted.lines.length}.`,
        );

        const persistedDebit = persisted.lines.reduce(
          (sum, line) => sum.plus(line.debit),
          D(0),
        );

        const persistedCredit = persisted.lines.reduce(
          (sum, line) => sum.plus(line.credit),
          D(0),
        );

        assert(
          persistedDebit.equals(persistedCredit),
          "Persisted journal debit and credit totals do not balance.",
        );

        postingObserved = true;

        console.log("");
        console.log(`PASS: production posting engine returned ${posted.status}`);
        console.log(`PASS: journal number allocated: ${posted.journalNumber}`);
        console.log("PASS: posted journal contains exactly 2 lines");
        console.log(
          `PASS: journal balanced at ${totalDebit.toString()} = ${totalCredit.toString()}`,
        );
        console.log("PASS: POSTED state physically visible inside transaction");

        // ------------------------------------------------------
        // Never commit this accounting test fixture.
        // ------------------------------------------------------

        throw new Error(ROLLBACK_SENTINEL);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    throw new Error(
      "TEST FAILURE: regression transaction unexpectedly committed.",
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
    postingObserved,
    "Production posting lifecycle was not successfully observed.",
  );

  assert(
    rollbackObserved,
    "Intentional outer transaction rollback was not observed.",
  );

  console.log("");
  console.log("PASS: intentional outer transaction rollback completed");

  // ----------------------------------------------------------
  // Verify absolutely nothing from the fixture survived.
  // ----------------------------------------------------------

  if (journalId !== null) {
    const journalAfterRollback = await prisma.journalEntry.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: journalId,
      },
      select: { id: true },
    });

    assert(
      journalAfterRollback === null,
      "Regression journal persisted after outer rollback.",
    );
  }

  const sourceAfterRollback = await prisma.journalEntry.count({
    where: {
      tenantId: TENANT_ID,
      sourceType: "GL_INSERT_HARDENING_REGRESSION",
      sourceId,
    },
  });

  assert(
    sourceAfterRollback === 0,
    "Regression source-backed journal persisted after rollback.",
  );

  const yearAfterRollback = await prisma.fiscalYear.count({
    where: {
      tenantId: TENANT_ID,
      id: fiscalYearId,
    },
  });

  assert(
    yearAfterRollback === 0,
    "Regression fiscal year persisted after rollback.",
  );

  const periodAfterRollback = await prisma.fiscalPeriod.count({
    where: {
      tenantId: TENANT_ID,
      id: fiscalPeriodId,
    },
  });

  assert(
    periodAfterRollback === 0,
    "Regression fiscal period persisted after rollback.",
  );

  const accountsAfterRollback = await prisma.account.count({
    where: {
      tenantId: TENANT_ID,
      id: {
        in: [debitAccountId, creditAccountId],
      },
    },
  });

  assert(
    accountsAfterRollback === 0,
    "Regression accounts persisted after rollback.",
  );

  const sequenceAfterRollback = await prisma.documentSequence.findFirst({
    where: {
      tenantId: TENANT_ID,
      branchId: null,
      documentType: "JOURNAL",
      year: TEST_YEAR,
    },
    select: {
      id: true,
      nextNumber: true,
    },
  });

  assert(
    sequenceAfterRollback === null,
    "Regression JOURNAL document sequence persisted after rollback.",
  );

  console.log(
    `PASS: regression journal ${journalNumber ?? "(unknown)"} did not persist`,
  );
  console.log("PASS: source idempotency record did not persist");
  console.log("PASS: fiscal year did not persist");
  console.log("PASS: fiscal period did not persist");
  console.log("PASS: posting accounts did not persist");
  console.log("PASS: JOURNAL document sequence did not persist");
  console.log("");
  console.log(
    "15P.7O.8 POSTING ENGINE REGRESSION UNDER MIGRATION #12: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15P.7O.8 POSTING ENGINE REGRESSION UNDER MIGRATION #12: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });