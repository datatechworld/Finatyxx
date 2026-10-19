import { prisma } from "./src/db/prisma.js";
import { AccountType } from "./src/generated/prisma/enums.js";
import {
  createAccount,
  deleteUnusedAccount,
  updateAccount,
} from "./src/modules/accounting/chart-of-accounts.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const PREFIX = "COA15O8C";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function cleanup(): Promise<void> {
  // Break only test-created parent links first so cleanup cannot be blocked
  // if a defect ever allowed a cycle to persist.
  await prisma.account.updateMany({
    where: {
      tenantId: TENANT_ID,
      code: { startsWith: PREFIX },
    },
    data: { parentId: null },
  });

  await prisma.account.deleteMany({
    where: {
      tenantId: TENANT_ID,
      code: { startsWith: PREFIX },
    },
  });
}

async function main(): Promise<void> {
  console.log("Finatyx — Checkpoint 15O.8C Concurrent Hierarchy Race Verification");
  console.log("===================================================================");

  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { legalName: true },
  });
  check(tenant, "Established Finatyx test tenant was not found.");

  const baseline = await prisma.account.count({
    where: { tenantId: TENANT_ID },
  });

  console.log(`Tenant: ${tenant.legalName}`);
  console.log(`Baseline accounts: ${baseline}`);

  check(
    baseline === 0,
    `Safety stop: expected baseline 0 accounts, found ${baseline}.`
  );

  await cleanup();

  let accountAId: string | null = null;
  let accountBId: string | null = null;

  try {
    const [accountA, accountB] = await Promise.all([
      createAccount({
        tenantId: TENANT_ID,
        code: `${PREFIX}-A`,
        name: "Concurrent Race Account A",
        type: AccountType.ASSET,
      }),
      createAccount({
        tenantId: TENANT_ID,
        code: `${PREFIX}-B`,
        name: "Concurrent Race Account B",
        type: AccountType.ASSET,
      }),
    ]);

    accountAId = accountA.id;
    accountBId = accountB.id;

    console.log("PASS  Created two independent root accounts.");

    // Release both hierarchy updates at the same logical instant.
    // Each standalone updateAccount() executes through the production
    // Serializable transaction/retry wrapper.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const operationA = (async () => {
      await gate;
      return updateAccount(TENANT_ID, accountA.id, {
        parentId: accountB.id,
      });
    })();

    const operationB = (async () => {
      await gate;
      return updateAccount(TENANT_ID, accountB.id, {
        parentId: accountA.id,
      });
    })();

    release();

    const [resultA, resultB] = await Promise.allSettled([
      operationA,
      operationB,
    ]);

    const fulfilled = [resultA, resultB].filter(
      (result) => result.status === "fulfilled"
    ).length;
    const rejected = [resultA, resultB].filter(
      (result) => result.status === "rejected"
    ).length;

    console.log(`Concurrent updates fulfilled: ${fulfilled}`);
    console.log(`Concurrent updates rejected:  ${rejected}`);

    if (resultA.status === "rejected") {
      console.log(`Update A rejection: ${errorText(resultA.reason)}`);
    }
    if (resultB.status === "rejected") {
      console.log(`Update B rejection: ${errorText(resultB.reason)}`);
    }

    // The critical invariant: the two conflicting updates must never both
    // commit. One may succeed, but the other must be rejected after the
    // Serializable conflict/retry path re-evaluates the hierarchy.
    check(
      fulfilled !== 2,
      "CRITICAL: both conflicting hierarchy updates committed."
    );
    check(
      rejected >= 1,
      "Expected at least one conflicting hierarchy update to be rejected."
    );

    const persisted = await prisma.account.findMany({
      where: {
        tenantId: TENANT_ID,
        id: { in: [accountA.id, accountB.id] },
      },
      select: {
        id: true,
        code: true,
        parentId: true,
      },
      orderBy: { code: "asc" },
    });

    check(persisted.length === 2, "Expected both test accounts to remain.");

    const persistedA = persisted.find((account) => account.id === accountA.id);
    const persistedB = persisted.find((account) => account.id === accountB.id);

    check(persistedA, "Account A was not found after the race.");
    check(persistedB, "Account B was not found after the race.");

    const cycleExists =
      persistedA.parentId === accountB.id &&
      persistedB.parentId === accountA.id;

    console.log(`Persisted A parent: ${persistedA.parentId ?? "NULL"}`);
    console.log(`Persisted B parent: ${persistedB.parentId ?? "NULL"}`);

    check(
      !cycleExists,
      "CRITICAL: a two-account hierarchy cycle exists after concurrent updates."
    );

    console.log(
      "PASS  Concurrent conflicting updates did not produce a hierarchy cycle."
    );

    // Also verify the surviving hierarchy remains understandable to the
    // ordinary service after the race.
    const aPointsToB = persistedA.parentId === accountB.id;
    const bPointsToA = persistedB.parentId === accountA.id;

    check(
      !(aPointsToB && bPointsToA),
      "Hierarchy invariant failed after persistence verification."
    );

    console.log("PASS  Persisted hierarchy invariant verified.");
  } finally {
    // Use direct cleanup deliberately. If the race exposed a cycle bug,
    // cleanup first nulls only COA15O8C parent links and then deletes only
    // COA15O8C records.
    await cleanup();

    const finalCount = await prisma.account.count({
      where: { tenantId: TENANT_ID },
    });

    const remainingTestAccounts = await prisma.account.count({
      where: {
        tenantId: TENANT_ID,
        code: { startsWith: PREFIX },
      },
    });

    console.log("-------------------------------------------------------------------");
    console.log(`Final account count: ${finalCount}`);
    console.log(`Remaining ${PREFIX} accounts: ${remainingTestAccounts}`);

    check(
      remainingTestAccounts === 0,
      "Cleanup invariant failed: test accounts remain."
    );
    check(
      finalCount === baseline,
      `Cleanup invariant failed: baseline ${baseline}, final ${finalCount}.`
    );

    console.log("PASS  Cleanup invariant — tenant restored to baseline.");
  }

  console.log("RESULT: Checkpoint 15O.8C PASSED.");
}

main()
  .catch((error) => {
    console.error("FAILED:", errorText(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
