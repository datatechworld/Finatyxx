import { Prisma } from "../../generated/prisma/client.js";
import { DateTime } from "luxon";
import { prisma } from "../../db/prisma.js";
import { allocateDocumentNumberInTransaction } from "../documents/document-number.service.js";

const SERIALIZABLE_MAX_ATTEMPTS = 3;
const SERIALIZABLE_RETRY_BASE_MS = 25;

type ReversalClient = Prisma.TransactionClient;

export type ReverseJournalInput = {
  tenantId: string;
  journalEntryId: string;
  reversalDate: Date;
  reason: string;
  reversedById: string;
};

export type ReversedJournalResult = {
  originalJournalId: string;
  originalJournalNumber: string;
  originalStatus: "REVERSED";
  reversalJournal: {
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
    reversalOfId: string | null;
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
};

export class JournalReversalError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "TENANT_NOT_OPERATIONAL"
      | "JOURNAL_NOT_FOUND"
      | "JOURNAL_NOT_POSTED"
      | "ALREADY_REVERSED"
      | "REVERSAL_OF_REVERSAL_NOT_ALLOWED"
      | "PERIOD_NOT_OPEN"
      | "INVALID_ORIGINAL_JOURNAL"
      | "TRANSACTION_WRITE_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "JournalReversalError";
  }
}

function normalizeRequired(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new JournalReversalError(
      "INVALID_INPUT",
      `${field} is required.`,
    );
  }

  return normalized;
}

function normalizeReason(value: string): string {
  return normalizeRequired(value, "reason");
}

function normalizeJournalDate(
  input: Date,
  timezone: string,
): {
  dateOnly: string;
  databaseDate: Date;
} {
  if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
    throw new JournalReversalError(
      "INVALID_INPUT",
      "reversalDate must be a valid Date.",
    );
  }

  const local = DateTime.fromJSDate(input, { zone: "utc" }).setZone(timezone);

  if (!local.isValid) {
    throw new JournalReversalError(
      "INVALID_INPUT",
      `Unable to resolve reversalDate in tenant timezone ${timezone}.`,
    );
  }

  const dateOnly = local.toISODate();

  if (!dateOnly) {
    throw new JournalReversalError(
      "INVALID_INPUT",
      "Unable to resolve reversalDate.",
    );
  }

  return {
    dateOnly,
    databaseDate: new Date(`${dateOnly}T00:00:00.000Z`),
  };
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

function isDuplicateReversalViolation(error: unknown): boolean {
  if (!isPrismaCode(error, "P2002")) return false;

  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;

  const text = Array.isArray(target)
    ? target.join(",")
    : typeof target === "string"
      ? target
      : JSON.stringify(target ?? "");

  return (
    text.includes("journal_entries_tenantid_reversalofid_key") ||
    text.includes("journal_entries_tenantId_reversalOfId_key") ||
    (text.includes("tenantId") && text.includes("reversalOfId"))
  );
}

function isDuplicateReversalSourceViolation(error: unknown): boolean {
  if (!isPrismaCode(error, "P2002")) return false;

  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;

  const text = Array.isArray(target)
    ? target.join(",")
    : typeof target === "string"
      ? target
      : JSON.stringify(target ?? "");

  return (
    text.includes("journal_entries_source_idempotency_uidx") ||
    (
      text.includes("tenantId") &&
      text.includes("sourceType") &&
      text.includes("sourceId")
    )
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function validateTenantAndResolveDate(
  tx: ReversalClient,
  tenantId: string,
  reversalDate: Date,
): Promise<{
  timezone: string;
  dateOnly: string;
  databaseDate: Date;
}> {
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      status: true,
      timezone: true,
    },
  });

  if (!tenant || (tenant.status !== "TRIAL" && tenant.status !== "ACTIVE")) {
    throw new JournalReversalError(
      "TENANT_NOT_OPERATIONAL",
      "The tenant does not exist or is not operational.",
    );
  }

  const normalizedDate = normalizeJournalDate(
    reversalDate,
    tenant.timezone,
  );

  return {
    timezone: tenant.timezone,
    ...normalizedDate,
  };
}

async function validateOpenAccountingPeriod(
  tx: ReversalClient,
  tenantId: string,
  reversalDate: Date,
): Promise<void> {
  const period = await tx.fiscalPeriod.findFirst({
    where: {
      tenantId,
      startDate: { lte: reversalDate },
      endDate: { gte: reversalDate },
      status: "OPEN",
      fiscalYear: {
        status: "OPEN",
        startDate: { lte: reversalDate },
        endDate: { gte: reversalDate },
      },
    },
    select: { id: true },
  });

  if (!period) {
    throw new JournalReversalError(
      "PERIOD_NOT_OPEN",
      "The reversal date is not inside an open fiscal year and open fiscal period.",
    );
  }
}

