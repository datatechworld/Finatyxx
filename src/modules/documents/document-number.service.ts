import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import { prisma } from "../../db/prisma.js";
import type {
  DocumentSequenceType,
  Prisma,
} from "../../generated/prisma/client.js";

const DEFAULT_PADDING = 6;

const DOCUMENT_PREFIXES = {
  QUOTATION: "QUO",
  INVOICE: "INV",
  CREDIT_NOTE: "CN",
  RECEIPT: "REC",
  PURCHASE_REQUEST: "PR",
  PURCHASE_ORDER: "PO",
  GOODS_RECEIPT: "GRN",
  SUPPLIER_BILL: "BILL",
  SUPPLIER_PAYMENT: "SP",
  EXPENSE: "EXP",
  JOURNAL: "JRN",
  STOCK_TRANSFER: "ST",
  STOCK_COUNT: "SC",
  PAYROLL: "PAY",
} as const satisfies Record<DocumentSequenceType, string>;

export type DocumentSequenceDate = string | Date;

export type AllocatedDocumentNumber = {
  documentNumber: string;
  documentType: DocumentSequenceType;
  prefix: string;
  year: number;
  number: bigint;
  padding: number;
};

type SequenceRow = {
  prefix: string;
  year: number | null;
  allocatedNumber: bigint;
  padding: number;
};

type DocumentNumberDbClient =
  | typeof prisma
  | Prisma.TransactionClient;

export class DocumentNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentNumberError";
  }
}

function normalizeTenantId(tenantId: string): string {
  const normalized = tenantId.trim();

  if (!normalized) {
    throw new DocumentNumberError(
      "A valid tenant ID is required to allocate a document number."
    );
  }

  return normalized;
}

/**
 * Format a document number using padding as a minimum width.
 *
 * Examples with padding = 6:
 *
 *   1       -> 000001
 *   999999  -> 999999
 *   1000000 -> 1000000
 *
 * Padding must never impose a maximum sequence value. This is important
 * because the sequence number has already been atomically allocated by
 * PostgreSQL by the time formatting occurs.
 */
function formatDocumentNumber(
  prefix: string,
  year: number,
  number: bigint,
  padding: number
): string {
  const numericPart = number.toString();

  return `${prefix}-${year}-${numericPart.padStart(padding, "0")}`;
}

/**
 * Resolve the calendar year used by an annual document sequence.
 *
 * Finatyx supports two date semantics:
 *
 * 1. Date-only business values (`YYYY-MM-DD`)
 *
 *    These correspond to PostgreSQL DATE columns such as invoiceDate,
 *    journalDate and other accounting/document dates.
 *
 *    A date-only value is already a calendar date. It must NOT be
 *    converted through UTC or the tenant timezone because doing so can
 *    shift the date across a day/year boundary.
 *
 * 2. JavaScript Date values
 *
 *    These represent an actual instant in time. For those values, the
 *    instant is converted into the tenant's configured IANA timezone
 *    before resolving the calendar year.
 */
function resolveTenantYear(
  timezone: string,
  sequenceDate: DocumentSequenceDate
): number {
  if (typeof sequenceDate === "string") {
    const normalized = sequenceDate.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new DocumentNumberError(
        'A document date must use the exact "YYYY-MM-DD" format.'
      );
    }

    const dateOnly = DateTime.fromISO(normalized, {
      zone: "utc",
      setZone: true,
    });

    if (
      !dateOnly.isValid ||
      dateOnly.toISODate() !== normalized
    ) {
      throw new DocumentNumberError(
        `"${normalized}" is not a valid calendar date.`
      );
    }

    return dateOnly.year;
  }

  if (
    !(sequenceDate instanceof Date) ||
    Number.isNaN(sequenceDate.getTime())
  ) {
    throw new DocumentNumberError(
      "The supplied document-number allocation time is invalid."
    );
  }

  const instant = DateTime.fromJSDate(sequenceDate, {
    zone: "utc",
  });

  if (!instant.isValid) {
    throw new DocumentNumberError(
      "The supplied document-number allocation time is invalid."
    );
  }

  const local = instant.setZone(timezone);

  if (!local.isValid) {
    throw new DocumentNumberError(
      `Tenant timezone "${timezone}" is not a valid IANA timezone.`
    );
  }

  return local.year;
}

async function allocateWithClient(
  db: DocumentNumberDbClient,
  tenantIdInput: string,
  documentType: DocumentSequenceType,
  sequenceDate: DocumentSequenceDate
): Promise<AllocatedDocumentNumber> {
  const tenantId = normalizeTenantId(tenantIdInput);
  const prefix = DOCUMENT_PREFIXES[documentType];

  if (!prefix) {
    throw new DocumentNumberError(
      `Unsupported document sequence type: ${documentType}.`
    );
  }

  const tenant = await db.tenant.findUnique({
    where: {
      id: tenantId,
    },
    select: {
      id: true,
      timezone: true,
    },
  });

  if (!tenant) {
    throw new DocumentNumberError(
      "The Finatyx business does not exist."
    );
  }

  const year = resolveTenantYear(
    tenant.timezone,
    sequenceDate
  );

  const sequenceId = randomUUID();

  /*
   * Finatyx v1 uses tenant-wide document numbering.
   *
   * branchId remains NULL so all branches belonging to a tenant share
   * one sequence for each document type and calendar year.
   *
   * document_sequences_scope_uidx is a UNIQUE index over:
   *
   *   tenantId, branchId, documentType, year
   *
   * with NULLS NOT DISTINCT.
   *
   * That makes NULL branchId a valid tenant-wide conflict scope.
   *
   * nextNumber means the next sequence value still available.
   *
   * First allocation:
   *   allocate 1
   *   persist nextNumber = 2
   *
   * Existing sequence:
   *   allocate current nextNumber
   *   persist nextNumber + 1
   *
   * This is one atomic PostgreSQL statement. It can execute either
   * through the normal Prisma client or through an existing interactive
   * transaction.
   */
  const rows = await db.$queryRaw<SequenceRow[]>`
    INSERT INTO public.document_sequences (
      "id",
      "tenantId",
      "branchId",
      "documentType",
      "prefix",
      "year",
      "nextNumber",
      "padding",
      "updatedAt"
    )
    VALUES (
      ${sequenceId}::uuid,
      ${tenantId}::uuid,
      NULL,
      ${documentType}::public."DocumentSequenceType",
      ${prefix},
      ${year},
      2,
      ${DEFAULT_PADDING},
      NOW()
    )
    ON CONFLICT (
      "tenantId",
      "branchId",
      "documentType",
      "year"
    )
    DO UPDATE SET
      "nextNumber" =
        public.document_sequences."nextNumber" + 1,
      "updatedAt" = NOW()
    RETURNING
      "prefix",
      "year",
      "nextNumber" - 1 AS "allocatedNumber",
      "padding"
  `;

  const row = rows[0];

  if (!row) {
    throw new DocumentNumberError(
      "The document number could not be allocated."
    );
  }

  if (row.year === null) {
    throw new DocumentNumberError(
      "The document sequence returned an invalid year."
    );
  }

  if (row.allocatedNumber < 1n) {
    throw new DocumentNumberError(
      "The document sequence returned an invalid number."
    );
  }

  if (
    !Number.isSafeInteger(row.padding) ||
    row.padding < 1 ||
    row.padding > 20
  ) {
    throw new DocumentNumberError(
      "The document sequence returned invalid padding."
    );
  }

  const documentNumber = formatDocumentNumber(
    row.prefix,
    row.year,
    row.allocatedNumber,
    row.padding
  );

  return {
    documentNumber,
    documentType,
    prefix: row.prefix,
    year: row.year,
    number: row.allocatedNumber,
    padding: row.padding,
  };
}

/**
 * Allocate a document number as a standalone database operation.
 *
 * For business documents backed by PostgreSQL DATE fields, pass the
 * document date as an exact `YYYY-MM-DD` string:
 *
 *   allocateDocumentNumber(tenantId, "INVOICE", "2026-12-31")
 *
 * When omitted, the current instant is used and interpreted in the
 * tenant's configured timezone.
 *
 * Use the standalone allocator only when the allocation does not need
 * to participate in another database transaction.
 */
export async function allocateDocumentNumber(
  tenantId: string,
  documentType: DocumentSequenceType,
  sequenceDate: DocumentSequenceDate = new Date()
): Promise<AllocatedDocumentNumber> {
  return allocateWithClient(
    prisma,
    tenantId,
    documentType,
    sequenceDate
  );
}

/**
 * Allocate a document number inside an existing Prisma interactive
 * transaction.
 *
 * Financial/document creation services should normally use this
 * function so the sequence allocation and document creation either
 * commit together or roll back together.
 *
 * For PostgreSQL DATE-backed business dates, pass an exact
 * `YYYY-MM-DD` string rather than constructing a JavaScript Date.
 */
export async function allocateDocumentNumberInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentType: DocumentSequenceType,
  sequenceDate: DocumentSequenceDate = new Date()
): Promise<AllocatedDocumentNumber> {
  return allocateWithClient(
    tx,
    tenantId,
    documentType,
    sequenceDate
  );
}