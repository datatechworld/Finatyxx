import { prisma } from "./src/db/prisma.js";
import {
  AccountType,
  NormalBalance,
} from "./src/generated/prisma/enums.js";
import {
  ChartOfAccountsError,
  createAccount,
  updateAccount,
} from "./src/modules/accounting/chart-of-accounts.service.js";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const PREFIX = "COA15O9";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function expectChartOfAccountsRejection(
  label: string,
  operation: () => Promise<unknown>,
  expectedMessageFragment: string
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    check(
      error instanceof ChartOfAccountsError,
      `${label}: expected ChartOfAccountsError, received ${errorText(error)}`
    );
    check(
      error.message.includes(expectedMessageFragment),
      `${label}: unexpected message: ${error.message}`
    );
    console.log(`PASS  ${label}`);
    return;
  }

  throw new Error(`${label}: operation unexpectedly succeeded.`);
}

async function cleanup(): Promise<void> {
  const testAccounts = await prisma.account.findMany({
    where: {
      tenantId: TENANT_ID,
      code: { startsWith: PREFIX },
    },
    select: { id: true },
  });

  const accountIds = testAccounts.map((account) => account.id);

  if (accountIds.length > 0) {
    const journalIds = await prisma.journalLine.findMany({
      where: {
        tenantId: TENANT_ID,
        accountId: { in: accountIds },
      },
      select: { journalEntryId: true },
      distinct: ["journalEntryId"],
    });

    const entryIds = journalIds.map((row) => row.journalEntryId);

    await prisma.journalLine.deleteMany({
      where: {
        tenantId: TENANT_ID,
        journalEntryId: { in: entryIds },
      },
    });

    await prisma.journalEntry.deleteMany({
      where: {
        tenantId: TENANT_ID,
        id: { in: entryIds },
      },
    });

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

  await prisma.journalEntry.deleteMany({
    where: {
      tenantId: TENANT_ID,
      journalNumber: { startsWith: PREFIX },
    },
  });
}

async function main(): Promise<void> {
  console.log("Finatyx — Checkpoint 15O.9 Posted-Account Semantic Integrity");
  console.log("================================================================");

  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: {
      legalName: true,
      baseCurrencyCode: true,
      memberships: {
        take: 1,
        select: { userId: true },
      },
    },
  });

  check(tenant, "Established Finatyx test tenant was not found.");
  check(
    tenant.memberships.length > 0,
    "The test tenant has no membership available for journal createdById."
  );

  const actorId = tenant.memberships[0]!.userId;
  const baselineAccountCount = await prisma.account.count({
    where: { tenantId: TENANT_ID },
  });

  console.log(`Tenant: ${tenant.legalName}`);
  console.log(`Baseline accounts: ${baselineAccountCount}`);

  check(
    baselineAccountCount === 0,
    `Safety stop: expected baseline 0 accounts, found ${baselineAccountCount}.`
  );

  await cleanup();

  let semanticAccountId: string | null = null;
  let balancingAccountId: string | null = null;
  let journalEntryId: string | null = null;

  try {
    const semanticAccount = await createAccount({
      tenantId: TENANT_ID,
      code: `${PREFIX}-1000`,
      name: "Semantic Integrity Test Account",
      type: AccountType.ASSET,
    });
    semanticAccountId = semanticAccount.id;

    const balancingAccount = await createAccount({
      tenantId: TENANT_ID,
      code: `${PREFIX}-2000`,
      name: "Semantic Integrity Balancing Account",
      type: AccountType.EQUITY,
    });
    balancingAccountId = balancingAccount.id;

    console.log("PASS  Created isolated semantic-integrity test accounts.");

    const unusedChanged = await updateAccount(
      TENANT_ID,
      semanticAccount.id,
      {
        type: AccountType.EXPENSE,
        normalBalance: NormalBalance.CREDIT,
      }
    );

    check(
      unusedChanged.type === AccountType.EXPENSE &&
        unusedChanged.normalBalance === NormalBalance.CREDIT,
      "Unused account semantic change did not persist correctly."
    );
    console.log("PASS  Unused account may change type and normal balance.");

    const unusedRestored = await updateAccount(
      TENANT_ID,
      semanticAccount.id,
      {
        type: AccountType.ASSET,
        normalBalance: NormalBalance.DEBIT,
      }
    );

    check(
      unusedRestored.type === AccountType.ASSET &&
        unusedRestored.normalBalance === NormalBalance.DEBIT,
      "Unused account could not be restored before journal-history test."
    );
    console.log("PASS  Unused account semantics restored for journal test.");

    const journalNumber = `${PREFIX}-${Date.now()}`;

    const journal = await prisma.journalEntry.create({
      data: {
        tenantId: TENANT_ID,
        journalNumber,
        journalDate: new Date(),
        description: "15O.9 semantic-integrity fixture",
        sourceType: "COA_15O9_TEST",
        currencyCode: tenant.baseCurrencyCode,
        createdById: actorId,
      },
      select: { id: true },
    });
    journalEntryId = journal.id;

    await prisma.journalLine.createMany({
      data: [
        {
          tenantId: TENANT_ID,
          journalEntryId: journal.id,
          accountId: semanticAccount.id,
          description: "Semantic account test line",
          debit: "100.0000",
          credit: "0.0000",
        },
        {
          tenantId: TENANT_ID,
          journalEntryId: journal.id,
          accountId: balancingAccount.id,
          description: "Balancing test line",
          debit: "0.0000",
          credit: "100.0000",
        },
      ],
    });

    const historyBefore = await prisma.journalLine.findMany({
      where: {
        tenantId: TENANT_ID,
        journalEntryId: journal.id,
      },
      select: {
        id: true,
        accountId: true,
        debit: true,
        credit: true,
      },
      orderBy: { id: "asc" },
    });

    check(historyBefore.length === 2, "Expected two journal-history lines.");
    console.log("PASS  Created balanced journal history for semantic test.");

    await expectChartOfAccountsRejection(
      "Type change blocked after journal history",
      () =>
        updateAccount(TENANT_ID, semanticAccount.id, {
          type: AccountType.EXPENSE,
        }),
      "account type cannot be changed because the account has journal history"
    );

    await expectChartOfAccountsRejection(
      "Normal-balance change blocked after journal history",
      () =>
        updateAccount(TENANT_ID, semanticAccount.id, {
          normalBalance: NormalBalance.CREDIT,
        }),
      "account normal balance cannot be changed because the account has journal history"
    );

    await expectChartOfAccountsRejection(
      "Combined semantic change blocked after journal history",
      () =>
        updateAccount(TENANT_ID, semanticAccount.id, {
          type: AccountType.EXPENSE,
          normalBalance: NormalBalance.CREDIT,
        }),
      "account type and normal balance cannot be changed because the account has journal history"
    );

    const renamed = await updateAccount(
      TENANT_ID,
      semanticAccount.id,
      {
        code: `${PREFIX}-1001`,
        name: "Renamed Historical Account",
      }
    );

    check(
      renamed.code === `${PREFIX}-1001` &&
        renamed.name === "Renamed Historical Account",
      "Code/name update after journal history did not persist."
    );
    console.log("PASS  Code and name remain editable after journal history.");

    const controlChanged = await updateAccount(
      TENANT_ID,
      semanticAccount.id,
      {
        isControlAccount: true,
      }
    );

    check(
      controlChanged.isControlAccount === true,
      "Control-account configuration did not update."
    );
    console.log("PASS  Control-account configuration remains manageable.");

    const manualPostingChanged = await updateAccount(
      TENANT_ID,
      semanticAccount.id,
      {
        allowManualPosting: false,
      }
    );

    check(
      manualPostingChanged.allowManualPosting === false,
      "Manual-posting configuration did not update."
    );
    console.log("PASS  Manual-posting configuration remains manageable.");

    const persistedAccount = await prisma.account.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: semanticAccount.id,
      },
      select: {
        type: true,
        normalBalance: true,
      },
    });

    check(persistedAccount, "Semantic test account disappeared unexpectedly.");
    check(
      persistedAccount.type === AccountType.ASSET,
      "Protected account type changed despite journal history."
    );
    check(
      persistedAccount.normalBalance === NormalBalance.DEBIT,
      "Protected normal balance changed despite journal history."
    );

    const historyAfter = await prisma.journalLine.findMany({
      where: {
        tenantId: TENANT_ID,
        journalEntryId: journal.id,
      },
      select: {
        id: true,
        accountId: true,
        debit: true,
        credit: true,
      },
      orderBy: { id: "asc" },
    });

    check(
      historyAfter.length === historyBefore.length,
      "Journal history line count changed during account updates."
    );

    for (let index = 0; index < historyBefore.length; index += 1) {
      const before = historyBefore[index]!;
      const after = historyAfter[index]!;

      check(before.id === after.id, "Journal history identity changed.");
      check(
        before.accountId === after.accountId,
        "Journal history account reference changed."
      );
      check(
        before.debit.toString() === after.debit.toString(),
        "Historical debit amount changed."
      );
      check(
        before.credit.toString() === after.credit.toString(),
        "Historical credit amount changed."
      );
    }

    console.log("PASS  Existing journal history remained untouched.");
  } finally {
    await cleanup();

    const finalAccountCount = await prisma.account.count({
      where: { tenantId: TENANT_ID },
    });

    const remainingTestAccounts = await prisma.account.count({
      where: {
        tenantId: TENANT_ID,
        code: { startsWith: PREFIX },
      },
    });

    const remainingTestJournals = await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        journalNumber: { startsWith: PREFIX },
      },
    });

    console.log("----------------------------------------------------------------");
    console.log(`Final account count: ${finalAccountCount}`);
    console.log(`Remaining ${PREFIX} accounts: ${remainingTestAccounts}`);
    console.log(`Remaining ${PREFIX} journals: ${remainingTestJournals}`);

    check(
      remainingTestAccounts === 0,
      "Cleanup invariant failed: semantic test accounts remain."
    );
    check(
      remainingTestJournals === 0,
      "Cleanup invariant failed: semantic test journals remain."
    );
    check(
      finalAccountCount === baselineAccountCount,
      `Cleanup invariant failed: baseline ${baselineAccountCount}, final ${finalAccountCount}.`
    );

    console.log("PASS  Cleanup invariant — tenant restored to baseline.");
  }

  console.log("RESULT: Checkpoint 15O.9 PASSED.");
}

main()
  .catch((error) => {
    console.error("FAILED:", errorText(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
