import { prisma } from "./src/db/prisma.js";
import {
  AccountType,
  NormalBalance,
  RecordStatus,
  SystemAccountPurpose,
} from "./src/generated/prisma/enums.js";
import {
  ChartOfAccountsError,
  archiveAccount,
  createAccount,
  createAccountInTransaction,
  deactivateAccount,
  deleteUnusedAccount,
  reactivateAccount,
  updateAccount,
} from "./src/modules/accounting/chart-of-accounts.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const PREFIX = "COA15O8B";

let passed = 0;

function ok(name: string): void {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectCoaError(
  name: string,
  operation: () => Promise<unknown>,
  expectedText: string
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    check(error instanceof ChartOfAccountsError, `${name}: wrong error type.`);
    check(
      error.message.toLowerCase().includes(expectedText.toLowerCase()),
      `${name}: unexpected message: ${error.message}`
    );
    ok(name);
    return;
  }

  throw new Error(`${name}: operation unexpectedly succeeded.`);
}

async function cleanup(): Promise<void> {
  await prisma.systemAccountMapping.deleteMany({
    where: {
      tenantId: TENANT_ID,
      account: { code: { startsWith: PREFIX } },
    },
  });

  for (let i = 0; i < 10; i += 1) {
    const accounts = await prisma.account.findMany({
      where: { tenantId: TENANT_ID, code: { startsWith: PREFIX } },
      select: { id: true },
    });

    if (accounts.length === 0) return;

    const children = await prisma.account.findMany({
      where: {
        tenantId: TENANT_ID,
        code: { startsWith: PREFIX },
        parentId: { not: null },
      },
      select: { parentId: true },
    });

    const parentIds = new Set(
      children.map((x) => x.parentId).filter((x): x is string => x !== null)
    );
    const leaves = accounts.filter((x) => !parentIds.has(x.id));

    if (leaves.length === 0) break;

    await prisma.account.deleteMany({
      where: { id: { in: leaves.map((x) => x.id) } },
    });
  }

  const remaining = await prisma.account.count({
    where: { tenantId: TENANT_ID, code: { startsWith: PREFIX } },
  });
  check(remaining === 0, `Cleanup failed; ${remaining} test accounts remain.`);
}

async function main(): Promise<void> {
  console.log("Finatyx — Checkpoint 15O.8B Behavioral Verification");
  console.log("====================================================");

  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { legalName: true },
  });
  check(tenant, "Established test tenant not found.");

  const baseline = await prisma.account.count({ where: { tenantId: TENANT_ID } });
  console.log(`Tenant: ${tenant.legalName}`);
  console.log(`Baseline accounts: ${baseline}`);
  check(baseline === 0, `Safety stop: expected baseline 0, found ${baseline}.`);

  await cleanup();

  try {
    const asset = await createAccount({
      tenantId: TENANT_ID,
      code: `${PREFIX}-1000`,
      name: "Test Asset",
      type: AccountType.ASSET,
    });
    check(asset.normalBalance === NormalBalance.DEBIT, "ASSET default is not DEBIT.");
    ok("Conventional normal-balance default");

    const contra = await createAccount({
      tenantId: TENANT_ID,
      code: `${PREFIX}-1100`,
      name: "Test Contra Asset",
      type: AccountType.ASSET,
      normalBalance: NormalBalance.CREDIT,
    });
    check(contra.normalBalance === NormalBalance.CREDIT, "Contra override lost.");
    ok("Contra normal-balance override");

    const child = await createAccount({
      tenantId: TENANT_ID,
      code: `${PREFIX}-1200`,
      name: "Test Child",
      type: AccountType.ASSET,
      parentId: asset.id,
    });
    check(child.parentId === asset.id, "Parent hierarchy not persisted.");
    ok("Parent hierarchy");

    await expectCoaError(
      "Duplicate code protection",
      () => createAccount({
        tenantId: TENANT_ID,
        code: `${PREFIX}-1000`,
        name: "Duplicate",
        type: AccountType.ASSET,
      }),
      "already in use"
    );

    await expectCoaError(
      "Direct self-parent protection",
      () => updateAccount(TENANT_ID, asset.id, { parentId: asset.id }),
      "own parent"
    );

    const grandchild = await createAccount({
      tenantId: TENANT_ID,
      code: `${PREFIX}-1300`,
      name: "Test Grandchild",
      type: AccountType.ASSET,
      parentId: child.id,
    });

    await expectCoaError(
      "Multi-level cycle protection",
      () => updateAccount(TENANT_ID, asset.id, { parentId: grandchild.id }),
      "cycle"
    );

    const changedContra = await updateAccount(TENANT_ID, contra.id, {
      type: AccountType.EXPENSE,
    });
    check(
      changedContra.normalBalance === NormalBalance.CREDIT,
      "Type change silently changed contra balance."
    );
    ok("Type update preserves contra balance");

    check(
      (await deactivateAccount(TENANT_ID, contra.id)).status === RecordStatus.INACTIVE,
      "Deactivate failed."
    );
    check(
      (await reactivateAccount(TENANT_ID, contra.id)).status === RecordStatus.ACTIVE,
      "Reactivate failed."
    );
    check(
      (await archiveAccount(TENANT_ID, contra.id)).status === RecordStatus.ARCHIVED,
      "Archive failed."
    );
    ok("Lifecycle deactivate/reactivate/archive");

    const disposable = await createAccount({
      tenantId: TENANT_ID,
      code: `${PREFIX}-1400`,
      name: "Disposable",
      type: AccountType.EXPENSE,
    });
    await deleteUnusedAccount(TENANT_ID, disposable.id);
    check(
      (await prisma.account.count({ where: { id: disposable.id } })) === 0,
      "Unused account was not deleted."
    );
    ok("Unused-account deletion");

    await expectCoaError(
      "Child deletion protection",
      () => deleteUnusedAccount(TENANT_ID, asset.id),
      "child accounts"
    );

    const mapped = await createAccount({
      tenantId: TENANT_ID,
      code: `${PREFIX}-1500`,
      name: "Mapped Account",
      type: AccountType.ASSET,
    });

    await prisma.systemAccountMapping.create({
      data: {
        tenantId: TENANT_ID,
        purpose: SystemAccountPurpose.CASH,
        accountId: mapped.id,
      },
    });

    await expectCoaError(
      "System mapping deletion protection",
      () => deleteUnusedAccount(TENANT_ID, mapped.id),
      "system account purpose"
    );

    await prisma.systemAccountMapping.delete({
      where: {
        tenantId_purpose: {
          tenantId: TENANT_ID,
          purpose: SystemAccountPurpose.CASH,
        },
      },
    });

    const rollbackCode = `${PREFIX}-1600`;
    try {
      await prisma.$transaction(async (tx) => {
        await createAccountInTransaction(tx, {
          tenantId: TENANT_ID,
          code: rollbackCode,
          name: "Rollback Test",
          type: AccountType.EXPENSE,
        });
        throw new Error("INTENTIONAL_ROLLBACK");
      });
    } catch (error) {
      check(
        error instanceof Error && error.message === "INTENTIONAL_ROLLBACK",
        "Unexpected rollback error."
      );
    }

    check(
      (await prisma.account.count({
        where: { tenantId: TENANT_ID, code: rollbackCode },
      })) === 0,
      "Transaction-aware create did not roll back."
    );
    ok("Transaction rollback");

    // Cross-tenant fixture exists only inside this deliberately rolled-back transaction.
    const sentinel = "CROSS_TENANT_ROLLBACK";
    try {
      await prisma.$transaction(async (tx) => {
        const tempTenant = await tx.tenant.create({
          data: {
            legalName: "Temporary CoA Isolation Test",
            tradingName: "Temporary CoA Isolation Test",
            slug: `coa-isolation-${Date.now()}`,
            countryCode: "GH",
            baseCurrencyCode: "GHS",
          },
          select: { id: true },
        });

        const foreignParent = await createAccountInTransaction(tx, {
          tenantId: tempTenant.id,
          code: `${PREFIX}-FOREIGN`,
          name: "Foreign Parent",
          type: AccountType.ASSET,
        });

        await expectCoaError(
          "Cross-tenant parent protection",
          () => createAccountInTransaction(tx, {
            tenantId: TENANT_ID,
            code: `${PREFIX}-1700`,
            name: "Cross Tenant Attempt",
            type: AccountType.ASSET,
            parentId: foreignParent.id,
          }),
          "does not exist for this Finatyx business"
        );

        throw new Error(sentinel);
      });
    } catch (error) {
      if (!(error instanceof Error && error.message === sentinel)) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Unexpected cross-tenant rollback error: ${detail}`);
      }
    }
    ok("Temporary cross-tenant fixture rolled back");
  } finally {
    await cleanup();
  }

  const finalCount = await prisma.account.count({ where: { tenantId: TENANT_ID } });
  console.log("----------------------------------------------------");
  console.log(`Final account count: ${finalCount}`);
  check(finalCount === 0, `Cleanup invariant failed: ${finalCount} accounts remain.`);
  ok("Cleanup invariant — restored to zero accounts");
  console.log(`RESULT: ${passed} checks passed.`);
}

main()
  .catch((error) => {
    console.error("FAILED:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
