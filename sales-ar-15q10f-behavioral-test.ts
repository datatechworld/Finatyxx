import { Prisma } from "./src/generated/prisma/client.ts";
import { prisma } from "./src/db/prisma.ts";
import { postSalesInvoice } from "./src/modules/sales/sales-invoice-posting.service.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const USER_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const CUSTOMER_ID =
  "ab359555-fbf8-469a-8b05-83f7a232badc";

const INVOICE_DATE =
  new Date("2098-06-15T00:00:00.000Z");

const DUE_DATE =
  new Date("2098-06-30T00:00:00.000Z");

const ZERO = new Prisma.Decimal("0.0000");
const ONE = new Prisma.Decimal("1.0000");
const SUBTOTAL = new Prisma.Decimal("1000.0000");
const TAX = new Prisma.Decimal("150.0000");
const TOTAL = new Prisma.Decimal("1150.0000");

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
      `ASSERTION FAILED: ${label}. Expected ${expected.toString()}, received ${actual.toString()}.`,
    );
  }
}

async function main() {
  console.log(
    "=== 15Q.10F V2 SALES INVOICE BEHAVIORAL TEST ===",
  );
  console.log("");

  /*
   * V1 created the customer successfully but failed before
   * creating an invoice. V2 deliberately reuses that isolated
   * customer rather than creating another fixture.
   */
  console.log("=== VERIFY ISOLATED TEST CUSTOMER ===");

  const customer = await prisma.customer.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: CUSTOMER_ID,
      },
    },
    select: {
      id: true,
      customerCode: true,
      name: true,
      currencyCode: true,
      status: true,
    },
  });

  assert(
    customer !== null,
    "isolated V1 test customer must exist",
  );

  assert(
    customer.status === "ACTIVE",
    "isolated test customer must be ACTIVE",
  );

  assert(
    customer.currencyCode === "GHS",
    "isolated test customer must use GHS",
  );

  console.log(customer);

  const existingInvoices =
    await prisma.invoice.count({
      where: {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
      },
    });

  const existingLedger =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
      },
    });

  assert(
    existingInvoices === 0,
    "test customer must have zero invoices before V2",
  );

  assert(
    existingLedger === 0,
    "test customer must have zero ledger entries before V2",
  );

  console.log(
    "PASS isolated customer is clean for V2",
  );

  console.log("");
  console.log("=== BASELINE COUNTS ===");

  const baseline = {
    customers: await prisma.customer.count({
      where: { tenantId: TENANT_ID },
    }),
    invoices: await prisma.invoice.count({
      where: { tenantId: TENANT_ID },
    }),
    invoiceItems: await prisma.invoiceItem.count({
      where: { tenantId: TENANT_ID },
    }),
    customerLedgerEntries:
      await prisma.customerLedgerEntry.count({
        where: { tenantId: TENANT_ID },
      }),
    journals: await prisma.journalEntry.count({
      where: { tenantId: TENANT_ID },
    }),
  };

  console.log(baseline);

  const unique =
    `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  const invoiceNumber =
    `INV-ARTEST-V2-${unique}`.slice(0, 80);

  console.log("");
  console.log("=== TEST IDENTITY ===");
  console.log({
    customerId: CUSTOMER_ID,
    invoiceNumber,
  });

  console.log("");
  console.log("=== CREATE DRAFT INVOICE HEADER ===");

  /*
   * Header and line are intentionally created separately.
   * This follows the exact generated Prisma unchecked-create
   * contracts and avoids mixing scalar relation IDs with a
   * nested checked-create branch.
   */
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      customerId: CUSTOMER_ID,
      invoiceNumber,
      invoiceDate: INVOICE_DATE,
      dueDate: DUE_DATE,
      currencyCode: "GHS",
      exchangeRate: new Prisma.Decimal("1.00000000"),
      subtotal: SUBTOTAL,
      discountTotal: ZERO,
      taxTotal: TAX,
      roundingAdjustment: ZERO,
      total: TOTAL,
      amountPaid: ZERO,
      balanceDue: TOTAL,
      status: "DRAFT",
      notes:
        "15Q.10F V2 isolated Sales/AR behavioral test fixture.",
      createdById: USER_ID,
    },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      subtotal: true,
      taxTotal: true,
      total: true,
      amountPaid: true,
      balanceDue: true,
    },
  });

  console.log({
    ...invoice,
    subtotal: invoice.subtotal.toString(),
    taxTotal: invoice.taxTotal.toString(),
    total: invoice.total.toString(),
    amountPaid: invoice.amountPaid.toString(),
    balanceDue: invoice.balanceDue.toString(),
  });

  assert(
    invoice.status === "DRAFT",
    "fixture invoice must begin in DRAFT",
  );

  console.log("");
  console.log("=== CREATE INVOICE ITEM ===");

  const item = await prisma.invoiceItem.create({
    data: {
      tenantId: TENANT_ID,
      invoiceId: invoice.id,
      description: "15Q.10F V2 Test Sale",
      quantity: ONE,
      unitPrice: SUBTOTAL,
      discountPercent:
        new Prisma.Decimal("0.000000"),
      discountAmount: ZERO,
      taxRate:
        new Prisma.Decimal("15.000000"),
      taxAmount: TAX,
      lineSubtotal: SUBTOTAL,
      lineTotal: TOTAL,
      sortOrder: 1,
    },
    select: {
      id: true,
      invoiceId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      discountAmount: true,
      taxRate: true,
      taxAmount: true,
      lineSubtotal: true,
      lineTotal: true,
    },
  });

  console.log({
    ...item,
    quantity: item.quantity.toString(),
    unitPrice: item.unitPrice.toString(),
    discountAmount:
      item.discountAmount.toString(),
    taxRate: item.taxRate.toString(),
    taxAmount: item.taxAmount.toString(),
    lineSubtotal:
      item.lineSubtotal.toString(),
    lineTotal: item.lineTotal.toString(),
  });

  console.log("");
  console.log("=== VERIFY FIXTURE BEFORE POSTING ===");

  const fixture =
    await prisma.invoice.findUniqueOrThrow({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: invoice.id,
        },
      },
      include: {
        items: true,
      },
    });

  assert(
    fixture.status === "DRAFT",
    "fixture must remain DRAFT before posting",
  );

  assert(
    fixture.items.length === 1,
    "fixture must contain exactly one item",
  );

  assertDecimal(
    fixture.subtotal,
    SUBTOTAL,
    "fixture subtotal",
  );

  assertDecimal(
    fixture.taxTotal,
    TAX,
    "fixture taxTotal",
  );

  assertDecimal(
    fixture.total,
    TOTAL,
    "fixture total",
  );

  console.log(
    "PASS fixture is internally consistent",
  );

  console.log("");
  console.log("=== POST SALES INVOICE ===");

  const result = await postSalesInvoice({
    tenantId: TENANT_ID,
    invoiceId: invoice.id,
    postedById: USER_ID,
  });

  console.log({
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
    status: result.status,
    total: result.total.toString(),
    amountPaid: result.amountPaid.toString(),
    balanceDue: result.balanceDue.toString(),
    customerLedgerEntryId:
      result.customerLedgerEntryId,
    journalId: result.journal.id,
    journalNumber: result.journal.journalNumber,
    journalStatus: result.journal.status,
  });

  console.log("");
  console.log("=== VERIFY POSTED INVOICE ===");

  const postedInvoice =
    await prisma.invoice.findUniqueOrThrow({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: invoice.id,
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        postedAt: true,
        subtotal: true,
        discountTotal: true,
        taxTotal: true,
        roundingAdjustment: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        currencyCode: true,
        exchangeRate: true,
      },
    });

  console.log({
    ...postedInvoice,
    subtotal: postedInvoice.subtotal.toString(),
    discountTotal:
      postedInvoice.discountTotal.toString(),
    taxTotal: postedInvoice.taxTotal.toString(),
    roundingAdjustment:
      postedInvoice.roundingAdjustment.toString(),
    total: postedInvoice.total.toString(),
    amountPaid:
      postedInvoice.amountPaid.toString(),
    balanceDue:
      postedInvoice.balanceDue.toString(),
    exchangeRate:
      postedInvoice.exchangeRate.toString(),
  });

  assert(
    postedInvoice.status === "POSTED",
    "invoice status must be POSTED",
  );

  assert(
    postedInvoice.postedAt !== null,
    "postedAt must be populated",
  );

  assertDecimal(
    postedInvoice.total,
    TOTAL,
    "invoice total",
  );

  assertDecimal(
    postedInvoice.amountPaid,
    ZERO,
    "invoice amountPaid",
  );

  assertDecimal(
    postedInvoice.balanceDue,
    TOTAL,
    "invoice balanceDue",
  );

  console.log("PASS posted invoice");

  console.log("");
  console.log("=== VERIFY CUSTOMER SUBLEDGER ===");

  const ledgerEntries =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SALES_INVOICE",
        referenceId: invoice.id,
      },
      orderBy: {
        createdAt: "asc",
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
    "exactly one customer ledger entry must exist",
  );

  const ledger = ledgerEntries[0];

  assert(
    ledger.customerId === CUSTOMER_ID,
    "ledger customer must match invoice customer",
  );

  assert(
    ledger.entryType === "INVOICE",
    "customer ledger entryType must be INVOICE",
  );

  assert(
    ledger.referenceType === "SALES_INVOICE",
    "customer ledger referenceType must be SALES_INVOICE",
  );

  assertDecimal(
    ledger.debit,
    TOTAL,
    "customer ledger debit",
  );

  assertDecimal(
    ledger.credit,
    ZERO,
    "customer ledger credit",
  );

  assert(
    ledger.currencyCode === "GHS",
    "customer ledger currency must be GHS",
  );

  console.log("PASS customer subledger");

  console.log("");
  console.log("=== VERIFY GENERAL LEDGER ===");

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SALES_INVOICE",
        sourceId: invoice.id,
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
          orderBy: {
            createdAt: "asc",
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
    journal.status === "POSTED",
    "journal must be POSTED",
  );

  assert(
    journal.sourceType === "SALES_INVOICE",
    "journal sourceType must be SALES_INVOICE",
  );

  assert(
    journal.sourceId === invoice.id,
    "journal sourceId must equal invoice id",
  );

  assert(
    journal.currencyCode === "GHS",
    "journal currency must be GHS",
  );

  assertDecimal(
    journal.exchangeRate,
    ONE,
    "journal exchange rate",
  );

  assert(
    journal.lines.length === 3,
    "journal must contain exactly three lines",
  );

  const arLine = journal.lines.find(
    (line) => line.account.code === "1200",
  );

  const revenueLine = journal.lines.find(
    (line) => line.account.code === "4100",
  );

  const taxLine = journal.lines.find(
    (line) => line.account.code === "2200",
  );

  assert(
    arLine !== undefined,
    "AR 1200 line must exist",
  );

  assert(
    revenueLine !== undefined,
    "Sales Revenue 4100 line must exist",
  );

  assert(
    taxLine !== undefined,
    "Output Tax 2200 line must exist",
  );

  assertDecimal(
    arLine.debit,
    TOTAL,
    "AR debit",
  );

  assertDecimal(
    arLine.credit,
    ZERO,
    "AR credit",
  );

  assertDecimal(
    revenueLine.debit,
    ZERO,
    "Sales Revenue debit",
  );

  assertDecimal(
    revenueLine.credit,
    SUBTOTAL,
    "Sales Revenue credit",
  );

  assertDecimal(
    taxLine.debit,
    ZERO,
    "Output Tax debit",
  );

  assertDecimal(
    taxLine.credit,
    TAX,
    "Output Tax credit",
  );

  for (const line of journal.lines) {
    assert(
      line.customerId === CUSTOMER_ID,
      `journal line ${line.id} must carry the customer dimension`,
    );
  }

  const totalDebit = journal.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    ZERO,
  );

  const totalCredit = journal.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    ZERO,
  );

  assertDecimal(
    totalDebit,
    TOTAL,
    "journal total debit",
  );

  assertDecimal(
    totalCredit,
    TOTAL,
    "journal total credit",
  );

  assert(
    totalDebit.eq(totalCredit),
    "journal must balance",
  );

  console.log("PASS general ledger");

  console.log("");
  console.log("=== VERIFY DUPLICATE POSTING DEFENSE ===");

  let duplicateRejected = false;
  let duplicateMessage = "";

  try {
    await postSalesInvoice({
      tenantId: TENANT_ID,
      invoiceId: invoice.id,
      postedById: USER_ID,
    });
  } catch (error) {
    duplicateRejected = true;

    duplicateMessage =
      error instanceof Error
        ? error.message
        : String(error);

    console.log({
      name:
        error instanceof Error
          ? error.name
          : typeof error,
      message: duplicateMessage,
    });
  }

  assert(
    duplicateRejected,
    "second posting attempt must be rejected",
  );

  const duplicateLedgerCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SALES_INVOICE",
        referenceId: invoice.id,
      },
    });

  const duplicateJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SALES_INVOICE",
        sourceId: invoice.id,
      },
    });

  assert(
    duplicateLedgerCount === 1,
    "duplicate attempt must not create another customer ledger entry",
  );

  assert(
    duplicateJournalCount === 1,
    "duplicate attempt must not create another journal",
  );

  console.log(
    "PASS duplicate posting defense",
  );

  console.log("");
  console.log("=== FINAL COUNTS ===");

  const finalCounts = {
    customers: await prisma.customer.count({
      where: { tenantId: TENANT_ID },
    }),
    invoices: await prisma.invoice.count({
      where: { tenantId: TENANT_ID },
    }),
    invoiceItems: await prisma.invoiceItem.count({
      where: { tenantId: TENANT_ID },
    }),
    customerLedgerEntries:
      await prisma.customerLedgerEntry.count({
        where: { tenantId: TENANT_ID },
      }),
    journals: await prisma.journalEntry.count({
      where: { tenantId: TENANT_ID },
    }),
  };

  console.log(finalCounts);

  /*
   * Customer was already present in the V2 baseline.
   * V2 must add exactly:
   *   1 invoice
   *   1 invoice item
   *   1 customer-ledger entry
   *   1 GL journal
   */
  assert(
    finalCounts.customers ===
      baseline.customers,
    "V2 must not create another customer",
  );

  assert(
    finalCounts.invoices ===
      baseline.invoices + 1,
    "V2 must create exactly one invoice",
  );

  assert(
    finalCounts.invoiceItems ===
      baseline.invoiceItems + 1,
    "V2 must create exactly one invoice item",
  );

  assert(
    finalCounts.customerLedgerEntries ===
      baseline.customerLedgerEntries + 1,
    "posting must create exactly one customer ledger entry",
  );

  assert(
    finalCounts.journals ===
      baseline.journals + 1,
    "posting must create exactly one GL journal",
  );

  console.log("");
  console.log(
    "========================================",
  );
  console.log(
    "15Q.10F V2 SALES INVOICE BEHAVIORAL TEST: PASS",
  );
  console.log(
    "========================================",
  );
  console.log("");
  console.log("Verified accounting:");
  console.log(
    "DR Accounts Receivable  GHS 1,150.0000",
  );
  console.log(
    "CR Sales Revenue        GHS 1,000.0000",
  );
  console.log(
    "CR Output Tax Payable   GHS   150.0000",
  );
  console.log("");
  console.log(
    "Verified: invoice posting, AR subledger, GL posting, balance, customer dimension, and duplicate-posting defense.",
  );
  console.log("");
  console.log(
    "The successful fixture is intentionally retained as immutable accounting test evidence.",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "========================================",
    );
    console.error(
      "15Q.10F V2 SALES INVOICE BEHAVIORAL TEST: FAILED",
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