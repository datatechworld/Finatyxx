import { prisma } from "./src/db/prisma.ts";

import {
  postCustomerPayment,
} from "./src/modules/sales/customer-payment-posting.service.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const PAYMENT_ID =
  "faae4ca4-1073-4efa-a8e0-8da4961751ab";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

const POSTED_BY_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

async function main() {
  console.log(
    "=== 15Q.13E CUSTOMER PAYMENT BEHAVIORAL TEST ===",
  );

  /*
   * ---------------------------------------------------------
   * 1. PRE-POST SAFETY VERIFICATION
   * ---------------------------------------------------------
   */
  const before =
    await prisma.payment.findFirst({
      where: {
        id: PAYMENT_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        customerId: true,
        paymentNumber: true,
        paymentDate: true,
        currencyCode: true,
        exchangeRate: true,
        amount: true,
        unallocatedAmount: true,
        financialAccountId: true,
        status: true,
        postedAt: true,

        allocations: {
          select: {
            id: true,
            tenantId: true,
            invoiceId: true,
            amount: true,
          },
        },
      },
    });

  if (!before) {
    throw new Error(
      "STOP: 15Q.13D payment fixture not found.",
    );
  }

  const invoiceBefore =
    await prisma.invoice.findFirst({
      where: {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
      },
    });

  if (!invoiceBefore) {
    throw new Error(
      "STOP: frozen invoice fixture not found.",
    );
  }

  const ledgerBefore =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "CUSTOMER_PAYMENT",
        referenceId: PAYMENT_ID,
      },
    });

  const journalBefore =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "CUSTOMER_PAYMENT",
        sourceId: PAYMENT_ID,
      },
    });

  const preflightPassed =
    before.status === "DRAFT" &&
    before.postedAt === null &&
    before.currencyCode === "GHS" &&
    before.exchangeRate.toString() === "1" &&
    before.amount.toString() === "600" &&
    before.unallocatedAmount.toString() === "0" &&
    before.financialAccountId ===
      FINANCIAL_ACCOUNT_ID &&
    before.allocations.length === 1 &&
    before.allocations[0]!.tenantId ===
      TENANT_ID &&
    before.allocations[0]!.invoiceId ===
      INVOICE_ID &&
    before.allocations[0]!.amount.toString() ===
      "600" &&
    invoiceBefore.amountPaid.toString() === "0" &&
    invoiceBefore.balanceDue.toString() === "1150" &&
    invoiceBefore.status === "POSTED" &&
    ledgerBefore === 0 &&
    journalBefore === 0;

  console.log("");
  console.log("=== PRE-POST STATE ===");

  console.log({
    paymentId: before.id,
    paymentNumber: before.paymentNumber,
    paymentStatus: before.status,
    paymentAmount: before.amount.toString(),
    unallocatedAmount:
      before.unallocatedAmount.toString(),
    invoiceAmountPaid:
      invoiceBefore.amountPaid.toString(),
    invoiceBalanceDue:
      invoiceBefore.balanceDue.toString(),
    invoiceStatus: invoiceBefore.status,
    paymentLedgerRows: ledgerBefore,
    paymentJournals: journalBefore,
  });

  console.log("");
  console.log(
    "Pre-post safety verification:",
    preflightPassed,
  );

  if (!preflightPassed) {
    throw new Error(
      "STOP: payment fixture is not in the exact expected pre-post state.",
    );
  }

  /*
   * ---------------------------------------------------------
   * 2. EXECUTE THE REAL CUSTOMER PAYMENT POSTING SERVICE
   * ---------------------------------------------------------
   */
  console.log("");
  console.log(
    "=== EXECUTING postCustomerPayment() ===",
  );

  const result =
    await postCustomerPayment({
      tenantId: TENANT_ID,
      paymentId: PAYMENT_ID,
      postedById: POSTED_BY_ID,
    });

  console.log("");
  console.log("=== SERVICE RESULT ===");

  console.log({
    ...result,
    amount: result.amount.toString(),
    allocatedAmount:
      result.allocatedAmount.toString(),
    unallocatedAmount:
      result.unallocatedAmount.toString(),
  });

  /*
   * ---------------------------------------------------------
   * 3. FRESH POST-POSTING READS
   * ---------------------------------------------------------
   */
  const payment =
    await prisma.payment.findFirst({
      where: {
        id: PAYMENT_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        paymentNumber: true,
        customerId: true,
        branchId: true,
        currencyCode: true,
        exchangeRate: true,
        amount: true,
        unallocatedAmount: true,
        financialAccountId: true,
        status: true,
        postedAt: true,
      },
    });

  if (!payment) {
    throw new Error(
      "STOP: posted payment could not be re-read.",
    );
  }

  const invoice =
    await prisma.invoice.findFirst({
      where: {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        paidAt: true,
      },
    });

  if (!invoice) {
    throw new Error(
      "STOP: invoice could not be re-read after payment posting.",
    );
  }

  const ledgerEntries =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "CUSTOMER_PAYMENT",
        referenceId: PAYMENT_ID,
      },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        branchId: true,
        transactionDate: true,
        entryType: true,
        referenceType: true,
        referenceId: true,
        debit: true,
        credit: true,
        currencyCode: true,
      },
    });

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "CUSTOMER_PAYMENT",
        sourceId: PAYMENT_ID,
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        journalNumber: true,
        journalDate: true,
        description: true,
        sourceType: true,
        sourceId: true,
        currencyCode: true,
        exchangeRate: true,
        status: true,
        postedAt: true,

        lines: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            accountId: true,
            debit: true,
            credit: true,
            customerId: true,

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

  console.log("");
  console.log("=== POSTED PAYMENT ===");

  console.log({
    ...payment,
    exchangeRate:
      payment.exchangeRate.toString(),
    amount:
      payment.amount.toString(),
    unallocatedAmount:
      payment.unallocatedAmount.toString(),
  });

  console.log("");
  console.log("=== UPDATED INVOICE ===");

  console.log({
    ...invoice,
    total:
      invoice.total.toString(),
    amountPaid:
      invoice.amountPaid.toString(),
    balanceDue:
      invoice.balanceDue.toString(),
  });

  console.log("");
  console.log("=== CUSTOMER LEDGER PAYMENT ENTRY ===");

  console.dir(
    ledgerEntries.map((entry) => ({
      ...entry,
      debit:
        entry.debit.toString(),
      credit:
        entry.credit.toString(),
    })),
    {
      depth: null,
    },
  );

  console.log("");
  console.log("=== PAYMENT JOURNAL ===");

  console.dir(
    journals.map((journal) => ({
      ...journal,
      exchangeRate:
        journal.exchangeRate.toString(),

      lines: journal.lines.map((line) => ({
        ...line,
        debit:
          line.debit.toString(),
        credit:
          line.credit.toString(),
      })),
    })),
    {
      depth: null,
    },
  );

  /*
   * ---------------------------------------------------------
   * 4. ACCOUNTING ASSERTIONS
   * ---------------------------------------------------------
   */
  const paymentPassed =
    payment.status === "POSTED" &&
    payment.postedAt !== null &&
    payment.amount.toString() === "600" &&
    payment.unallocatedAmount.toString() === "0" &&
    payment.currencyCode === "GHS" &&
    payment.exchangeRate.toString() === "1" &&
    payment.financialAccountId ===
      FINANCIAL_ACCOUNT_ID;

  const invoicePassed =
    invoice.total.toString() === "1150" &&
    invoice.amountPaid.toString() === "600" &&
    invoice.balanceDue.toString() === "550" &&
    invoice.status === "PARTIALLY_PAID" &&
    invoice.paidAt === null;

  const ledgerPassed =
    ledgerEntries.length === 1 &&
    ledgerEntries[0]!.tenantId === TENANT_ID &&
    ledgerEntries[0]!.customerId ===
      payment.customerId &&
    ledgerEntries[0]!.branchId ===
      payment.branchId &&
    ledgerEntries[0]!.entryType === "PAYMENT" &&
    ledgerEntries[0]!.referenceType ===
      "CUSTOMER_PAYMENT" &&
    ledgerEntries[0]!.referenceId === PAYMENT_ID &&
    ledgerEntries[0]!.debit.toString() === "0" &&
    ledgerEntries[0]!.credit.toString() === "600" &&
    ledgerEntries[0]!.currencyCode === "GHS";

  const journal = journals[0];

  const journalHeaderPassed =
    journals.length === 1 &&
    journal !== undefined &&
    journal.tenantId === TENANT_ID &&
    journal.branchId === payment.branchId &&
    journal.sourceType === "CUSTOMER_PAYMENT" &&
    journal.sourceId === PAYMENT_ID &&
    journal.currencyCode === "GHS" &&
    journal.exchangeRate.toString() === "1" &&
    journal.status === "POSTED" &&
    journal.postedAt !== null;

  const bankLines =
    journal?.lines.filter(
      (line) =>
        line.account.code === "1110",
    ) ?? [];

  const arLines =
    journal?.lines.filter(
      (line) =>
        line.account.code === "1200",
    ) ?? [];

  const bankLinePassed =
    bankLines.length === 1 &&
    bankLines[0]!.debit.toString() === "600" &&
    bankLines[0]!.credit.toString() === "0" &&
    bankLines[0]!.customerId ===
      payment.customerId;

  const arLinePassed =
    arLines.length === 1 &&
    arLines[0]!.debit.toString() === "0" &&
    arLines[0]!.credit.toString() === "600" &&
    arLines[0]!.customerId ===
      payment.customerId;

  const journalBalance =
    (journal?.lines ?? []).reduce(
      (totals, line) => {
        totals.debit += Number(
          line.debit.toString(),
        );

        totals.credit += Number(
          line.credit.toString(),
        );

        return totals;
      },
      {
        debit: 0,
        credit: 0,
      },
    );

  const journalBalanced =
    journalBalance.debit === 600 &&
    journalBalance.credit === 600;

  const serviceResultPassed =
    result.paymentId === PAYMENT_ID &&
    result.paymentNumber ===
      payment.paymentNumber &&
    result.status === "POSTED" &&
    result.amount.toString() === "600" &&
    result.allocatedAmount.toString() === "600" &&
    result.unallocatedAmount.toString() === "0" &&
    result.customerLedgerEntryId ===
      ledgerEntries[0]?.id &&
    result.journalEntryId === journal?.id &&
    result.journalNumber ===
      journal?.journalNumber;

  console.log("");
  console.log("=== ASSERTIONS ===");

  console.log(
    "Payment POSTED:",
    paymentPassed,
  );

  console.log(
    "Invoice PARTIALLY_PAID:",
    invoicePassed,
  );

  console.log(
    "Customer ledger CR 600:",
    ledgerPassed,
  );

  console.log(
    "Journal header:",
    journalHeaderPassed,
  );

  console.log(
    "1110 Bank DR 600:",
    bankLinePassed,
  );

  console.log(
    "1200 AR CR 600:",
    arLinePassed,
  );

  console.log(
    "Journal balanced 600/600:",
    journalBalanced,
  );

  console.log(
    "Service result matches persisted evidence:",
    serviceResultPassed,
  );

  const passed =
    paymentPassed &&
    invoicePassed &&
    ledgerPassed &&
    journalHeaderPassed &&
    bankLinePassed &&
    arLinePassed &&
    journalBalanced &&
    serviceResultPassed;

  console.log("");

  console.log(
    passed
      ? "15Q.13E CUSTOMER PAYMENT BEHAVIORAL TEST: PASS"
      : "15Q.13E CUSTOMER PAYMENT BEHAVIORAL TEST: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.13E CUSTOMER PAYMENT BEHAVIORAL TEST: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });