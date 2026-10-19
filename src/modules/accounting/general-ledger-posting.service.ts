import { Prisma } from "../../generated/prisma/client.js";
import { DateTime } from "luxon";
import { prisma } from "../../db/prisma.js";
import { allocateDocumentNumberInTransaction } from "../documents/document-number.service.js";

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);
const MAX_SOURCE_TYPE_LENGTH = 60;
const SERIALIZABLE_MAX_ATTEMPTS = 3;
const SERIALIZABLE_RETRY_BASE_MS = 25;

export type PostingOrigin = "MANUAL" | "SYSTEM";

export type PostJournalLineInput = {
  accountId: string;
  description?: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  customerId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
  projectId?: string | null;
};

export type PostJournalInput = {
  tenantId: string;
  branchId?: string | null;
  journalDate: Date;
  description: string;
  sourceType: string;
  sourceId?: string | null;
  currencyCode: string;
  exchangeRate?: Prisma.Decimal;
  createdById: string;
  lines: PostJournalLineInput[];
};

export type PostedJournal = {
  id: string;
  tenantId: string;
  branchId: string | null;
  journalNumber: string;
  journalDate: Date;
  description: string;
  sourceType: string;
  sourceId: string | null;
  currencyCode: string;
  exchangeRate: Prisma.Decimal;
  status: "POSTED";
  postedAt: Date;
  postedById: string;
  createdById: string;
  createdAt: Date;
  lines: Array<{
    id: string;
    tenantId: string;
    journalEntryId: string;
    accountId: string;
    description: string | null;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    customerId: string | null;
    supplierId: string | null;
    employeeId: string | null;
    projectId: string | null;
    createdAt: Date;
  }>;
};

export class GeneralLedgerPostingError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "TENANT_NOT_OPERATIONAL"
      | "BRANCH_NOT_AVAILABLE"
      | "PERIOD_NOT_OPEN"
      | "ACCOUNT_NOT_AVAILABLE"
      | "MANUAL_POSTING_NOT_ALLOWED"
      | "DIMENSION_NOT_AVAILABLE"
      | "INVALID_JOURNAL_LINES"
      | "UNBALANCED_JOURNAL"
      | "CURRENCY_NOT_AVAILABLE"
      | "INVALID_EXCHANGE_RATE"
      | "DUPLICATE_SOURCE"
      | "TRANSACTION_WRITE_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "GeneralLedgerPostingError";
  }
}

type PostingClient = Prisma.TransactionClient;

function normalizeRequired(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new GeneralLedgerPostingError("INVALID_INPUT", `${field} is required.`);
  }
  return normalized;
}

function normalizeNullable(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeSourceType(value: string): string {
  const normalized = normalizeRequired(value, "sourceType").toUpperCase();
  if (normalized.length > MAX_SOURCE_TYPE_LENGTH) {
    throw new GeneralLedgerPostingError(
      "INVALID_INPUT",
      `sourceType must not exceed ${MAX_SOURCE_TYPE_LENGTH} characters.`,
    );
  }
  return normalized;
}

function normalizeCurrencyCode(value: string): string {
  const normalized = normalizeRequired(value, "currencyCode").toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new GeneralLedgerPostingError(
      "INVALID_INPUT",
      "currencyCode must be a three-letter currency code.",
    );
  }
  return normalized;
}

function normalizeJournalDescription(value: string): string {
  return normalizeRequired(value, "description");
}

function normalizeJournalDate(input: Date, timezone: string): {
  dateOnly: string;
  databaseDate: Date;
} {
  if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
    throw new GeneralLedgerPostingError("INVALID_INPUT", "journalDate must be a valid Date.");
  }

  const local = DateTime.fromJSDate(input, { zone: "utc" }).setZone(timezone);
  if (!local.isValid) {
    throw new GeneralLedgerPostingError(
      "INVALID_INPUT",
      `Unable to resolve journalDate in tenant timezone ${timezone}.`,
    );
  }

  const dateOnly = local.toISODate();
  if (!dateOnly) {
    throw new GeneralLedgerPostingError("INVALID_INPUT", "Unable to resolve journalDate.");
  }

  return {
    dateOnly,
    databaseDate: new Date(`${dateOnly}T00:00:00.000Z`),
  };
}

function assertDecimal(value: Prisma.Decimal, field: string): Prisma.Decimal {
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new GeneralLedgerPostingError("INVALID_INPUT", `${field} must be a valid decimal.`);
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function isSerializationConflict(error: unknown): boolean {
  if (isPrismaCode(error, "P2034")) return true;

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

  if (databaseCode === "40001") return true;

  return (
    error.code === "P2010" &&
    error.message.includes("40001") &&
    error.message.toLowerCase().includes("could not serialize access")
  );
}

function isSourceIdempotencyViolation(error: unknown): boolean {
  if (!isPrismaCode(error, "P2002")) return false;

  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
  const text = Array.isArray(target)
    ? target.join(",")
    : typeof target === "string"
      ? target
      : JSON.stringify(target ?? "");

  return (
    text.includes("journal_entries_source_idempotency_uidx") ||
    (text.includes("tenantId") && text.includes("sourceType") && text.includes("sourceId"))
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function validateTenantAndResolveDate(
  tx: PostingClient,
  tenantId: string,
  journalDate: Date,
): Promise<{
  tenantId: string;
  baseCurrencyCode: string;
  timezone: string;
  dateOnly: string;
  databaseDate: Date;
}> {
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      status: true,
      baseCurrencyCode: true,
      timezone: true,
    },
  });

  if (!tenant || (tenant.status !== "TRIAL" && tenant.status !== "ACTIVE")) {
    throw new GeneralLedgerPostingError(
      "TENANT_NOT_OPERATIONAL",
      "The tenant does not exist or is not operational.",
    );
  }

  const normalizedDate = normalizeJournalDate(journalDate, tenant.timezone);

  return {
    tenantId: tenant.id,
    baseCurrencyCode: tenant.baseCurrencyCode,
    timezone: tenant.timezone,
    ...normalizedDate,
  };
}

async function validateBranch(
  tx: PostingClient,
  tenantId: string,
  branchId: string | null,
): Promise<void> {
  if (!branchId) return;

  const branch = await tx.branch.findFirst({
    where: {
      tenantId,
      id: branchId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!branch) {
    throw new GeneralLedgerPostingError(
      "BRANCH_NOT_AVAILABLE",
      "The branch does not exist, does not belong to the tenant, or is not active.",
    );
  }
}

async function validateOpenAccountingPeriod(
  tx: PostingClient,
  tenantId: string,
  journalDate: Date,
): Promise<void> {
  const period = await tx.fiscalPeriod.findFirst({
    where: {
      tenantId,
      startDate: { lte: journalDate },
      endDate: { gte: journalDate },
      status: "OPEN",
      fiscalYear: {
        status: "OPEN",
        startDate: { lte: journalDate },
        endDate: { gte: journalDate },
      },
    },
    select: { id: true },
  });

  if (!period) {
    throw new GeneralLedgerPostingError(
      "PERIOD_NOT_OPEN",
      "The journal date is not inside an open fiscal year and open fiscal period.",
    );
  }
}

async function validateCurrency(
  tx: PostingClient,
  currencyCode: string,
  baseCurrencyCode: string,
  exchangeRateInput: Prisma.Decimal | undefined,
): Promise<Prisma.Decimal> {
  const currency = await tx.currency.findUnique({
    where: { code: currencyCode },
    select: { code: true, active: true },
  });

  if (!currency?.active) {
    throw new GeneralLedgerPostingError(
      "CURRENCY_NOT_AVAILABLE",
      `Currency ${currencyCode} does not exist or is inactive.`,
    );
  }

  const exchangeRate =
    exchangeRateInput == null ? ONE : assertDecimal(exchangeRateInput, "exchangeRate");

  if (!exchangeRate.gt(ZERO)) {
    throw new GeneralLedgerPostingError(
      "INVALID_EXCHANGE_RATE",
      "exchangeRate must be greater than zero.",
    );
  }

  if (currencyCode === baseCurrencyCode && !exchangeRate.eq(ONE)) {
    throw new GeneralLedgerPostingError(
      "INVALID_EXCHANGE_RATE",
      `exchangeRate must be 1 when journal currency equals tenant base currency ${baseCurrencyCode}.`,
    );
  }

  return exchangeRate;
}

async function validateAccounts(
  tx: PostingClient,
  tenantId: string,
  origin: PostingOrigin,
  lines: PostJournalLineInput[],
): Promise<void> {
  const accountIds = [...new Set(lines.map((line) => normalizeRequired(line.accountId, "accountId")))];

  const accounts = await tx.account.findMany({
    where: {
      tenantId,
      id: { in: accountIds },
    },
    select: {
      id: true,
      status: true,
      allowManualPosting: true,
    },
  });

  if (accounts.length !== accountIds.length) {
    throw new GeneralLedgerPostingError(
      "ACCOUNT_NOT_AVAILABLE",
      "One or more accounts do not exist in the tenant.",
    );
  }

  for (const account of accounts) {
    if (account.status !== "ACTIVE") {
      throw new GeneralLedgerPostingError(
        "ACCOUNT_NOT_AVAILABLE",
        `Account ${account.id} is not active.`,
      );
    }

    if (origin === "MANUAL" && !account.allowManualPosting) {
      throw new GeneralLedgerPostingError(
        "MANUAL_POSTING_NOT_ALLOWED",
        `Manual posting is not allowed for account ${account.id}.`,
      );
    }
  }
}

async function validateDimensionIds(
  tx: PostingClient,
  tenantId: string,
  lines: PostJournalLineInput[],
): Promise<void> {
  const customerIds = [...new Set(lines.map((x) => normalizeNullable(x.customerId)).filter((x): x is string => x !== null))];
  const supplierIds = [...new Set(lines.map((x) => normalizeNullable(x.supplierId)).filter((x): x is string => x !== null))];
  const employeeIds = [...new Set(lines.map((x) => normalizeNullable(x.employeeId)).filter((x): x is string => x !== null))];
  const projectIds = [...new Set(lines.map((x) => normalizeNullable(x.projectId)).filter((x): x is string => x !== null))];

  const [customers, suppliers, employees, projects] = await Promise.all([
    customerIds.length
      ? tx.customer.findMany({
          where: { tenantId, id: { in: customerIds }, status: "ACTIVE" },
          select: { id: true },
        })
      : Promise.resolve([]),
    supplierIds.length
      ? tx.supplier.findMany({
          where: { tenantId, id: { in: supplierIds }, status: "ACTIVE" },
          select: { id: true },
        })
      : Promise.resolve([]),
    employeeIds.length
      ? tx.employee.findMany({
          where: { tenantId, id: { in: employeeIds }, status: "ACTIVE" },
          select: { id: true },
        })
      : Promise.resolve([]),
    projectIds.length
      ? tx.project.findMany({
          where: { tenantId, id: { in: projectIds }, status: "ACTIVE" },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  if (customers.length !== customerIds.length) {
    throw new GeneralLedgerPostingError(
      "DIMENSION_NOT_AVAILABLE",
      "One or more customer dimensions do not exist in the tenant or are not active.",
    );
  }

  if (suppliers.length !== supplierIds.length) {
    throw new GeneralLedgerPostingError(
      "DIMENSION_NOT_AVAILABLE",
      "One or more supplier dimensions do not exist in the tenant or are not active.",
    );
  }

  if (employees.length !== employeeIds.length) {
    throw new GeneralLedgerPostingError(
      "DIMENSION_NOT_AVAILABLE",
      "One or more employee dimensions do not exist in the tenant or are not active.",
    );
  }

  if (projects.length !== projectIds.length) {
    throw new GeneralLedgerPostingError(
      "DIMENSION_NOT_AVAILABLE",
      "One or more project dimensions do not exist in the tenant or are not active.",
    );
  }
}

function validateAndNormalizeLines(lines: PostJournalLineInput[]): Array<{
  accountId: string;
  description: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  customerId: string | null;
  supplierId: string | null;
  employeeId: string | null;
  projectId: string | null;
}> {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new GeneralLedgerPostingError(
      "INVALID_JOURNAL_LINES",
      "A journal entry must contain at least two lines.",
    );
  }

  let totalDebit = ZERO;
  let totalCredit = ZERO;

  const normalized = lines.map((line, index) => {
    const debit = assertDecimal(line.debit, `lines[${index}].debit`);
    const credit = assertDecimal(line.credit, `lines[${index}].credit`);

    if (debit.lt(ZERO) || credit.lt(ZERO)) {
      throw new GeneralLedgerPostingError(
        "INVALID_JOURNAL_LINES",
        `Journal line ${index + 1} cannot contain a negative debit or credit.`,
      );
    }

    const hasDebit = debit.gt(ZERO);
    const hasCredit = credit.gt(ZERO);

    if (hasDebit === hasCredit) {
      throw new GeneralLedgerPostingError(
        "INVALID_JOURNAL_LINES",
        `Journal line ${index + 1} must contain exactly one positive debit or one positive credit.`,
      );
    }

    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);

    return {
      accountId: normalizeRequired(line.accountId, `lines[${index}].accountId`),
      description: normalizeNullable(line.description),
      debit,
      credit,
      customerId: normalizeNullable(line.customerId),
      supplierId: normalizeNullable(line.supplierId),
      employeeId: normalizeNullable(line.employeeId),
      projectId: normalizeNullable(line.projectId),
    };
  });

  if (!totalDebit.eq(totalCredit)) {
    throw new GeneralLedgerPostingError(
      "UNBALANCED_JOURNAL",
      `Journal is not balanced. Debit total ${totalDebit.toString()} does not equal credit total ${totalCredit.toString()}.`,
    );
  }

  return normalized;
}

async function findExistingSourceJournal(
  tx: PostingClient,
  tenantId: string,
  sourceType: string,
  sourceId: string | null,
): Promise<{ id: string } | null> {
  if (!sourceId) return null;

  return tx.journalEntry.findFirst({
    where: {
      tenantId,
      sourceType,
      sourceId,
    },
    select: { id: true },
  });
}

async function postJournalInTransaction(
  tx: PostingClient,
  input: PostJournalInput,
  origin: PostingOrigin,
): Promise<PostedJournal> {
  const tenantId = normalizeRequired(input.tenantId, "tenantId");
  const createdById = normalizeRequired(input.createdById, "createdById");
  const branchId = normalizeNullable(input.branchId);
  const sourceId = normalizeNullable(input.sourceId);
  const sourceType = normalizeSourceType(input.sourceType);
  const currencyCode = normalizeCurrencyCode(input.currencyCode);
  const description = normalizeJournalDescription(input.description);
  const lines = validateAndNormalizeLines(input.lines);

  const tenantContext = await validateTenantAndResolveDate(tx, tenantId, input.journalDate);

  await validateBranch(tx, tenantId, branchId);
  await validateOpenAccountingPeriod(tx, tenantId, tenantContext.databaseDate);

  const exchangeRate = await validateCurrency(
    tx,
    currencyCode,
    tenantContext.baseCurrencyCode,
    input.exchangeRate,
  );

  await validateAccounts(tx, tenantId, origin, lines);
  await validateDimensionIds(tx, tenantId, lines);

  const existing = await findExistingSourceJournal(tx, tenantId, sourceType, sourceId);
  if (existing) {
    throw new GeneralLedgerPostingError(
      "DUPLICATE_SOURCE",
      `Source ${sourceType}/${sourceId} has already been posted as journal ${existing.id}.`,
    );
  }

  const allocation = await allocateDocumentNumberInTransaction(
    tx,
    tenantId,
    "JOURNAL",
    tenantContext.dateOnly,
  );

  const postedAt = new Date();

  try {
    const draftJournal = await tx.journalEntry.create({
      data: {
        tenantId,
        branchId,
        journalNumber: allocation.documentNumber,
        journalDate: tenantContext.databaseDate,
        description,
        sourceType,
        sourceId,
        currencyCode,
        exchangeRate,
        status: "DRAFT",
        createdById,
      },
      select: {
        id: true,
      },
    });

    await tx.journalLine.createMany({
      data: lines.map((line) => ({
        tenantId,
        journalEntryId: draftJournal.id,
        accountId: line.accountId,
        description: line.description,
        debit: line.debit,
        credit: line.credit,
        customerId: line.customerId,
        supplierId: line.supplierId,
        employeeId: line.employeeId,
        projectId: line.projectId,
      })),
    });

    const journal = await tx.journalEntry.update({
      where: {
        tenantId_id: {
          tenantId,
          id: draftJournal.id,
        },
      },
      data: {
        status: "POSTED",
        postedAt,
        postedById: createdById,
      },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return journal as PostedJournal;
  } catch (error) {
    if (isSourceIdempotencyViolation(error)) {
      throw new GeneralLedgerPostingError(
        "DUPLICATE_SOURCE",
        `Source ${sourceType}/${sourceId} has already been posted.`,
      );
    }
    throw error;
  }
}

export async function postJournal(
  input: PostJournalInput,
  origin: PostingOrigin = "MANUAL",
): Promise<PostedJournal> {
  if (origin !== "MANUAL" && origin !== "SYSTEM") {
    throw new GeneralLedgerPostingError("INVALID_INPUT", "Invalid posting origin.");
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => postJournalInTransaction(tx, input, origin),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isSourceIdempotencyViolation(error)) {
        throw new GeneralLedgerPostingError(
          "DUPLICATE_SOURCE",
          "This source has already been posted.",
        );
      }

      if (isSerializationConflict(error)) {
        if (attempt === SERIALIZABLE_MAX_ATTEMPTS) {
          throw new GeneralLedgerPostingError(
            "TRANSACTION_WRITE_CONFLICT",
            "The journal could not be posted because of a concurrent transaction. Please retry.",
          );
        }

        await sleep(SERIALIZABLE_RETRY_BASE_MS * attempt);
        continue;
      }

      throw error;
    }
  }

  throw new GeneralLedgerPostingError(
    "TRANSACTION_WRITE_CONFLICT",
    "The journal could not be posted because of a concurrent transaction.",
  );
}

export async function postJournalInExistingTransaction(
  tx: Prisma.TransactionClient,
  input: PostJournalInput,
  origin: PostingOrigin = "SYSTEM",
): Promise<PostedJournal> {
  if (origin !== "MANUAL" && origin !== "SYSTEM") {
    throw new GeneralLedgerPostingError("INVALID_INPUT", "Invalid posting origin.");
  }

  return postJournalInTransaction(tx, input, origin);
}
