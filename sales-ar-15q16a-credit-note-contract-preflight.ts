import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const FROZEN_INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const REQUIRED_PURPOSES = [
  "ACCOUNTS_RECEIVABLE",
  "SALES_REVENUE",
  "SALES_RETURNS",
  "OUTPUT_TAX",
] as const;

async function main() {
  console.log(
    "=== 15Q.16A CREDIT NOTE CONTRACT PREFLIGHT ===",
  );

  /*
   * READ ONLY.
   *
   * PostgreSQL catalog/native values are cast to text so the
   * Prisma pg adapter only needs to deserialize ordinary
   * supported scalar values.
   */

  const columns = await prisma.$queryRaw<
    Array<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>
  >`
    SELECT
      table_name::text AS table_name,
      column_name::text AS column_name,
      data_type::text AS data_type,
      udt_name::text AS udt_name,
      is_nullable::text AS is_nullable,
      column_default::text AS column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'credit_notes',
        'credit_note_items'
      )
    ORDER BY
      table_name,
      ordinal_position
  `;

  const constraints = await prisma.$queryRaw<
    Array<{
      table_name: string;
      constraint_name: string;
      constraint_type: string;
      definition: string;
    }>
  >`
    SELECT
      c.relname::text AS table_name,
      con.conname::text AS constraint_name,
      CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
        WHEN 'x' THEN 'EXCLUSION'
        ELSE con.contype::text
      END::text AS constraint_type,
      pg_get_constraintdef(con.oid)::text
        AS definition
    FROM pg_constraint con
    JOIN pg_class c
      ON c.oid = con.conrelid
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'credit_notes',
        'credit_note_items'
      )
    ORDER BY
      c.relname,
      con.conname
  `;

  const indexes = await prisma.$queryRaw<
    Array<{
      table_name: string;
      index_name: string;
      index_definition: string;
    }>
  >`
    SELECT
      tablename::text AS table_name,
      indexname::text AS index_name,
      indexdef::text AS index_definition
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (
        'credit_notes',
        'credit_note_items'
      )
    ORDER BY
      tablename,
      indexname
  `;

  const enums = await prisma.$queryRaw<
    Array<{
      enum_name: string;
      enum_value: string;
      sort_order: string;
    }>
  >`
    SELECT
      t.typname::text AS enum_name,
      e.enumlabel::text AS enum_value,
      e.enumsortorder::text AS sort_order
    FROM pg_type t
    JOIN pg_enum e
      ON t.oid = e.enumtypid
    JOIN pg_namespace n
      ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND (
        t.typname ILIKE '%credit%'
        OR t.typname = 'DocumentSequenceType'
      )
    ORDER BY
      t.typname,
      e.enumsortorder
  `;

  console.log("");
  console.log(
    "=== CREDIT NOTE PHYSICAL COLUMNS ===",
  );

  for (const tableName of [
    "credit_notes",
    "credit_note_items",
  ]) {
    console.log("");
    console.log(`--- ${tableName} ---`);

    console.table(
      columns
        .filter(
          (column) =>
            column.table_name === tableName,
        )
        .map((column) => ({
          column: column.column_name,
          type:
            column.data_type === "USER-DEFINED"
              ? column.udt_name
              : column.data_type,
          nullable: column.is_nullable,
          default: column.column_default,
        })),
    );
  }

  console.log("");
  console.log(
    "=== CREDIT NOTE CONSTRAINTS ===",
  );
  console.table(constraints);

  console.log("");
  console.log(
    "=== CREDIT NOTE INDEXES ===",
  );
  console.table(indexes);

  console.log("");
  console.log(
    "=== RELEVANT ENUM VALUES ===",
  );
  console.table(enums);

  /*
   * Existing business records.
   */

  const creditNoteCount =
    await prisma.creditNote.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const creditNoteItemCount =
    await prisma.creditNoteItem.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const existingCreditNotes =
    await prisma.creditNote.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      take: 5,
      orderBy: {
        createdAt: "asc",
      },
      include: {
        items: true,
      },
    });

  console.log("");
  console.log(
    "=== EXISTING CREDIT NOTE STATE ===",
  );
  console.log({
    creditNoteCount,
    creditNoteItemCount,
  });

  console.log(
    existingCreditNotes.map(
      (creditNote) => ({
        id: creditNote.id,
        creditNoteNumber:
          creditNote.creditNoteNumber,
        customerId: creditNote.customerId,
        invoiceId: creditNote.invoiceId,
        creditNoteDate:
          creditNote.creditNoteDate,
        currencyCode:
          creditNote.currencyCode,
        exchangeRate:
          creditNote.exchangeRate.toString(),
        subtotal:
          creditNote.subtotal.toString(),
        taxTotal:
          creditNote.taxTotal.toString(),
        total: creditNote.total.toString(),
        status: creditNote.status,
        itemCount: creditNote.items.length,
      }),
    ),
  );

  /*
   * Frozen sales context.
   */

  const invoice =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FROZEN_INVOICE_ID,
      },
      include: {
        customer: true,
        items: true,
      },
    });

  if (!invoice) {
    throw new Error(
      "Frozen sales invoice was not found.",
    );
  }

  console.log("");
  console.log(
    "=== FROZEN SALES CONTEXT ===",
  );

  console.log({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    branchId: invoice.branchId,
    customerId: invoice.customerId,
    customerStatus: invoice.customer.status,
    currencyCode: invoice.currencyCode,
    exchangeRate:
      invoice.exchangeRate.toString(),
    subtotal: invoice.subtotal.toString(),
    taxTotal: invoice.taxTotal.toString(),
    total: invoice.total.toString(),
    amountPaid:
      invoice.amountPaid.toString(),
    balanceDue:
      invoice.balanceDue.toString(),
    status: invoice.status,
    itemCount: invoice.items.length,
  });

  /*
   * Accounting mappings.
   */

  const mappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
        purpose: {
          in: [...REQUIRED_PURPOSES],
        },
      },
      include: {
        account: true,
      },
      orderBy: {
        purpose: "asc",
      },
    });

  console.log("");
  console.log(
    "=== CREDIT NOTE ACCOUNTING MAPPINGS ===",
  );

  console.table(
    mappings.map((mapping) => ({
      purpose: mapping.purpose,
      accountId: mapping.accountId,
      accountCode: mapping.account.code,
      accountName: mapping.account.name,
      accountType:
        mapping.account.type,
      normalBalance:
        mapping.account.normalBalance,
      accountStatus:
        mapping.account.status,
    })),
  );

  /*
   * Document sequence support.
   *
   * This does not allocate a number.
   */

  const creditNoteSequence =
    await prisma.documentSequence.findMany({
      where: {
        tenantId: TENANT_ID,
        documentType: "CREDIT_NOTE",
      },
      orderBy: {
        year: "asc",
      },
    });

  console.log("");
  console.log(
    "=== CREDIT NOTE DOCUMENT SEQUENCE ===",
  );

  console.log(
    creditNoteSequence.map(
      (sequence) => ({
        id: sequence.id,
        branchId: sequence.branchId,
        documentType:
          sequence.documentType,
        prefix: sequence.prefix,
        year: sequence.year,
        nextNumber:
          sequence.nextNumber.toString(),
        padding: sequence.padding,
      }),
    ),
  );

  /*
   * Existing customer-ledger vocabulary. We inspect distinct
   * entry/reference combinations without changing anything.
   */

  const ledgerVocabulary =
    await prisma.$queryRaw<
      Array<{
        entry_type: string;
        reference_type: string;
        row_count: string;
      }>
    >`
      SELECT
        "entryType"::text AS entry_type,
        "referenceType"::text AS reference_type,
        COUNT(*)::text AS row_count
      FROM public.customer_ledger_entries
      WHERE "tenantId" =
        ${TENANT_ID}::uuid
      GROUP BY
        "entryType",
        "referenceType"
      ORDER BY
        "entryType",
        "referenceType"
    `;

  console.log("");
  console.log(
    "=== CUSTOMER LEDGER VOCABULARY ===",
  );
  console.table(ledgerVocabulary);

  /*
   * Determine whether the existing physical schema exposes the
   * minimum fields needed for a controlled posting service.
   */

  const creditNoteColumns = new Set(
    columns
      .filter(
        (column) =>
          column.table_name ===
          "credit_notes",
      )
      .map(
        (column) => column.column_name,
      ),
  );

  const creditNoteItemColumns = new Set(
    columns
      .filter(
        (column) =>
          column.table_name ===
          "credit_note_items",
      )
      .map(
        (column) => column.column_name,
      ),
  );

  const requiredCreditNoteColumns = [
    "id",
    "tenantId",
    "branchId",
    "customerId",
    "invoiceId",
    "creditNoteNumber",
    "creditNoteDate",
    "currencyCode",
    "exchangeRate",
    "subtotal",
    "taxTotal",
    "total",
    "status",
  ];

  const requiredItemColumns = [
    "id",
    "tenantId",
    "creditNoteId",
    "description",
    "quantity",
    "unitPrice",
    "taxRate",
    "taxAmount",
    "lineTotal",
  ];

  const documentTypeSupported =
    enums.some(
      (value) =>
        value.enum_name ===
          "DocumentSequenceType" &&
        value.enum_value ===
          "CREDIT_NOTE",
    );

  const mappingsByPurpose =
    new Map(
      mappings.map((mapping) => [
        mapping.purpose,
        mapping,
      ]),
    );

  const requiredMappingsAvailable =
    REQUIRED_PURPOSES.every(
      (purpose) =>
        mappingsByPurpose.has(purpose),
    );

  const requiredMappingsActive =
    REQUIRED_PURPOSES.every(
      (purpose) =>
        mappingsByPurpose.get(purpose)
          ?.account.status === "ACTIVE",
    );

  const assertions = {
    creditNoteTableExists:
      columns.some(
        (column) =>
          column.table_name ===
          "credit_notes",
      ),

    creditNoteItemTableExists:
      columns.some(
        (column) =>
          column.table_name ===
          "credit_note_items",
      ),

    creditNoteColumnsReady:
      requiredCreditNoteColumns.every(
        (column) =>
          creditNoteColumns.has(column),
      ),

    creditNoteItemColumnsReady:
      requiredItemColumns.every(
        (column) =>
          creditNoteItemColumns.has(column),
      ),

    creditNoteDocumentTypeSupported:
      documentTypeSupported,

    requiredMappingsAvailable,

    requiredMappingsActive,

    frozenInvoicePreserved:
      invoice.tenantId === TENANT_ID &&
      invoice.branchId === BRANCH_ID &&
      invoice.currencyCode === "GHS" &&
      invoice.exchangeRate.equals(1) &&
      invoice.total.equals(1150) &&
      invoice.amountPaid.equals(1150) &&
      invoice.balanceDue.equals(0) &&
      invoice.status === "PAID",

    customerAvailable:
      invoice.customer.tenantId ===
        TENANT_ID &&
      invoice.customer.status === "ACTIVE",
  };

  console.log("");
  console.log(
    "=== 15Q.16A ASSERTIONS ===",
  );
  console.table(assertions);

  const passed =
    Object.values(assertions).every(Boolean);

  if (!passed) {
    throw new Error(
      "15Q.16A credit-note contract preflight failed.",
    );
  }

  console.log("");
  console.log(
    "15Q.16A CREDIT NOTE CONTRACT PREFLIGHT: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.16A CREDIT NOTE CONTRACT PREFLIGHT: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });