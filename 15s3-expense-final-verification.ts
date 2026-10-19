import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  ExpensePostingError,
  postExpense,
} from "./src/modules/expenses/expense-posting.service.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const POSTED_BY_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const BANK_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

const OPERATING_EXPENSE_PARENT_ID =
  "49c43550-79d8-405f-b821-d8df968dcc3d";

const INPUT_TAX_ACCOUNT_ID =
  "06c52999-9a50-4ea6-8e55-d616e0815d29";

const BANK_LEDGER_ACCOUNT_ID =
  "9a5deeb7-0392-41f9-9143-e480a9238658";

const SUBTOTAL = new Prisma.Decimal("1000");
const TAX = new Prisma.Decimal("150");
const TOTAL = new Prisma.Decimal("1150");

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("=== 15S.3 PRE-FLIGHT ===");

  const tenant = await prisma.tenant.findUnique({
    where: {
      id: TENANT_ID,
    },
  });

  assert(tenant, "Test tenant not found.");

  const branch = await prisma.branch.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: BRANCH_ID,
      },
    },
  });

  assert(branch, "HO branch not found.");
  assert(
    branch.status === "ACTIVE",
    "HO branch is not ACTIVE.",
  );

  const parent =
    await prisma.account.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: OPERATING_EXPENSE_PARENT_ID,
        },
      },
    });

  assert(
    parent,
    "6000 Operating Expenses account missing.",
  );

  assert(
    parent.code === "6000" &&
      parent.type === "EXPENSE",
    "Operating Expenses parent is not the expected account.",
  );

  const bank =
    await prisma.financialAccount.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BANK_ID,
        },
      },
      include: {
        ledgerAccount: true,
      },
    });

  assert(bank, "Test Financial Account missing.");

  assert(
    bank.status === "ACTIVE",
    "Test Financial Account is not ACTIVE.",
  );

  assert(
    bank.branchId === BRANCH_ID,
    "Test Financial Account branch mismatch.",
  );

  assert(
    bank.currencyCode === "GHS",
    "Test Financial Account is not GHS.",
  );

  assert(
    bank.ledgerAccountId ===
      BANK_LEDGER_ACCOUNT_ID,
    "Unexpected Bank ledger account.",
  );

  const balanceCacheBefore =
    bank.currentBalanceCache.toString();

  const inputTaxMapping =
    await prisma.systemAccountMapping.findUnique({
      where: {
        tenantId_purpose: {
          tenantId: TENANT_ID,
          purpose: "INPUT_TAX",
        },
      },
      include: {
        account: true,
      },
    });

  assert(
    inputTaxMapping,
    "INPUT_TAX mapping missing.",
  );

  assert(
    inputTaxMapping.accountId ===
      INPUT_TAX_ACCOUNT_ID,
    "Unexpected INPUT_TAX account.",
  );

  console.log("Pre-flight dependencies: PASS");

  console.log("");
  console.log(
    "=== ENSURING 6200 GENERAL OPERATING EXPENSES ===",
  );

  let expenseAccount =
    await prisma.account.findFirst({
      where: {
        tenantId: TENANT_ID,
        code: "6200",
      },
    });

  if (!expenseAccount) {
    expenseAccount = await prisma.account.create({
      data: {
        tenantId: TENANT_ID,
        parentId: OPERATING_EXPENSE_PARENT_ID,
        code: "6200",
        name: "General Operating Expenses",
        type: "EXPENSE",
        normalBalance: "DEBIT",
        isControlAccount: false,
        allowManualPosting: true,
        status: "ACTIVE",
      },
    });

    console.log(
      "6200 account created:",
      expenseAccount.id,
    );
  } else {
    assert(
      expenseAccount.parentId ===
        OPERATING_EXPENSE_PARENT_ID,
      "Existing 6200 has wrong parent.",
    );

    assert(
      expenseAccount.name ===
        "General Operating Expenses",
      "Existing 6200 has unexpected name.",
    );

    assert(
      expenseAccount.type === "EXPENSE",
      "Existing 6200 is not EXPENSE.",
    );

    assert(
      expenseAccount.normalBalance === "DEBIT",
      "Existing 6200 is not DEBIT-normal.",
    );

    assert(
      expenseAccount.status === "ACTIVE",
      "Existing 6200 is not ACTIVE.",
    );

    assert(
      !expenseAccount.isControlAccount,
      "Existing 6200 is a control account.",
    );

    assert(
      expenseAccount.allowManualPosting,
      "Existing 6200 does not allow direct posting.",
    );

    console.log(
      "Existing valid 6200 account reused:",
      expenseAccount.id,
    );
  }

  const existingTestExpenses =
    await prisma.expense.findMany({
      where: {
        tenantId: TENANT_ID,
        expenseNumber: {
          startsWith: "EXP-15S3-",
        },
      },
      select: {
        id: true,
        expenseNumber: true,
        status: true,
      },
    });

  assert(
    existingTestExpenses.length === 0,
    "15S.3 fixture already exists. DO NOT RERUN.",
  );

  const expenseNumber =
    `EXP-15S3-${Date.now()}`;

  const expense =
    await prisma.expense.create({
      data: {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        expenseNumber,
        expenseDate:
          new Date("2098-06-27T00:00:00.000Z"),
        description:
          "15S.3 General operating expense verification",
        subtotal: SUBTOTAL,
        taxAmount: TAX,
        total: TOTAL,
        currencyCode: "GHS",
        exchangeRate: new Prisma.Decimal("1"),
        financialAccountId: BANK_ID,
        expenseAccountId: expenseAccount.id,
        status: "DRAFT",
        createdById: POSTED_BY_ID,
      },
    });

  console.log("");
  console.log("Expense fixture created:");
  console.log("ID:", expense.id);
  console.log(
    "Number:",
    expense.expenseNumber,
  );
  console.log("Status:", expense.status);

  const journalBefore =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "EXPENSE",
        sourceId: expense.id,
      },
    });

  assert(
    journalBefore === 0,
    "Expense unexpectedly has pre-existing journal.",
  );

  console.log("");
  console.log(
    "============================================================",
  );
  console.log(
    "EXECUTING PRODUCTION EXPENSE SERVICE EXACTLY ONCE",
  );
  console.log(
    "============================================================",
  );

  const result = await postExpense({
    tenantId: TENANT_ID,
    expenseId: expense.id,
    postedById: POSTED_BY_ID,
  });

  console.log("");
  console.log("Production service returned.");
  console.log(
    "Expense ID:",
    result.expense.id,
  );
  console.log(
    "Journal ID:",
    result.journal.id,
  );

  console.log("");
  console.log("=== POSTING VERIFICATION ===");

  const expenseAfter =
    await prisma.expense.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: expense.id,
        },
      },
    });

  assert(
    expenseAfter,
    "Expense missing after posting.",
  );

  assert(
    expenseAfter.status === "POSTED",
    `Expected POSTED; found ${expenseAfter.status}.`,
  );

  assert(
    expenseAfter.postedAt !== null,
    "Posted Expense has no postedAt.",
  );

  assert(
    expenseAfter.subtotal.equals(SUBTOTAL),
    "Expense subtotal changed.",
  );

  assert(
    expenseAfter.taxAmount.equals(TAX),
    "Expense tax changed.",
  );

  assert(
    expenseAfter.total.equals(TOTAL),
    "Expense total changed.",
  );

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "EXPENSE",
        sourceId: expense.id,
      },
      include: {
        lines: true,
      },
    });

  assert(
    journals.length === 1,
    `Expected exactly one journal; found ${journals.length}.`,
  );

  const journal = journals[0];

  assert(journal, "Journal missing.");

  assert(
    journal.status === "POSTED",
    `Expected journal POSTED; found ${journal.status}.`,
  );

  assert(
    journal.lines.length === 3,
    `Expected 3 journal lines; found ${journal.lines.length}.`,
  );

  const expenseLine = journal.lines.find(
    (line) =>
      line.accountId === expenseAccount.id,
  );

  const taxLine = journal.lines.find(
    (line) =>
      line.accountId === INPUT_TAX_ACCOUNT_ID,
  );

  const bankLine = journal.lines.find(
    (line) =>
      line.accountId ===
      BANK_LEDGER_ACCOUNT_ID,
  );

  assert(
    expenseLine,
    "6200 Expense journal line missing.",
  );

  assert(
    taxLine,
    "1400 Input Tax journal line missing.",
  );

  assert(
    bankLine,
    "1110 Bank journal line missing.",
  );

  assert(
    expenseLine.debit.equals(SUBTOTAL) &&
      expenseLine.credit.equals(0),
    "6200 posting is incorrect.",
  );

  assert(
    taxLine.debit.equals(TAX) &&
      taxLine.credit.equals(0),
    "1400 Input Tax posting is incorrect.",
  );

  assert(
    bankLine.debit.equals(0) &&
      bankLine.credit.equals(TOTAL),
    "1110 Bank posting is incorrect.",
  );

  const totalDebit = journal.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    new Prisma.Decimal("0"),
  );

  const totalCredit = journal.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    new Prisma.Decimal("0"),
  );

  assert(
    totalDebit.equals(TOTAL),
    "Journal debit total is incorrect.",
  );

  assert(
    totalCredit.equals(TOTAL),
    "Journal credit total is incorrect.",
  );

  assert(
    totalDebit.equals(totalCredit),
    "Expense journal is not balanced.",
  );

  for (const line of journal.lines) {
    assert(
      line.tenantId === TENANT_ID,
      "JournalLine tenantId mismatch.",
    );

    assert(
      line.journalEntryId === journal.id,
      "JournalLine journalEntryId mismatch.",
    );
  }

  const bankAfter =
    await prisma.financialAccount.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BANK_ID,
        },
      },
    });

  assert(
    bankAfter,
    "Financial Account missing after posting.",
  );

  assert(
    bankAfter.currentBalanceCache.toString() ===
      balanceCacheBefore,
    "Expense service mutated FinancialAccount balance cache.",
  );

  console.log(
    "PRIMARY POSTING VERIFICATION: PASS",
  );

  console.log("");
  console.log(
    "=== DUPLICATE POSTING REJECTION ===",
  );

  let duplicateRejected = false;

  try {
    await postExpense({
      tenantId: TENANT_ID,
      expenseId: expense.id,
      postedById: POSTED_BY_ID,
    });
  } catch (error) {
    if (error instanceof ExpensePostingError) {
      duplicateRejected = true;
      console.log(
        "Duplicate rejected:",
        error.message,
      );
    } else {
      throw error;
    }
  }

  assert(
    duplicateRejected,
    "Duplicate posting was not rejected.",
  );

  const finalJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "EXPENSE",
        sourceId: expense.id,
      },
    });

  assert(
    finalJournalCount === 1,
    "Duplicate attempt changed journal count.",
  );

  console.log("DUPLICATE PROTECTION: PASS");

  console.log("");
  console.log(
    "============================================================",
  );
  console.log(
    "15S.3 EXPENSE POSTING: VERIFIED",
  );
  console.log(
    "============================================================",
  );

  console.log("");
  console.log("PERMANENT EVIDENCE");
  console.log(
    "Expense Account ID:",
    expenseAccount.id,
  );
  console.log(
    "Expense Account:",
    `${expenseAccount.code} ${expenseAccount.name}`,
  );
  console.log(
    "Expense ID:",
    expenseAfter.id,
  );
  console.log(
    "Expense Number:",
    expenseAfter.expenseNumber,
  );
  console.log(
    "Expense Status:",
    expenseAfter.status,
  );
  console.log(
    "Journal ID:",
    journal.id,
  );
  console.log(
    "Journal Number:",
    journal.journalNumber,
  );
  console.log(
    "Accounting:",
    "DR 6200 1000 / DR 1400 150 / CR 1110 1150",
  );
  console.log(
    "FinancialAccount balance cache:",
    "UNCHANGED",
  );

  console.log("");
  console.log("DO NOT RERUN 15S.3.");
}

main()
  .catch((error) => {
    console.error("");
    console.error("15S.3: FAIL");
    console.error(error);
    console.error("");
    console.error("DO NOT RERUN 15S.3.");
    console.error(
      "Inspect database state read-only first.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });