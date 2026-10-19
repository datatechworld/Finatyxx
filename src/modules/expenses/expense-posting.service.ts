import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { postJournalInExistingTransaction } from "../accounting/general-ledger-posting.service.js";

const SOURCE_TYPE = "EXPENSE";

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export interface PostExpenseInput {
  tenantId: string;
  expenseId: string;
  postedById: string;
}

export class ExpensePostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpensePostingError";
  }
}

function isRetryableTransactionError(
  error: unknown,
): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
  ) {
    return (
      error.code === "P2034" ||
      error.code === "P2028"
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const code = String(
      (error as { code?: unknown }).code ?? "",
    );

    return code === "40001" || code === "40P01";
  }

  return false;
}

async function postExpenseInTransaction(
  tx: Prisma.TransactionClient,
  input: PostExpenseInput,
) {
  const lockedRows =
    await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `
        SELECT id::text
        FROM expenses
        WHERE "tenantId" = $1::uuid
          AND id = $2::uuid
        FOR UPDATE
      `,
      input.tenantId,
      input.expenseId,
    );

  if (lockedRows.length !== 1) {
    throw new ExpensePostingError(
      "Expense not found.",
    );
  }

  const expense =
    await tx.expense.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: input.expenseId,
        },
      },
    });

  if (!expense) {
    throw new ExpensePostingError(
      "Expense not found after row lock.",
    );
  }

  if (
    expense.status !== "DRAFT" &&
    expense.status !== "APPROVED"
  ) {
    throw new ExpensePostingError(
      `Expense must be DRAFT or APPROVED before posting; found ${expense.status}.`,
    );
  }

  if (expense.postedAt !== null) {
    throw new ExpensePostingError(
      "Expense has already been posted.",
    );
  }

  if (
    expense.description.trim().length === 0
  ) {
    throw new ExpensePostingError(
      "Expense description is required.",
    );
  }

  if (expense.subtotal.lessThanOrEqualTo(0)) {
    throw new ExpensePostingError(
      "Expense subtotal must be greater than zero.",
    );
  }

  if (expense.taxAmount.lessThan(0)) {
    throw new ExpensePostingError(
      "Expense taxAmount cannot be negative.",
    );
  }

  if (expense.total.lessThanOrEqualTo(0)) {
    throw new ExpensePostingError(
      "Expense total must be greater than zero.",
    );
  }

  const expectedTotal =
    expense.subtotal.plus(expense.taxAmount);

  if (!expense.total.equals(expectedTotal)) {
    throw new ExpensePostingError(
      "Expense total must equal subtotal plus taxAmount.",
    );
  }

  if (expense.currencyCode !== "GHS") {
    throw new ExpensePostingError(
      "MVP Expense posting supports GHS only.",
    );
  }

  if (!expense.exchangeRate.equals(1)) {
    throw new ExpensePostingError(
      "MVP Expense posting requires exchangeRate = 1.",
    );
  }

  if (!expense.financialAccountId) {
    throw new ExpensePostingError(
      "Immediate-payment Expense requires financialAccountId.",
    );
  }

  const tenant =
    await tx.tenant.findUnique({
      where: {
        id: input.tenantId,
      },
      select: {
        id: true,
        status: true,
      },
    });

  if (!tenant) {
    throw new ExpensePostingError(
      "Tenant not found.",
    );
  }

  if (
    tenant.status !== "TRIAL" &&
    tenant.status !== "ACTIVE"
  ) {
    throw new ExpensePostingError(
      `Tenant is not eligible for posting; found ${tenant.status}.`,
    );
  }

  const branch =
    await tx.branch.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: expense.branchId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

  if (!branch) {
    throw new ExpensePostingError(
      "Expense branch not found.",
    );
  }

  if (branch.status !== "ACTIVE") {
    throw new ExpensePostingError(
      "Expense branch is not ACTIVE.",
    );
  }

  const expenseAccount =
    await tx.account.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: expense.expenseAccountId,
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        status: true,
        isControlAccount: true,
        allowManualPosting: true,
      },
    });

  if (!expenseAccount) {
    throw new ExpensePostingError(
      "Expense GL account not found.",
    );
  }

  if (expenseAccount.status !== "ACTIVE") {
    throw new ExpensePostingError(
      "Expense GL account is not ACTIVE.",
    );
  }

  if (expenseAccount.type !== "EXPENSE") {
    throw new ExpensePostingError(
      "expenseAccountId must reference an EXPENSE account.",
    );
  }

  if (expenseAccount.isControlAccount) {
    throw new ExpensePostingError(
      "Expense cannot post directly to a control account.",
    );
  }

  if (!expenseAccount.allowManualPosting) {
    throw new ExpensePostingError(
      "Expense account is not enabled for direct posting.",
    );
  }

  const financialAccount =
    await tx.financialAccount.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: expense.financialAccountId,
        },
      },
      include: {
        ledgerAccount: true,
      },
    });

  if (!financialAccount) {
    throw new ExpensePostingError(
      "Financial Account not found.",
    );
  }

  if (financialAccount.status !== "ACTIVE") {
    throw new ExpensePostingError(
      "Financial Account is not ACTIVE.",
    );
  }

  if (
    financialAccount.branchId !== null &&
    financialAccount.branchId !== expense.branchId
  ) {
    throw new ExpensePostingError(
      "Financial Account branch does not match Expense branch.",
    );
  }

  if (
    financialAccount.currencyCode !==
    expense.currencyCode
  ) {
    throw new ExpensePostingError(
      "Financial Account currency does not match Expense currency.",
    );
  }

  if (
    !financialAccount.ledgerAccountId ||
    !financialAccount.ledgerAccount
  ) {
    throw new ExpensePostingError(
      "Financial Account has no linked ledger account.",
    );
  }

  if (
    financialAccount.ledgerAccount.status !==
    "ACTIVE"
  ) {
    throw new ExpensePostingError(
      "Financial Account ledger account is not ACTIVE.",
    );
  }

  if (
    financialAccount.ledgerAccount.type !==
    "ASSET"
  ) {
    throw new ExpensePostingError(
      "Financial Account ledger account must be an ASSET account.",
    );
  }

  const existingJournal =
    await tx.journalEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        sourceType: SOURCE_TYPE,
        sourceId: expense.id,
      },
      select: {
        id: true,
      },
    });

  if (existingJournal) {
    throw new ExpensePostingError(
      "Expense already has accounting journal evidence.",
    );
  }

  let inputTaxAccount:
    | {
        id: string;
        status: string;
        isControlAccount: boolean;
      }
    | null = null;

  if (expense.taxAmount.greaterThan(0)) {
    const inputTaxMapping =
      await tx.systemAccountMapping.findUnique({
        where: {
          tenantId_purpose: {
            tenantId: input.tenantId,
            purpose: "INPUT_TAX",
          },
        },
        include: {
          account: true,
        },
      });

    if (!inputTaxMapping) {
      throw new ExpensePostingError(
        "INPUT_TAX system account mapping is missing.",
      );
    }

    if (
      inputTaxMapping.account.status !== "ACTIVE"
    ) {
      throw new ExpensePostingError(
        "INPUT_TAX account is not ACTIVE.",
      );
    }

    if (
      inputTaxMapping.account.type !== "ASSET"
    ) {
      throw new ExpensePostingError(
        "INPUT_TAX account must be an ASSET account.",
      );
    }

    inputTaxAccount = {
      id: inputTaxMapping.account.id,
      status: inputTaxMapping.account.status,
      isControlAccount:
        inputTaxMapping.account.isControlAccount,
    };
  }

  const journalLines = [
    {
      accountId: expenseAccount.id,
      description: expense.description,
      debit: expense.subtotal,
      credit: new Prisma.Decimal("0"),
    },
  ];

  if (
    expense.taxAmount.greaterThan(0) &&
    inputTaxAccount
  ) {
    journalLines.push({
      accountId: inputTaxAccount.id,
      description: `Input tax - ${expense.description}`,
      debit: expense.taxAmount,
      credit: new Prisma.Decimal("0"),
    });
  }

  journalLines.push({
    accountId:
      financialAccount.ledgerAccountId,
    description: expense.description,
    debit: new Prisma.Decimal("0"),
    credit: expense.total,
  });

  const journal =
    await postJournalInExistingTransaction(
      tx,
      {
        tenantId: input.tenantId,
        branchId: expense.branchId,
        journalDate: expense.expenseDate,
        description:
          `Expense ${expense.expenseNumber}: ${expense.description}`,
        sourceType: SOURCE_TYPE,
        sourceId: expense.id,
        currencyCode: expense.currencyCode,
        exchangeRate: expense.exchangeRate,
        createdById: input.postedById,
        lines: journalLines,
      },
      "SYSTEM",
    );

  const postedAt = new Date();

  const postedExpense =
    await tx.expense.update({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: expense.id,
        },
      },
      data: {
        status: "POSTED",
        postedAt,
      },
    });

  return {
    expense: postedExpense,
    journal,
  };
}

export async function postExpense(
  input: PostExpenseInput,
) {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_SERIALIZABLE_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) =>
          postExpenseInTransaction(
            tx,
            input,
          ),
        {
          maxWait: 5_000,
          timeout: 15_000,
          isolationLevel:
            Prisma.TransactionIsolationLevel
              .Serializable,
        },
      );
    } catch (error) {
      lastError = error;

      if (
        error instanceof ExpensePostingError
      ) {
        throw error;
      }

      if (
        attempt ===
          MAX_SERIALIZABLE_ATTEMPTS ||
        !isRetryableTransactionError(error)
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}