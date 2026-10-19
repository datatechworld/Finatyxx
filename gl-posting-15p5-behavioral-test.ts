import { randomUUID } from "node:crypto";
import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  GeneralLedgerPostingError,
  postJournal,
} from "./src/modules/accounting/general-ledger-posting.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ACTOR_ID = "1668f4f4-48fd-44d2-9ffe-293812ee55e9";
const TEST_YEAR = 2098;
const TEST_DATE = new Date("2098-06-15T12:00:00.000Z");
const TEST_DATE_ONLY = new Date("2098-06-15T00:00:00.000Z");
const D = (value: string | number) => new Prisma.Decimal(value);

const fixture = {
  fiscalYearId: randomUUID(),
  fiscalPeriodId: randomUUID(),
  debitAccountId: randomUUID(),
  creditAccountId: randomUUID(),
  restrictedAccountId: randomUUID(),
};

const createdJournalIds: string[] = [];
let passed = 0;
let failed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`PASS: ${name}`);
}

function fail(name: string, detail: unknown): void {
  failed += 1;
  console.error(`FAIL: ${name}`);
  console.error(detail);
}

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    pass(name);
  } catch (error) {
    fail(name, error);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectPostingError(
  expectedCode: GeneralLedgerPostingError["code"],
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert(
      error instanceof GeneralLedgerPostingError,
      `Expected GeneralLedgerPostingError, received ${String(error)}`,
    );
    assert(
      error.code === expectedCode,
      `Expected error code ${expectedCode}, received ${error.code}`,
    );
    return;
  }
  throw new Error(`Expected posting error ${expectedCode}, but operation succeeded.`);
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT_ID,
    journalDate: TEST_DATE,
    description: "Finatyx GL posting engine behavioral verification",
    sourceType: "GL_TEST",
    sourceId: randomUUID(),
    currencyCode: "GHS",
    exchangeRate: D(1),
    createdById: ACTOR_ID,
    lines: [
      {
        accountId: fixture.debitAccountId,
        description: "Test debit",
        debit: D(100),
        credit: D(0),
      },
      {
        accountId: fixture.creditAccountId,
        description: "Test credit",
        debit: D(0),
        credit: D(100),
      },
    ],
    ...overrides,
  };
}

async function getSequenceState(): Promise<{ id: string; nextNumber: bigint } | null> {
  return prisma.documentSequence.findFirst({
    where: {
      tenantId: TENANT_ID,
      branchId: null,
      documentType: "JOURNAL",
      year: TEST_YEAR,
    },
    select: { id: true, nextNumber: true },
  });
}

async function setup(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { id: true, status: true, baseCurrencyCode: true },
  });

  assert(tenant, `Test tenant ${TENANT_ID} was not found.`);
  assert(
    tenant.status === "TRIAL" || tenant.status === "ACTIVE",
    `Test tenant is not operational: ${tenant.status}`,
  );
  assert(
    tenant.baseCurrencyCode === "GHS",
    `This test expects GHS base currency; found ${tenant.baseCurrencyCode}.`,
  );

  const currency = await prisma.currency.findUnique({
    where: { code: "GHS" },
    select: { active: true },
  });
  assert(currency?.active, "GHS currency must exist and be active.");

  const existingYear = await prisma.fiscalYear.findFirst({
    where: {
      tenantId: TENANT_ID,
      startDate: { lte: new Date(`${TEST_YEAR}-12-31T00:00:00.000Z`) },
      endDate: { gte: new Date(`${TEST_YEAR}-01-01T00:00:00.000Z`) },
    },
    select: { id: true },
  });
  assert(!existingYear, `A fiscal year already overlaps test year ${TEST_YEAR}.`);

  const existingSequence = await getSequenceState();
  assert(!existingSequence, `A JOURNAL document sequence already exists for test year ${TEST_YEAR}.`);

  await prisma.fiscalYear.create({
    data: {
      id: fixture.fiscalYearId,
      tenantId: TENANT_ID,
      name: `GL-TEST-${TEST_YEAR}-${fixture.fiscalYearId.slice(0, 8)}`,
      startDate: new Date(`${TEST_YEAR}-01-01T00:00:00.000Z`),
      endDate: new Date(`${TEST_YEAR}-12-31T00:00:00.000Z`),
      status: "OPEN",
      periods: {
        create: {
          id: fixture.fiscalPeriodId,
          periodNumber: 6,
          name: `GL Test Period ${TEST_YEAR}`,
          startDate: new Date(`${TEST_YEAR}-06-01T00:00:00.000Z`),
          endDate: new Date(`${TEST_YEAR}-06-30T00:00:00.000Z`),
          status: "OPEN",
        },
      },
    },
  });

  await prisma.account.createMany({
    data: [
      {
        id: fixture.debitAccountId,
        tenantId: TENANT_ID,
        code: `GLT-D-${fixture.debitAccountId.slice(0, 8)}`,
        name: "GL Test Debit Account",
        type: "ASSET",
        normalBalance: "DEBIT",
        isControlAccount: false,
        allowManualPosting: true,
        status: "ACTIVE",
      },
      {
        id: fixture.creditAccountId,
        tenantId: TENANT_ID,
        code: `GLT-C-${fixture.creditAccountId.slice(0, 8)}`,
        name: "GL Test Credit Account",
        type: "LIABILITY",
        normalBalance: "CREDIT",
        isControlAccount: false,
        allowManualPosting: true,
        status: "ACTIVE",
      },
      {
        id: fixture.restrictedAccountId,
        tenantId: TENANT_ID,
        code: `GLT-R-${fixture.restrictedAccountId.slice(0, 8)}`,
        name: "GL Test Restricted Account",
        type: "LIABILITY",
        normalBalance: "CREDIT",
        isControlAccount: true,
        allowManualPosting: false,
        status: "ACTIVE",
      },
    ],
  });
}

async function cleanup(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const journals = await tx.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        OR: [
          { id: { in: createdJournalIds } },
          {
            sourceType: {
              in: ["GL_TEST", "GL_TEST_IDEMPOTENCY", "GL_TEST_SYSTEM"],
            },
          },
        ],
        journalDate: {
          gte: new Date(`${TEST_YEAR}-01-01T00:00:00.000Z`),
          lte: new Date(`${TEST_YEAR}-12-31T00:00:00.000Z`),
        },
      },
      select: { id: true },
    });

    const journalIds = journals.map((journal) => journal.id);

    if (journalIds.length) {
      await tx.journalLine.deleteMany({
        where: {
          tenantId: TENANT_ID,
          journalEntryId: { in: journalIds },
        },
      });
      await tx.journalEntry.deleteMany({
        where: {
          tenantId: TENANT_ID,
          id: { in: journalIds },
        },
      });
    }

    await tx.documentSequence.deleteMany({
      where: {
        tenantId: TENANT_ID,
        branchId: null,
        documentType: "JOURNAL",
        year: TEST_YEAR,
      },
    });

    await tx.account.deleteMany({
      where: {
        tenantId: TENANT_ID,
        id: {
          in: [
            fixture.debitAccountId,
            fixture.creditAccountId,
            fixture.restrictedAccountId,
          ],
        },
      },
    });

    await tx.fiscalPeriod.deleteMany({
      where: {
        tenantId: TENANT_ID,
        id: fixture.fiscalPeriodId,
      },
    });

    await tx.fiscalYear.deleteMany({
      where: {
        tenantId: TENANT_ID,
        id: fixture.fiscalYearId,
      },
    });
  });
}

async function main(): Promise<void> {
  console.log("Checkpoint 15P.5 — General Ledger Posting Engine Behavioral Verification");
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Test year: ${TEST_YEAR}`);

  await setup();

  await check("balanced manual journal posts directly as POSTED", async () => {
    const posted = await postJournal(baseInput(), "MANUAL");
    createdJournalIds.push(posted.id);

    assert(posted.status === "POSTED", `Expected POSTED, received ${posted.status}`);
    assert(posted.postedById === ACTOR_ID, "postedById mismatch.");
    assert(posted.createdById === ACTOR_ID, "createdById mismatch.");
    assert(posted.lines.length === 2, `Expected 2 journal lines, received ${posted.lines.length}`);
    assert(posted.journalNumber.startsWith(`JRN-${TEST_YEAR}-`), `Unexpected journal number ${posted.journalNumber}`);

    const debit = posted.lines.reduce((sum, line) => sum.plus(line.debit), D(0));
    const credit = posted.lines.reduce((sum, line) => sum.plus(line.credit), D(0));
    assert(debit.eq(credit), "Persisted journal is not balanced.");
    assert(debit.eq(D(100)), `Expected total 100, received ${debit.toString()}`);
  });

  await check("unbalanced journal is rejected", async () => {
    const before = await getSequenceState();

    await expectPostingError("UNBALANCED_JOURNAL", () =>
      postJournal(
        baseInput({
          lines: [
            { accountId: fixture.debitAccountId, debit: D(100), credit: D(0) },
            { accountId: fixture.creditAccountId, debit: D(0), credit: D(99) },
          ],
        }),
        "MANUAL",
      ),
    );

    const after = await getSequenceState();
    assert(
      before?.nextNumber === after?.nextNumber,
      "Rejected unbalanced journal changed the document sequence.",
    );
  });

  await check("zero-value journal line is rejected", async () => {
    await expectPostingError("INVALID_JOURNAL_LINES", () =>
      postJournal(
        baseInput({
          lines: [
            { accountId: fixture.debitAccountId, debit: D(100), credit: D(0) },
            { accountId: fixture.creditAccountId, debit: D(0), credit: D(100) },
            { accountId: fixture.debitAccountId, debit: D(0), credit: D(0) },
          ],
        }),
        "MANUAL",
      ),
    );
  });

  await check("line with both debit and credit is rejected", async () => {
    await expectPostingError("INVALID_JOURNAL_LINES", () =>
      postJournal(
        baseInput({
          lines: [
            { accountId: fixture.debitAccountId, debit: D(100), credit: D(10) },
            { accountId: fixture.creditAccountId, debit: D(0), credit: D(90) },
          ],
        }),
        "MANUAL",
      ),
    );
  });

  await check("negative amount is rejected", async () => {
    await expectPostingError("INVALID_JOURNAL_LINES", () =>
      postJournal(
        baseInput({
          lines: [
            { accountId: fixture.debitAccountId, debit: D(-100), credit: D(0) },
            { accountId: fixture.creditAccountId, debit: D(0), credit: D(-100) },
          ],
        }),
        "MANUAL",
      ),
    );
  });

  await check("manual posting restriction is enforced", async () => {
    await expectPostingError("MANUAL_POSTING_NOT_ALLOWED", () =>
      postJournal(
        baseInput({
          lines: [
            { accountId: fixture.debitAccountId, debit: D(50), credit: D(0) },
            { accountId: fixture.restrictedAccountId, debit: D(0), credit: D(50) },
          ],
        }),
        "MANUAL",
      ),
    );
  });

  await check("SYSTEM posting may use an account blocked from manual posting", async () => {
    const posted = await postJournal(
      baseInput({
        sourceType: "GL_TEST_SYSTEM",
        lines: [
          { accountId: fixture.debitAccountId, debit: D(50), credit: D(0) },
          { accountId: fixture.restrictedAccountId, debit: D(0), credit: D(50) },
        ],
      }),
      "SYSTEM",
    );
    createdJournalIds.push(posted.id);
    assert(posted.status === "POSTED", "SYSTEM journal was not POSTED.");
  });

  await check("inactive account is rejected", async () => {
    await prisma.account.update({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: fixture.creditAccountId,
        },
      },
      data: { status: "INACTIVE" },
    });

    try {
      await expectPostingError("ACCOUNT_NOT_AVAILABLE", () =>
        postJournal(baseInput(), "SYSTEM"),
      );
    } finally {
      await prisma.account.update({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: fixture.creditAccountId,
          },
        },
        data: { status: "ACTIVE" },
      });
    }
  });

  await check("account outside the tenant scope is rejected", async () => {
    await expectPostingError("ACCOUNT_NOT_AVAILABLE", () =>
      postJournal(
        baseInput({
          lines: [
            { accountId: randomUUID(), debit: D(100), credit: D(0) },
            { accountId: fixture.creditAccountId, debit: D(0), credit: D(100) },
          ],
        }),
        "SYSTEM",
      ),
    );
  });

  await check("dimension outside the tenant scope is rejected", async () => {
    await expectPostingError("DIMENSION_NOT_AVAILABLE", () =>
      postJournal(
        baseInput({
          lines: [
            {
              accountId: fixture.debitAccountId,
              debit: D(100),
              credit: D(0),
              customerId: randomUUID(),
            },
            { accountId: fixture.creditAccountId, debit: D(0), credit: D(100) },
          ],
        }),
        "SYSTEM",
      ),
    );
  });

  await check("locked fiscal period blocks posting", async () => {
    await prisma.fiscalPeriod.update({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: fixture.fiscalPeriodId,
        },
      },
      data: { status: "LOCKED" },
    });

    try {
      await expectPostingError("PERIOD_NOT_OPEN", () =>
        postJournal(baseInput(), "SYSTEM"),
      );
    } finally {
      await prisma.fiscalPeriod.update({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: fixture.fiscalPeriodId,
          },
        },
        data: { status: "OPEN" },
      });
    }
  });

  await check("inactive currency is rejected", async () => {
    await expectPostingError("CURRENCY_NOT_AVAILABLE", () =>
      postJournal(
        baseInput({
          currencyCode: "ZZZ",
        }),
        "SYSTEM",
      ),
    );
  });

  await check("base-currency exchange rate must equal 1", async () => {
    await expectPostingError("INVALID_EXCHANGE_RATE", () =>
      postJournal(
        baseInput({
          currencyCode: "GHS",
          exchangeRate: D("1.25"),
        }),
        "SYSTEM",
      ),
    );
  });

  await check("source idempotency rejects a second posting without consuming a number", async () => {
    const sourceId = randomUUID();
    const first = await postJournal(
      baseInput({
        sourceType: "GL_TEST_IDEMPOTENCY",
        sourceId,
      }),
      "SYSTEM",
    );
    createdJournalIds.push(first.id);

    const before = await getSequenceState();
    assert(before, "Journal sequence was not created.");

    await expectPostingError("DUPLICATE_SOURCE", () =>
      postJournal(
        baseInput({
          sourceType: "GL_TEST_IDEMPOTENCY",
          sourceId,
        }),
        "SYSTEM",
      ),
    );

    const after = await getSequenceState();
    assert(after, "Journal sequence disappeared unexpectedly.");
    assert(
      before.nextNumber === after.nextNumber,
      `Duplicate source consumed a journal number: ${before.nextNumber} -> ${after.nextNumber}`,
    );

    const sourceCount = await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "GL_TEST_IDEMPOTENCY",
        sourceId,
      },
    });
    assert(sourceCount === 1, `Expected exactly 1 source journal, found ${sourceCount}.`);
  });

  await check("persisted posting uses exact Decimal balance", async () => {
    const posted = await postJournal(
      baseInput({
        lines: [
          { accountId: fixture.debitAccountId, debit: D("0.10"), credit: D(0) },
          { accountId: fixture.debitAccountId, debit: D("0.20"), credit: D(0) },
          { accountId: fixture.creditAccountId, debit: D(0), credit: D("0.30") },
        ],
      }),
      "SYSTEM",
    );
    createdJournalIds.push(posted.id);

    const debit = posted.lines.reduce((sum, line) => sum.plus(line.debit), D(0));
    const credit = posted.lines.reduce((sum, line) => sum.plus(line.credit), D(0));
    assert(debit.eq(D("0.30")), `Expected debit 0.30, found ${debit.toString()}`);
    assert(credit.eq(D("0.30")), `Expected credit 0.30, found ${credit.toString()}`);
    assert(debit.eq(credit), "Decimal journal did not balance exactly.");
  });

  const sequence = await getSequenceState();
  assert(sequence, "Expected test journal sequence to exist after successful postings.");

  console.log("");
  console.log(`Behavioral checks: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    throw new Error(`Checkpoint 15P.5 failed ${failed} behavioral check(s).`);
  }
}

let exitCode = 0;

try {
  await main();
} catch (error) {
  exitCode = 1;
  console.error("");
  console.error("CHECKPOINT FAILED");
  console.error(error);
} finally {
  try {
    await cleanup();

    const [remainingAccounts, remainingPeriods, remainingYears, remainingJournals, remainingSequence] =
      await Promise.all([
        prisma.account.count({
          where: {
            tenantId: TENANT_ID,
            id: {
              in: [
                fixture.debitAccountId,
                fixture.creditAccountId,
                fixture.restrictedAccountId,
              ],
            },
          },
        }),
        prisma.fiscalPeriod.count({
          where: { tenantId: TENANT_ID, id: fixture.fiscalPeriodId },
        }),
        prisma.fiscalYear.count({
          where: { tenantId: TENANT_ID, id: fixture.fiscalYearId },
        }),
        prisma.journalEntry.count({
          where: {
            tenantId: TENANT_ID,
            journalDate: {
              gte: new Date(`${TEST_YEAR}-01-01T00:00:00.000Z`),
              lte: new Date(`${TEST_YEAR}-12-31T00:00:00.000Z`),
            },
            sourceType: {
              in: ["GL_TEST", "GL_TEST_IDEMPOTENCY", "GL_TEST_SYSTEM"],
            },
          },
        }),
        getSequenceState(),
      ]);

    const cleanupOk =
      remainingAccounts === 0 &&
      remainingPeriods === 0 &&
      remainingYears === 0 &&
      remainingJournals === 0 &&
      remainingSequence === null;

    console.log("");
    console.log("Cleanup verification");
    console.log(`Remaining fixture accounts: ${remainingAccounts}`);
    console.log(`Remaining fixture periods: ${remainingPeriods}`);
    console.log(`Remaining fixture years: ${remainingYears}`);
    console.log(`Remaining fixture journals: ${remainingJournals}`);
    console.log(`Remaining test-year sequence: ${remainingSequence ? "YES" : "NO"}`);

    if (!cleanupOk) {
      exitCode = 1;
      console.error("CLEANUP FAILED");
    } else {
      console.log("Cleanup: PASS");
    }
  } catch (cleanupError) {
    exitCode = 1;
    console.error("CLEANUP ERROR");
    console.error(cleanupError);
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = exitCode;
