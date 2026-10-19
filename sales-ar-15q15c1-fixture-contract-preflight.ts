import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const KNOWN_INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const KNOWN_PAYMENT_ID =
  "5c0d8611-5c78-4fb7-a709-e9f51f581a74";

async function main() {
  console.log(
    "=== 15Q.15C.1 FIXTURE CONTRACT PREFLIGHT ===",
  );

  /*
   * READ ONLY.
   *
   * Inspect the physical PostgreSQL columns rather than
   * guessing which fields a temporary Invoice / InvoiceItem /
   * Payment / PaymentAllocation fixture will require.
   *
   * All catalog values are explicitly cast to text because
   * Prisma + the pg adapter should not be asked to deserialize
   * PostgreSQL catalog-specific array/native types here.
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
        'invoices',
        'invoice_items',
        'payments',
        'payment_allocations'
      )
    ORDER BY
      table_name,
      ordinal_position
  `;

  const invoice =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: KNOWN_INVOICE_ID,
      },
      include: {
        items: true,
      },
    });

  const payment =
    await prisma.payment.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: KNOWN_PAYMENT_ID,
      },
      include: {
        allocations: true,
      },
    });

  if (!invoice) {
    throw new Error(
      "Known-good invoice fixture was not found.",
    );
  }

  if (!payment) {
    throw new Error(
      "Known-good payment fixture was not found.",
    );
  }

  const grouped = new Map<
    string,
    typeof columns
  >();

  for (const column of columns) {
    const existing =
      grouped.get(column.table_name) ?? [];

    existing.push(column);

    grouped.set(
      column.table_name,
      existing,
    );
  }

  console.log("");
  console.log("=== PHYSICAL COLUMN CONTRACTS ===");

  for (const tableName of [
    "invoices",
    "invoice_items",
    "payments",
    "payment_allocations",
  ]) {
    console.log("");
    console.log(`--- ${tableName} ---`);

    console.table(
      (grouped.get(tableName) ?? []).map(
        (column) => ({
          column: column.column_name,
          type:
            column.data_type === "USER-DEFINED"
              ? column.udt_name
              : column.data_type,
          nullable: column.is_nullable,
          default: column.column_default,
        }),
      ),
    );
  }

  console.log("");
  console.log(
    "=== KNOWN-GOOD INVOICE SHAPE ===",
  );

  console.log({
    id: invoice.id,
    tenantId: invoice.tenantId,
    branchId: invoice.branchId,
    customerId: invoice.customerId,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    currencyCode: invoice.currencyCode,
    exchangeRate: invoice.exchangeRate.toString(),
    subtotal: invoice.subtotal.toString(),
    discountTotal:
      invoice.discountTotal.toString(),
    taxTotal: invoice.taxTotal.toString(),
    total: invoice.total.toString(),
    amountPaid: invoice.amountPaid.toString(),
    balanceDue: invoice.balanceDue.toString(),
    status: invoice.status,
    postedAt: invoice.postedAt,
    paidAt: invoice.paidAt,
    itemCount: invoice.items.length,
  });

  console.log("");
  console.log(
    "=== KNOWN-GOOD INVOICE ITEM SHAPE ===",
  );

  console.log(
    invoice.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      invoiceId: item.invoiceId,
      description: item.description,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      discountAmount:
        item.discountAmount.toString(),
      taxAmount: item.taxAmount.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
  );

  console.log("");
  console.log(
    "=== KNOWN-GOOD PAYMENT SHAPE ===",
  );

  console.log({
    id: payment.id,
    tenantId: payment.tenantId,
    branchId: payment.branchId,
    customerId: payment.customerId,
    paymentNumber: payment.paymentNumber,
    paymentDate: payment.paymentDate,
    currencyCode: payment.currencyCode,
    exchangeRate: payment.exchangeRate.toString(),
    amount: payment.amount.toString(),
    unallocatedAmount:
      payment.unallocatedAmount.toString(),
    financialAccountId:
      payment.financialAccountId,
    reference: payment.reference,
    status: payment.status,
    postedAt: payment.postedAt,
    receivedById: payment.receivedById,
    allocationCount:
      payment.allocations.length,
  });

  console.log("");
  console.log(
    "=== KNOWN-GOOD PAYMENT ALLOCATION SHAPE ===",
  );

  console.log(
    payment.allocations.map(
      (allocation) => ({
        id: allocation.id,
        tenantId: allocation.tenantId,
        paymentId: allocation.paymentId,
        invoiceId: allocation.invoiceId,
        amount: allocation.amount.toString(),
      }),
    ),
  );

  /*
   * Verify the exact foundation that the next test depends on.
   */

  const assertions = {
    requiredTablesVisible:
      grouped.has("invoices") &&
      grouped.has("invoice_items") &&
      grouped.has("payments") &&
      grouped.has("payment_allocations"),

    knownInvoiceAvailable:
      invoice.tenantId === TENANT_ID &&
      invoice.items.length > 0,

    knownPaymentAvailable:
      payment.tenantId === TENANT_ID &&
      payment.allocations.length === 1,

    knownPaymentFullyAllocated:
      payment.amount.equals(550) &&
      payment.unallocatedAmount.equals(0) &&
      payment.allocations[0]!.amount.equals(550),

    frozenSettlementPreserved:
      invoice.total.equals(1150) &&
      invoice.amountPaid.equals(1150) &&
      invoice.balanceDue.equals(0) &&
      invoice.status === "PAID" &&
      invoice.paidAt !== null,
  };

  console.log("");
  console.log("=== ASSERTIONS ===");
  console.table(assertions);

  const passed =
    Object.values(assertions).every(Boolean);

  if (!passed) {
    throw new Error(
      "15Q.15C.1 fixture-contract preflight failed.",
    );
  }

  console.log("");
  console.log(
    "15Q.15C.1 FIXTURE CONTRACT PREFLIGHT: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.15C.1 FIXTURE CONTRACT PREFLIGHT: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });