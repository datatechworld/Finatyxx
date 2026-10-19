import { prisma } from "../../db/prisma.js";
import {
  AccountType,
  NormalBalance,
  RecordStatus,
} from "../../generated/prisma/enums.js";
import type { Prisma } from "../../generated/prisma/client.js";
type ChartOfAccountsDbClient =
  | typeof prisma
  | Prisma.TransactionClient;
const ACCOUNT_CODE_MAX_LENGTH = 40;
const ACCOUNT_NAME_MAX_LENGTH = 180;
const SERIALIZABLE_MAX_ATTEMPTS = 3;
const SERIALIZABLE_BASE_RETRY_DELAY_MS = 25;
export type CreateAccountInput = {
  tenantId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance?: NormalBalance;
  parentId?: string | null;
  isControlAccount?: boolean;
  allowManualPosting?: boolean;
  status?: RecordStatus;
};
export type UpdateAccountInput = {
  code?: string;
  name?: string;
  type?: AccountType;
  normalBalance?: NormalBalance;
  parentId?: string | null;
  isControlAccount?: boolean;
  allowManualPosting?: boolean;
  status?: RecordStatus;
};
export type ChartOfAccountsAccount = {
  id: string;
  tenantId: string;
  parentId: string | null;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  isControlAccount: boolean;
  allowManualPosting: boolean;
  status: RecordStatus;
  createdAt: Date;
  updatedAt: Date;
};
export class ChartOfAccountsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartOfAccountsError";
  }
}
function normalizeRequiredId(
  value: string,
  label: string
): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ChartOfAccountsError(
      `A valid ${label} is required.`
    );
  }
  return normalized;
}
function normalizeAccountCode(code: string): string {
  const normalized = code.trim();
  if (!normalized) {
    throw new ChartOfAccountsError(
      "An account code is required."
    );
  }
  if (normalized.length > ACCOUNT_CODE_MAX_LENGTH) {
    throw new ChartOfAccountsError(
      `Account code must not exceed ${ACCOUNT_CODE_MAX_LENGTH} characters.`
    );
  }
  return normalized;
}
function normalizeAccountName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new ChartOfAccountsError(
      "An account name is required."
    );
  }
  if (normalized.length > ACCOUNT_NAME_MAX_LENGTH) {
    throw new ChartOfAccountsError(
      `Account name must not exceed ${ACCOUNT_NAME_MAX_LENGTH} characters.`
    );
  }
  return normalized;
}
function getPrismaErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

/**
 * Prisma reports transaction write conflicts/deadlocks that require the
 * complete transaction to be retried as P2034.
 *
 * Retrying the complete transaction ensures every hierarchy read is
 * repeated against a fresh SERIALIZABLE snapshot.
 */
function isRetryableTransactionConflict(error: unknown): boolean {
  return getPrismaErrorCode(error) === "P2034";
}

async function waitBeforeSerializableRetry(attempt: number): Promise<void> {
  const delayMs = SERIALIZABLE_BASE_RETRY_DELAY_MS * attempt;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) => operation(tx),
        { isolationLevel: "Serializable" }
      );
    } catch (error) {
      lastError = error;

      if (
        !isRetryableTransactionConflict(error) ||
        attempt === SERIALIZABLE_MAX_ATTEMPTS
      ) {
        throw error;
      }

      await waitBeforeSerializableRetry(attempt);
    }
  }

  throw lastError;
}

/**
 * Return the conventional default normal balance for a fundamental
 * account classification.
 *
 * This is intentionally a default rather than an accounting invariant.
 *
 * Legitimate contra accounts exist. Examples include accumulated
 * depreciation and allowance accounts, which may be classified as
 * ASSET accounts while carrying a CREDIT normal balance.
 *
 * Finatyx must therefore never force every account of a particular
 * AccountType to use the conventional normal balance.
 */
export function getDefaultNormalBalance(
  type: AccountType
): NormalBalance {
  switch (type) {
    case AccountType.ASSET:
    case AccountType.EXPENSE:
      return NormalBalance.DEBIT;
    case AccountType.LIABILITY:
    case AccountType.EQUITY:
    case AccountType.REVENUE:
      return NormalBalance.CREDIT;
    default: {
      const exhaustiveCheck: never = type;
      throw new ChartOfAccountsError(
        `Unsupported account type: ${String(exhaustiveCheck)}.`
      );
    }
  }
}
async function requireTenant(
  db: ChartOfAccountsDbClient,
  tenantId: string
): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: {
      id: tenantId,
    },
    select: {
      id: true,
    },
  });
  if (!tenant) {
    throw new ChartOfAccountsError(
      "The Finatyx business does not exist."
    );
  }
}
async function requireAccount(
  db: ChartOfAccountsDbClient,
  tenantId: string,
  accountId: string
): Promise<ChartOfAccountsAccount> {
  const account = await db.account.findFirst({
    where: {
      id: accountId,
      tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      parentId: true,
      code: true,
      name: true,
      type: true,
      normalBalance: true,
      isControlAccount: true,
      allowManualPosting: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!account) {
    throw new ChartOfAccountsError(
      "The account does not exist for this Finatyx business."
    );
  }
  return account;
}
async function requireUniqueAccountCode(
  db: ChartOfAccountsDbClient,
  tenantId: string,
  code: string,
  excludeAccountId?: string
): Promise<void> {
  const existing = await db.account.findFirst({
    where: {
      tenantId,
      code,
      ...(excludeAccountId
        ? {
            id: {
              not: excludeAccountId,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  });
  if (existing) {
    throw new ChartOfAccountsError(
      `Account code "${code}" is already in use for this Finatyx business.`
    );
  }
}
/**
 * Validate a proposed parent relationship.
 *
 * PostgreSQL already protects two important invariants:
 *
 * 1. A parent must belong to the same tenant.
 * 2. An account cannot directly reference itself as its parent.
 *
 * This service adds the higher-level hierarchy rule that cannot be
 * represented by the existing simple CHECK/FK constraints:
 *
 *     multi-level cycles are forbidden.
 *
 * Example of an invalid hierarchy:
 *
 *     A -> B -> C -> A
 *
 * The traversal follows the proposed parent's ancestor chain until it
 * reaches a root account. If the account being changed appears anywhere
 * in that chain, accepting the parent would create a cycle.
 */
async function validateParentHierarchy(
  db: ChartOfAccountsDbClient,
  tenantId: string,
  parentId: string | null,
  accountId?: string
): Promise<void> {
  if (parentId === null) {
    return;
  }
  if (accountId && parentId === accountId) {
    throw new ChartOfAccountsError(
      "An account cannot be its own parent."
    );
  }
  const visited = new Set<string>();
  let currentId: string | null = parentId;
  while (currentId !== null) {
    if (visited.has(currentId)) {
      throw new ChartOfAccountsError(
        "The existing account hierarchy contains a cycle."
      );
    }
    visited.add(currentId);
    if (accountId && currentId === accountId) {
      throw new ChartOfAccountsError(
        "The selected parent would create a cycle in the Chart of Accounts."
      );
    }
    const current: {
      id: string;
      parentId: string | null;
    } | null = await db.account.findFirst({
      where: {
        id: currentId,
        tenantId,
      },
      select: {
        id: true,
        parentId: true,
      },
    });
    if (!current) {
      throw new ChartOfAccountsError(
        "The selected parent account does not exist for this Finatyx business."
      );
    }
    currentId = current.parentId;
  }
}
async function createAccountWithClient(
  db: ChartOfAccountsDbClient,
  input: CreateAccountInput
): Promise<ChartOfAccountsAccount> {
  const tenantId = normalizeRequiredId(
    input.tenantId,
    "tenant ID"
  );
  const code = normalizeAccountCode(input.code);
  const name = normalizeAccountName(input.name);
  const parentId =
    input.parentId === undefined || input.parentId === null
      ? null
      : normalizeRequiredId(
          input.parentId,
          "parent account ID"
        );
  await requireTenant(db, tenantId);
  await requireUniqueAccountCode(
    db,
    tenantId,
    code
  );
  await validateParentHierarchy(
    db,
    tenantId,
    parentId
  );
  const normalBalance =
    input.normalBalance ??
    getDefaultNormalBalance(input.type);
  try {
    return await db.account.create({
      data: {
        tenantId,
        parentId,
        code,
        name,
        type: input.type,
        normalBalance,
        isControlAccount:
          input.isControlAccount ?? false,
        allowManualPosting:
          input.allowManualPosting ?? true,
        status: input.status ?? RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        tenantId: true,
        parentId: true,
        code: true,
        name: true,
        type: true,
        normalBalance: true,
        isControlAccount: true,
        allowManualPosting: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2002") {
      throw new ChartOfAccountsError(
        `Account code "${code}" is already in use for this Finatyx business.`
      );
    }
    throw error;
  }
}
async function updateAccountWithClient(
  db: ChartOfAccountsDbClient,
  tenantIdInput: string,
  accountIdInput: string,
  input: UpdateAccountInput
): Promise<ChartOfAccountsAccount> {
  const tenantId = normalizeRequiredId(
    tenantIdInput,
    "tenant ID"
  );
  const accountId = normalizeRequiredId(
    accountIdInput,
    "account ID"
  );
  const existing = await requireAccount(
    db,
    tenantId,
    accountId
  );
  const code =
    input.code === undefined
      ? existing.code
      : normalizeAccountCode(input.code);
  const name =
    input.name === undefined
      ? existing.name
      : normalizeAccountName(input.name);
  const parentId =
    input.parentId === undefined
      ? existing.parentId
      : input.parentId === null
        ? null
        : normalizeRequiredId(
            input.parentId,
            "parent account ID"
          );
  if (code !== existing.code) {
    await requireUniqueAccountCode(
      db,
      tenantId,
      code,
      accountId
    );
  }
  if (parentId !== existing.parentId) {
    await validateParentHierarchy(
      db,
      tenantId,
      parentId,
      accountId
    );
  }
  const requestedType = input.type ?? existing.type;
  const requestedNormalBalance =
    input.normalBalance ?? existing.normalBalance;

  /*
   * Once an account has journal history, its fundamental accounting
   * semantics are historical facts. Changing AccountType or
   * NormalBalance after posting activity could reinterpret prior ledger
   * balances and financial reporting.
   *
   * Operational/configuration properties such as isControlAccount and
   * allowManualPosting remain independently manageable. Code, name,
   * hierarchy and lifecycle are also governed by their own rules.
   */
  const typeWouldChange = requestedType !== existing.type;
  const normalBalanceWouldChange =
    requestedNormalBalance !== existing.normalBalance;

  if (typeWouldChange || normalBalanceWouldChange) {
    const journalLineCount = await db.journalLine.count({
      where: {
        tenantId,
        accountId,
      },
    });

    if (journalLineCount > 0) {
      if (typeWouldChange && normalBalanceWouldChange) {
        throw new ChartOfAccountsError(
          "The account type and normal balance cannot be changed because the account has journal history. Create a new account for different accounting semantics."
        );
      }

      if (typeWouldChange) {
        throw new ChartOfAccountsError(
          "The account type cannot be changed because the account has journal history. Create a new account for a different accounting classification."
        );
      }

      throw new ChartOfAccountsError(
        "The account normal balance cannot be changed because the account has journal history. Create a new account for different accounting semantics."
      );
    }
  }

  /*
   * Changing AccountType must not silently overwrite normalBalance.
   *
   * An existing account may intentionally be a contra account.
   * Therefore:
   *
   * - if normalBalance is explicitly supplied, use it;
   * - otherwise preserve the existing value.
   *
   * The conventional default is only applied when an account is first
   * created and the caller does not explicitly choose a balance side.
   */
  const normalBalance = requestedNormalBalance;
  try {
    return await db.account.update({
      where: {
        tenantId_id: {
          tenantId,
          id: accountId,
        },
      },
      data: {
        code,
        name,
        type: requestedType,
        normalBalance,
        parentId,
        isControlAccount:
          input.isControlAccount ??
          existing.isControlAccount,
        allowManualPosting:
          input.allowManualPosting ??
          existing.allowManualPosting,
        status: input.status ?? existing.status,
      },
      select: {
        id: true,
        tenantId: true,
        parentId: true,
        code: true,
        name: true,
        type: true,
        normalBalance: true,
        isControlAccount: true,
        allowManualPosting: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2002") {
      throw new ChartOfAccountsError(
        `Account code "${code}" is already in use for this Finatyx business.`
      );
    }
    throw error;
  }
}
async function setAccountStatusWithClient(
  db: ChartOfAccountsDbClient,
  tenantIdInput: string,
  accountIdInput: string,
  status: RecordStatus
): Promise<ChartOfAccountsAccount> {
  const tenantId = normalizeRequiredId(
    tenantIdInput,
    "tenant ID"
  );
  const accountId = normalizeRequiredId(
    accountIdInput,
    "account ID"
  );
  await requireAccount(
    db,
    tenantId,
    accountId
  );
  return db.account.update({
    where: {
      tenantId_id: {
        tenantId,
        id: accountId,
      },
    },
    data: {
      status,
    },
    select: {
      id: true,
      tenantId: true,
      parentId: true,
      code: true,
      name: true,
      type: true,
      normalBalance: true,
      isControlAccount: true,
      allowManualPosting: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
/**
 * Delete an account only when it has never become part of accounting
 * history or configuration.
 *
 * Normal account lifecycle management should use INACTIVE/ARCHIVED
 * status instead of deletion.
 *
 * Deletion is intentionally conservative because financial systems must
 * preserve historical ledger meaning. PostgreSQL foreign keys remain
 * the final line of defense if another protected relationship is added
 * in the future.
 */
async function deleteUnusedAccountWithClient(
  db: ChartOfAccountsDbClient,
  tenantIdInput: string,
  accountIdInput: string
): Promise<void> {
  const tenantId = normalizeRequiredId(
    tenantIdInput,
    "tenant ID"
  );
  const accountId = normalizeRequiredId(
    accountIdInput,
    "account ID"
  );
  await requireAccount(
    db,
    tenantId,
    accountId
  );
  const [
    childCount,
    journalLineCount,
    systemMappingCount,
    receivablesSettingsCount,
    payablesSettingsCount,
    salesSettingsCount,
    inventorySettingsCount,
    cogsSettingsCount,
    retainedEarningsSettingsCount,
  ] = await Promise.all([
    db.account.count({
      where: {
        tenantId,
        parentId: accountId,
      },
    }),
    db.journalLine.count({
      where: {
        tenantId,
        accountId,
      },
    }),
    db.systemAccountMapping.count({
      where: {
        tenantId,
        accountId,
      },
    }),
    db.accountingSettings.count({
      where: {
        tenantId,
        receivablesAccountId: accountId,
      },
    }),
    db.accountingSettings.count({
      where: {
        tenantId,
        payablesAccountId: accountId,
      },
    }),
    db.accountingSettings.count({
      where: {
        tenantId,
        salesAccountId: accountId,
      },
    }),
    db.accountingSettings.count({
      where: {
        tenantId,
        inventoryAccountId: accountId,
      },
    }),
    db.accountingSettings.count({
      where: {
        tenantId,
        cogsAccountId: accountId,
      },
    }),
    db.accountingSettings.count({
      where: {
        tenantId,
        retainedEarningsAccountId: accountId,
      },
    }),
  ]);
  if (childCount > 0) {
    throw new ChartOfAccountsError(
      "The account cannot be deleted because it has child accounts. Reassign or remove the child accounts first."
    );
  }
  if (journalLineCount > 0) {
    throw new ChartOfAccountsError(
      "The account cannot be deleted because it has journal history. Deactivate or archive the account instead."
    );
  }
  if (systemMappingCount > 0) {
    throw new ChartOfAccountsError(
      "The account cannot be deleted because it is assigned to a system account purpose."
    );
  }
  const accountingSettingsReferenceCount =
    receivablesSettingsCount +
    payablesSettingsCount +
    salesSettingsCount +
    inventorySettingsCount +
    cogsSettingsCount +
    retainedEarningsSettingsCount;
  if (accountingSettingsReferenceCount > 0) {
    throw new ChartOfAccountsError(
      "The account cannot be deleted because it is referenced by the tenant's accounting settings."
    );
  }
  try {
    await db.account.delete({
      where: {
        tenantId_id: {
          tenantId,
          id: accountId,
        },
      },
    });
  } catch (error) {
    /*
     * P2003 means a foreign-key relationship still protects this
     * account. We deliberately convert that low-level database error
     * into a domain-level message rather than weakening the FK.
     */
    if (getPrismaErrorCode(error) === "P2003") {
      throw new ChartOfAccountsError(
        "The account cannot be deleted because another Finatyx record depends on it. Deactivate or archive the account instead."
      );
    }
    throw error;
  }
}
/**
 * Create an account as a standalone operation.
 *
 * Parent-hierarchy validation and creation run inside one SERIALIZABLE
 * transaction. Retryable transaction conflicts rerun the complete unit
 * from a fresh database snapshot.
 */
export async function createAccount(
  input: CreateAccountInput
): Promise<ChartOfAccountsAccount> {
  return runSerializableTransaction(
    async (tx) => createAccountWithClient(tx, input)
  );
}

/**
 * Create an account inside an existing Prisma interactive transaction.
 *
 * This function deliberately does not create a nested transaction.
 * The caller owns the outer transaction's isolation and retry policy.
 */
export async function createAccountInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateAccountInput
): Promise<ChartOfAccountsAccount> {
  return createAccountWithClient(
    tx,
    input
  );
}
/**
 * Update an account as a standalone operation.
 *
 * The complete read/validate/update sequence runs at SERIALIZABLE isolation.
 * This is especially important when parentId changes because ancestor
 * traversal and mutation must be evaluated as one concurrency-safe unit.
 *
 * AccountType, NormalBalance, control-account status and manual-posting
 * configuration remain explicit properties. Reporting classification
 * and system-account purpose are deliberately handled elsewhere.
 */
export async function updateAccount(
  tenantId: string,
  accountId: string,
  input: UpdateAccountInput
): Promise<ChartOfAccountsAccount> {
  return runSerializableTransaction(
    async (tx) =>
      updateAccountWithClient(tx, tenantId, accountId, input)
  );
}

/**
 * Update an account inside an existing Prisma interactive transaction.
 *
 * This function deliberately does not create a nested transaction.
 * If hierarchy can change, the caller owns suitable isolation and must
 * retry the complete outer transaction after a serialization conflict.
 */
export async function updateAccountInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  accountId: string,
  input: UpdateAccountInput
): Promise<ChartOfAccountsAccount> {
  return updateAccountWithClient(
    tx,
    tenantId,
    accountId,
    input
  );
}
/**
 * Deactivate an account without deleting accounting history.
 */
export async function deactivateAccount(
  tenantId: string,
  accountId: string
): Promise<ChartOfAccountsAccount> {
  return setAccountStatusWithClient(
    prisma,
    tenantId,
    accountId,
    RecordStatus.INACTIVE
  );
}
/**
 * Deactivate an account inside an existing transaction.
 */
export async function deactivateAccountInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  accountId: string
): Promise<ChartOfAccountsAccount> {
  return setAccountStatusWithClient(
    tx,
    tenantId,
    accountId,
    RecordStatus.INACTIVE
  );
}
/**
 * Reactivate an account.
 */
export async function reactivateAccount(
  tenantId: string,
  accountId: string
): Promise<ChartOfAccountsAccount> {
  return setAccountStatusWithClient(
    prisma,
    tenantId,
    accountId,
    RecordStatus.ACTIVE
  );
}
/**
 * Reactivate an account inside an existing transaction.
 */
export async function reactivateAccountInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  accountId: string
): Promise<ChartOfAccountsAccount> {
  return setAccountStatusWithClient(
    tx,
    tenantId,
    accountId,
    RecordStatus.ACTIVE
  );
}
/**
 * Archive an account while preserving its accounting history.
 */
export async function archiveAccount(
  tenantId: string,
  accountId: string
): Promise<ChartOfAccountsAccount> {
  return setAccountStatusWithClient(
    prisma,
    tenantId,
    accountId,
    RecordStatus.ARCHIVED
  );
}
/**
 * Archive an account inside an existing transaction.
 */
export async function archiveAccountInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  accountId: string
): Promise<ChartOfAccountsAccount> {
  return setAccountStatusWithClient(
    tx,
    tenantId,
    accountId,
    RecordStatus.ARCHIVED
  );
}
/**
 * Permanently delete an account only if it has no protected accounting
 * history, hierarchy dependencies or system-account configuration.
 */
export async function deleteUnusedAccount(
  tenantId: string,
  accountId: string
): Promise<void> {
  return deleteUnusedAccountWithClient(
    prisma,
    tenantId,
    accountId
  );
}
/**
 * Permanently delete an unused account inside an existing transaction.
 */
export async function deleteUnusedAccountInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  accountId: string
): Promise<void> {
  return deleteUnusedAccountWithClient(
    tx,
    tenantId,
    accountId
  );
}