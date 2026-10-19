import { Prisma } from "./src/generated/prisma/client.ts";
import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const CUSTOMER_ID =
  "ab359555-fbf8-469a-8b05-83f7a232badc";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const LEDGER_ID =
  "df4da203-7414-444a-8735-a61a51739e74";

const JOURNAL_ID =
  "fb951c7f-7d65-4c80-9855-50b60affec1b";

const ZERO = new Prisma.Decimal("0");
const SUBTOTAL = new Prisma.Decimal("1000");
const TAX = new Prisma.Decimal("150");
const TOTAL = new Prisma.Decimal("1150");

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertDecimal(
  actual: Prisma.Decimal,
  expected: Prisma.Decimal,
  label: string,
): void {
  if (!actual.eq(expected)) {
    throw new Error(
      `ASSERTION FAILED: ${label}: expected ${expected.toString()}, received ${actual.toString()}`,
    );
  }
}

async function main() {
  console.log(
    "=== 15Q.10G SALES/AR FINAL PHYSICAL VERIFIER ===",
  );

  console.log("");
  console.log("=== INVOICE ===");

  const invoice =
    await prisma.invoice.findUniqueOrThrow({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: INVOICE_ID,
        },
      },
      include: {
        items: true,
      },
    });

  console.log({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    status: invoice.status,
    subtotal: invoice.subtotal.toString(),
    discountTotal:
      invoice.discountTotal.toString(),
    taxTotal: invoice.taxTotal.toString(),
    roundingAdjustment:
      invoice.roundingAdjustment.toString(),
    total: invoice.total.toString(),
    amountPaid: invoice.amountPaid.toString(),
    balanceDue: invoice.balanceDue.toString(),
    currencyCode: invoice.currencyCode,
    exchangeRate: invoice.exchangeRate.toString(),
    postedAt: invoice.postedAt,
    itemCount: invoice.items.length,
  });

  assert(
    invoice.customerId === CUSTOMER_ID,
    "invoice customer mismatch",
  );

  assert(
    invoice.status === "POSTED",
    "invoice must be POSTED",
  );

  assert(
    invoice.postedAt !== null,
    "invoice postedAt must exist",
  );

  assert(
    invoice.items.length === 1,
    "invoice must have exactly one item",
  );

  assertDecimal(
    invoice.subtotal,
    SUBTOTAL,
    "invoice subtotal",
  );

  assertDecimal(
    invoice.taxTotal,
    TAX,
    "invoice tax",
  );

  assertDecimal(
    invoice.total,
    TOTAL,
    "invoice total",
  );

  assertDecimal(
    invoice.amountPaid,
    ZERO,
    "invoice amount paid",
  );

  assertDecimal(
    invoice.balanceDue,
    TOTAL,
    "invoice balance due",
  );

  console.log("PASS invoice persistence");

  console.log("");
  console.log("=== CUSTOMER SUBLEDGER ===");

  const ledgerEntries =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SALES_INVOICE",
        referenceId: INVOICE_ID,
      },
    });

  console.log(
    ledgerEntries.map((entry) => ({
      id: entry.id,
      customerId: entry.customerId,
      entryType: entry.entryType,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      debit: entry.debit.toString(),
      credit: entry.credit.toString(),
      currencyCode: entry.currencyCode,
    })),
  );

  assert(
    ledgerEntries.length === 1,
    "exactly one invoice ledger entry must exist",
  );

  const ledger = ledgerEntries[0];

  assert(
    ledger.id === LEDGER_ID,
    "unexpected customer ledger entry",
  );

  assert(
    ledger.customerId === CUSTOMER_ID,
    "ledger customer mismatch",
  );

  assert(
    ledger.entryType === "INVOICE",
    "ledger entryType must be INVOICE",
  );

  assert(
    ledger.referenceType === "SALES_INVOICE",
    "ledger referenceType must be SALES_INVOICE",
  );

  assertDecimal(
    ledger.debit,
    TOTAL,
    "ledger debit",
  );

  assertDecimal(
    ledger.credit,
    ZERO,
    "ledger credit",
  );

  assert(
    ledger.currencyCode === "GHS",
    "ledger currency must be GHS",
  );

  console.log("PASS AR subledger persistence");

  console.log("");
  console.log("=== GENERAL LEDGER ===");

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SALES_INVOICE",
        sourceId: INVOICE_ID,
      },
      include: {
        lines: {
          include: {
            account: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

  assert(
    journals.length === 1,
    "exactly one SALES_INVOICE journal must exist",
  );

  const journal = journals[0];

  console.log({
    id: journal.id,
    journalNumber: journal.journalNumber,
    status: journal.status,
    sourceType: journal.sourceType,
    sourceId: journal.sourceId,
    currencyCode: journal.currencyCode,
    exchangeRate: journal.exchangeRate.toString(),
    lineCount: journal.lines.length,
  });

  console.log(
    journal.lines.map((line) => ({
      accountCode: line.account.code,
      accountName: line.account.name,
      debit: line.debit.toString(),
      credit: line.credit.toString(),
      customerId: line.customerId,
    })),
  );

  assert(
    journal.id === JOURNAL_ID,
    "unexpected GL journal",
  );

  assert(
    journal.status === "POSTED",
    "journal must remain POSTED",
  );

  assert(
    journal.sourceType === "SALES_INVOICE",
    "journal sourceType mismatch",
  );

  assert(
    journal.sourceId === INVOICE_ID,
    "journal sourceId mismatch",
  );

  assert(
    journal.currencyCode === "GHS",
    "journal currency mismatch",
  );

  assert(
    journal.lines.length === 3,
    "journal must contain exactly three lines",
  );

  const ar = journal.lines.find(
    (line) => line.account.code === "1200",
  );

  const revenue = journal.lines.find(
    (line) => line.account.code === "4100",
  );

  const tax = journal.lines.find(
    (line) => line.account.code === "2200",
  );

  assert(ar !== undefined, "AR line missing");
  assert(
    revenue !== undefined,
    "Sales Revenue line missing",
  );
  assert(
    tax !== undefined,
    "Output Tax line missing",
  );

  assertDecimal(ar.debit, TOTAL, "AR debit");
  assertDecimal(ar.credit, ZERO, "AR credit");

  assertDecimal(
    revenue.debit,
    ZERO,
    "Sales Revenue debit",
  );
  assertDecimal(
    revenue.credit,
    SUBTOTAL,
    "Sales Revenue credit",
  );

  assertDecimal(
    tax.debit,
    ZERO,
    "Output Tax debit",
  );
  assertDecimal(
    tax.credit,
    TAX,
    "Output Tax credit",
  );

  for (const line of journal.lines) {
    assert(
      line.customerId === CUSTOMER_ID,
      `customer dimension missing from journal line ${line.id}`,
    );
  }

  const debitTotal = journal.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    ZERO,
  );

  const creditTotal = journal.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    ZERO,
  );

  assertDecimal(
    debitTotal,
    TOTAL,
    "journal debit total",
  );

  assertDecimal(
    creditTotal,
    TOTAL,
    "journal credit total",
  );

  assert(
    debitTotal.eq(creditTotal),
    "journal is not balanced",
  );

  console.log("PASS GL persistence and balance");

  console.log("");
  console.log("=== SOURCE IDEMPOTENCY ===");

  const customerSourceCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SALES_INVOICE",
        referenceId: INVOICE_ID,
      },
    });

  const journalSourceCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SALES_INVOICE",
        sourceId: INVOICE_ID,
      },
    });

  console.log({
    customerSourceCount,
    journalSourceCount,
  });

  assert(
    customerSourceCount === 1,
    "customer source identity must be unique",
  );

  assert(
    journalSourceCount === 1,
    "journal source identity must be unique",
  );

  console.log("PASS source idempotency");

  console.log("");
  console.log(
    "========================================",
  );
  console.log(
    "15Q.10G SALES/AR FINAL PHYSICAL VERIFIER: PASS",
  );
  console.log(
    "========================================",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "========================================",
    );
    console.error(
      "15Q.10G SALES/AR FINAL PHYSICAL VERIFIER: FAILED",
    );
    console.error(
      "========================================",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });