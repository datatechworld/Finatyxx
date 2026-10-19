import { randomUUID } from "node:crypto";
import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  GeneralLedgerPostingError,
  postJournal,
} from "./src/modules/accounting/general-ledger-posting.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const ACTOR_ID = "1668f4f4-48fd-44d2-9ffe-293812ee55e9";
const TEST_YEAR = 2099;
const TEST_DATE = new Date("2099-06-15T12:00:00.000Z");

const fiscalYearId = randomUUID();
const fiscalPeriodId = randomUUID();
const debitAccountId = randomUUID();
const creditAccountId = randomUUID();
const sourceId = randomUUID();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("Checkpoint 15P.6 — Concurrent Source Idempotency Verification");
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Test year: ${TEST_YEAR}`);

  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { id: true, status: true, baseCurrencyCode: true },
  });

  assert(tenant, "Test tenant does not exist.");
  assert(
    tenant.status === "TRIAL" || tenant.status === "ACTIVE",
    `Test tenant is not operational: ${tenant.status}`,
  );

  const currency = await prisma.currency.findUnique({
    where: { code: tenant.baseCurrencyCode },
    select: { code: true, active: true },
  });
  assert(currency?.active, `Base currency ${tenant.baseCurrencyCode} is not active.`);

  const overlap = await prisma.fiscalYear.findFirst({
    where: {
      tenantId: TENANT_ID,
      startDate: { lte: new Date(`${TEST_YEAR}-12-31T00:00:00.000Z`) },
      endDate: { gte: new Date(`${TEST_YEAR}-01-01T00:00:00.000Z`) },
    },
    select: { id: true },
  });
  assert(!overlap, `A fiscal year already overlaps ${TEST_YEAR}.`);

  const existingSequence = await prisma.documentSequence.findFirst({
    where: {
      tenantId: TENANT_ID,
      branchId: null,
      documentType: "JOURNAL",
      year: TEST_YEAR,
    },
    select: { id: true },
  });
  assert(!existingSequence, `A JOURNAL sequence already exists for ${TEST_YEAR}.`);

  await prisma.fiscalYear.create({
    data: {
      id: fiscalYearId,
      tenantId: TENANT_ID,
      name: `GL-CONCURRENCY-${TEST_YEAR}-${fiscalYearId.slice(0, 8)}`,
      startDate: new Date(`${TEST_YEAR}-01-01T00:00:00.000Z`),
      endDate: new Date(`${TEST_YEAR}-12-31T00:00:00.000Z`),
      status: "OPEN",
      periods: {
        create: {
          id: fiscalPeriodId,
          periodNumber: 6,
          name: `GL Concurrency Period ${TEST_YEAR}`,
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
        id: debitAccountId,
        tenantId: TENANT_ID,
        code: `GLC-${TEST_YEAR}-D-${debitAccountId.slice(0, 6)}`,
        name: "GL Concurrency Debit",
        type: "ASSET",
        normalBalance: "DEBIT",
        status: "ACTIVE",
        allowManualPosting: true,
      },
      {
        id: creditAccountId,
        tenantId: TENANT_ID,
        code: `GLC-${TEST_YEAR}-C-${creditAccountId.slice(0, 6)}`,
        name: "GL Concurrency Credit",
        type: "LIABILITY",
        normalBalance: "CREDIT",
        status: "ACTIVE",
        allowManualPosting: true,
      },
    ],
  });

  const input = {
    tenantId: TENANT_ID,
    journalDate: TEST_DATE,
    description: "Finatyx GL concurrent source idempotency verification",
    sourceType: "GL_TEST_CONCURRENT",
    sourceId,
    currencyCode: tenant.baseCurrencyCode,
    exchangeRate: new Prisma.Decimal("1"),
    createdById: ACTOR_ID,
    lines: [
      {
        accountId: debitAccountId,
        debit: new Prisma.Decimal("25"),
        credit: new Prisma.Decimal("0"),
      },
      {
        accountId: creditAccountId,
        debit: new Prisma.Decimal("0"),
        credit: new Prisma.Decimal("25"),
      },
    ],
  };

  const results = await Promise.allSettled([
    postJournal(input, "MANUAL"),
    postJournal(input, "MANUAL"),
  ]);

  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof postJournal>>> =>
      result.status === "fulfilled",
  );
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  console.log(`Concurrent attempts: ${results.length}`);
  console.log(`Fulfilled: ${fulfilled.length}`);
  console.log(`Rejected: ${rejected.length}`);

  assert(fulfilled.length === 1, `Expected exactly 1 successful posting; got ${fulfilled.length}.`);
  assert(rejected.length === 1, `Expected exactly 1 rejected posting; got ${rejected.length}.`);

  const rejection = rejected[0]!.reason;
  assert(
    rejection instanceof GeneralLedgerPostingError &&
      rejection.code === "DUPLICATE_SOURCE",
    `Expected DUPLICATE_SOURCE; got ${
      rejection instanceof GeneralLedgerPostingError
        ? rejection.code
        : rejection instanceof Error
          ? `${rejection.name}: ${rejection.message}`
          : String(rejection)
    }.`,
  );

  const persisted = await prisma.journalEntry.findMany({
    where: {
      tenantId: TENANT_ID,
      sourceType: "GL_TEST_CONCURRENT",
      sourceId,
    },
    select: {
      id: true,
      journalNumber: true,
      status: true,
      lines: {
        select: { debit: true, credit: true },
      },
    },
  });

  assert(persisted.length === 1, `Expected exactly 1 persisted journal; got ${persisted.length}.`);
  assert(persisted[0]!.status === "POSTED", "Persisted journal is not POSTED.");

  const debitTotal = persisted[0]!.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    new Prisma.Decimal(0),
  );
  const creditTotal = persisted[0]!.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    new Prisma.Decimal(0),
  );
  assert(debitTotal.equals(creditTotal), "Persisted concurrent journal is not balanced.");

  const sequence = await prisma.documentSequence.findFirst({
    where: {
      tenantId: TENANT_ID,
      branchId: null,
      documentType: "JOURNAL",
      year: TEST_YEAR,
    },
    select: { nextNumber: true },
  });

  assert(sequence, "Expected JOURNAL sequence after successful concurrent posting.");
  assert(
    sequence.nextNumber === 2n,
    `Expected nextNumber=2 after exactly one committed allocation; got ${sequence.nextNumber}.`,
  );

  console.log(`Persisted journal: ${persisted[0]!.journalNumber}`);
  console.log("PASS: exactly one concurrent source posting committed");
  console.log("PASS: competing attempt returned DUPLICATE_SOURCE");
  console.log("PASS: exactly one source journal exists");
  console.log("PASS: competing transaction consumed no journal number");
  console.log("15P.6 concurrency verification: PASS");
}

async function cleanup() {
  await prisma.$transaction(async (tx) => {
    const journals = await tx.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "GL_TEST_CONCURRENT",
        sourceId,
      },
      select: { id: true },
    });

    const journalIds = journals.map((journal) => journal.id);

    if (journalIds.length > 0) {
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
        id: { in: [debitAccountId, creditAccountId] },
      },
    });

    await tx.fiscalPeriod.deleteMany({
      where: { tenantId: TENANT_ID, id: fiscalPeriodId },
    });
    await tx.fiscalYear.deleteMany({
      where: { tenantId: TENANT_ID, id: fiscalYearId },
    });
  });

  const [accounts, periods, years, journals, sequence] = await Promise.all([
    prisma.account.count({
      where: { tenantId: TENANT_ID, id: { in: [debitAccountId, creditAccountId] } },
    }),
    prisma.fiscalPeriod.count({
      where: { tenantId: TENANT_ID, id: fiscalPeriodId },
    }),
    prisma.fiscalYear.count({
      where: { tenantId: TENANT_ID, id: fiscalYearId },
    }),
    prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "GL_TEST_CONCURRENT",
        sourceId,
      },
    }),
    prisma.documentSequence.findFirst({
      where: {
        tenantId: TENANT_ID,
        branchId: null,
        documentType: "JOURNAL",
        year: TEST_YEAR,
      },
      select: { id: true },
    }),
  ]);

  console.log("");
  console.log("Cleanup verification");
  console.log(`Remaining fixture accounts: ${accounts}`);
  console.log(`Remaining fixture periods: ${periods}`);
  console.log(`Remaining fixture years: ${years}`);
  console.log(`Remaining fixture journals: ${journals}`);
  console.log(`Remaining test-year sequence: ${sequence ? "YES" : "NO"}`);

  const clean =
    accounts === 0 &&
    periods === 0 &&
    years === 0 &&
    journals === 0 &&
    !sequence;

  console.log(`Cleanup: ${clean ? "PASS" : "FAIL"}`);
  if (!clean) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error("");
  console.error("CHECKPOINT FAILED");
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error("");
    console.error("CLEANUP FAILED");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