async function reverseJournalInTransaction(
  tx: ReversalClient,
  input: ReverseJournalInput,
): Promise<ReversedJournalResult> {
  const tenantId = normalizeRequired(input.tenantId, "tenantId");
  const journalEntryId = normalizeRequired(
    input.journalEntryId,
    "journalEntryId",
  );
  const reversedById = normalizeRequired(
    input.reversedById,
    "reversedById",
  );
  const reason = normalizeReason(input.reason);

  const tenantContext = await validateTenantAndResolveDate(
    tx,
    tenantId,
    input.reversalDate,
  );

  await validateOpenAccountingPeriod(
    tx,
    tenantId,
    tenantContext.databaseDate,
  );

  const original = await tx.journalEntry.findUnique({
    where: {
      tenantId_id: {
        tenantId,
        id: journalEntryId,
      },
    },
    include: {
      lines: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!original) {
    throw new JournalReversalError(
      "JOURNAL_NOT_FOUND",
      "The journal entry does not exist in the tenant.",
    );
  }

  if (original.status === "REVERSED") {
    throw new JournalReversalError(
      "ALREADY_REVERSED",
      `Journal ${original.journalNumber} has already been reversed.`,
    );
  }

  if (original.status !== "POSTED") {
    throw new JournalReversalError(
      "JOURNAL_NOT_POSTED",
      `Only POSTED journals may be reversed. Journal ${original.journalNumber} is ${original.status}.`,
    );
  }

  if (original.reversalOfId !== null) {
    throw new JournalReversalError(
      "REVERSAL_OF_REVERSAL_NOT_ALLOWED",
      "A reversal journal cannot itself be reversed in reversal service V1.",
    );
  }

  if (original.lines.length < 2) {
    throw new JournalReversalError(
      "INVALID_ORIGINAL_JOURNAL",
      "The original posted journal does not contain the minimum required journal lines.",
    );
  }

  const existingReversal = await tx.journalEntry.findFirst({
    where: {
      tenantId,
      reversalOfId: original.id,
    },
    select: {
      id: true,
      journalNumber: true,
      status: true,
    },
  });

  if (existingReversal) {
    throw new JournalReversalError(
      "ALREADY_REVERSED",
      `Journal ${original.journalNumber} already has reversal journal ${existingReversal.journalNumber}.`,
    );
  }

  const allocation = await allocateDocumentNumberInTransaction(
    tx,
    tenantId,
    "JOURNAL",
    tenantContext.dateOnly,
  );

  const reversalDescription =
    `Reversal of ${original.journalNumber}: ${reason}`;

  const postedAt = new Date();

  try {
    const draftReversal = await tx.journalEntry.create({
      data: {
        tenantId,
        branchId: original.branchId,
        journalNumber: allocation.documentNumber,
        journalDate: tenantContext.databaseDate,
        description: reversalDescription,
        sourceType: "JOURNAL_REVERSAL",
        sourceId: original.id,
        currencyCode: original.currencyCode,
        exchangeRate: original.exchangeRate,
        status: "DRAFT",
        reversalOfId: original.id,
        createdById: reversedById,
        lines: {
          create: original.lines.map((line) => ({
            accountId: line.accountId,
            description:
              line.description == null
                ? `Reversal of ${original.journalNumber}`
                : `Reversal: ${line.description}`,
            debit: line.credit,
            credit: line.debit,
            customerId: line.customerId,
            supplierId: line.supplierId,
            employeeId: line.employeeId,
            projectId: line.projectId,
          })),
        },
      },
      select: {
        id: true,
      },
    });

    const reversalJournal = await tx.journalEntry.update({
      where: {
        tenantId_id: {
          tenantId,
          id: draftReversal.id,
        },
      },
      data: {
        status: "POSTED",
        postedAt,
        postedById: reversedById,
      },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const reversedOriginal = await tx.journalEntry.update({
      where: {
        tenantId_id: {
          tenantId,
          id: original.id,
        },
      },
      data: {
        status: "REVERSED",
      },
      select: {
        id: true,
        journalNumber: true,
        status: true,
      },
    });

    if (reversedOriginal.status !== "REVERSED") {
      throw new JournalReversalError(
        "INVALID_ORIGINAL_JOURNAL",
        "The original journal did not transition to REVERSED.",
      );
    }

    return {
      originalJournalId: reversedOriginal.id,
      originalJournalNumber: reversedOriginal.journalNumber,
      originalStatus: "REVERSED",
      reversalJournal: reversalJournal as ReversedJournalResult["reversalJournal"],
    };
  } catch (error) {
    if (
      isDuplicateReversalViolation(error) ||
      isDuplicateReversalSourceViolation(error)
    ) {
      throw new JournalReversalError(
        "ALREADY_REVERSED",
        `Journal ${original.journalNumber} has already been reversed.`,
      );
    }

    throw error;
  }
}

export async function reverseJournal(
  input: ReverseJournalInput,
): Promise<ReversedJournalResult> {
  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        (tx) => reverseJournalInTransaction(tx, input),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (
        error instanceof JournalReversalError &&
        error.code === "ALREADY_REVERSED"
      ) {
        throw error;
      }

      if (
        isDuplicateReversalViolation(error) ||
        isDuplicateReversalSourceViolation(error)
      ) {
        throw new JournalReversalError(
          "ALREADY_REVERSED",
          "This journal has already been reversed.",
        );
      }

      if (isSerializationConflict(error)) {
        if (attempt === SERIALIZABLE_MAX_ATTEMPTS) {
          throw new JournalReversalError(
            "TRANSACTION_WRITE_CONFLICT",
            "The journal could not be reversed because of a concurrent transaction. Please retry.",
          );
        }

        await sleep(SERIALIZABLE_RETRY_BASE_MS * attempt);
        continue;
      }

      throw error;
    }
  }

  throw new JournalReversalError(
    "TRANSACTION_WRITE_CONFLICT",
    "The journal could not be reversed because of a concurrent transaction.",
  );
}

export async function reverseJournalInExistingTransaction(
  tx: Prisma.TransactionClient,
  input: ReverseJournalInput,
): Promise<ReversedJournalResult> {
  return reverseJournalInTransaction(tx, input);
}