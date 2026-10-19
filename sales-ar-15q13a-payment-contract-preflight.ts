import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

async function main() {
  console.log(
    "=== 15Q.13A.1 PAYMENT DATA PREFLIGHT ===",
  );

  /*
   * Read-only verification of the frozen Sales/AR
   * invoice fixture.
   */
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: INVOICE_ID,
      tenantId: TENANT_ID,
    },
    select: {
      id: true,
      tenantId: true,
      branchId: true,
      customerId: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      currencyCode: true,
      exchangeRate: true,
      subtotal: true,
      discountTotal: true,
      taxTotal: true,
      roundingAdjustment: true,
      total: true,
      amountPaid: true,
      balanceDue: true,
      status: true,
      postedAt: true,
      paidAt: true,
      createdById: true,
    },
  });

  console.log("");
  console.log("=== INVOICE ===");

  if (!invoice) {
    throw new Error(
      "STOP: frozen 15Q.10 invoice fixture not found.",
    );
  }

  console.log({
    ...invoice,
    exchangeRate:
      invoice.exchangeRate.toString(),
    subtotal:
      invoice.subtotal.toString(),
    discountTotal:
      invoice.discountTotal.toString(),
    taxTotal:
      invoice.taxTotal.toString(),
    roundingAdjustment:
      invoice.roundingAdjustment.toString(),
    total:
      invoice.total.toString(),
    amountPaid:
      invoice.amountPaid.toString(),
    balanceDue:
      invoice.balanceDue.toString(),
  });

  /*
   * Read-only verification of the financial account
   * created during 15Q.12B.
   */
  const financialAccount =
    await prisma.financialAccount.findFirst({
      where: {
        id: FINANCIAL_ACCOUNT_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        name: true,
        accountType: true,
        currencyCode: true,
        ledgerAccountId: true,
        openingBalance: true,
        currentBalanceCache: true,
        status: true,

        ledgerAccount: {
          select: {
            id: true,
            tenantId: true,
            code: true,
            name: true,
            type: true,
            normalBalance: true,
            status: true,
          },
        },
      },
    });

  console.log("");
  console.log("=== FINANCIAL ACCOUNT ===");

  if (!financialAccount) {
    throw new Error(
      "STOP: 15Q.12B financial-account fixture not found.",
    );
  }

  console.dir(
    {
      ...financialAccount,
      openingBalance:
        financialAccount.openingBalance.toString(),
      currentBalanceCache:
        financialAccount.currentBalanceCache.toString(),
    },
    {
      depth: null,
    },
  );

  /*
   * Existing customer payments.
   */
  const existingPayments =
    await prisma.payment.findMany({
      where: {
        tenantId: TENANT_ID,
        customerId: invoice.customerId,
      },
      orderBy: {
        createdAt: "asc",
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
        reference: true,
        status: true,
        receivedById: true,
        postedAt: true,
      },
    });

  console.log("");
  console.log("=== EXISTING CUSTOMER PAYMENTS ===");

  console.table(
    existingPayments.map((payment) => ({
      ...payment,
      exchangeRate:
        payment.exchangeRate.toString(),
      amount:
        payment.amount.toString(),
      unallocatedAmount:
        payment.unallocatedAmount.toString(),
    })),
  );

  /*
   * Existing allocations against the frozen invoice.
   */
  const allocations =
    await prisma.paymentAllocation.findMany({
      where: {
        tenantId: TENANT_ID,
        invoiceId: INVOICE_ID,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        tenantId: true,
        paymentId: true,
        invoiceId: true,
        amount: true,
        createdAt: true,
      },
    });

  console.log("");
  console.log("=== EXISTING INVOICE ALLOCATIONS ===");

  console.table(
    allocations.map((allocation) => ({
      ...allocation,
      amount:
        allocation.amount.toString(),
    })),
  );

  /*
   * Existing customer subledger state.
   */
  const customerLedger =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        customerId: invoice.customerId,
      },
      orderBy: [
        {
          transactionDate: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
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
        createdAt: true,
      },
    });

  console.log("");
  console.log("=== CUSTOMER LEDGER ===");

  console.table(
    customerLedger.map((entry) => ({
      ...entry,
      debit:
        entry.debit.toString(),
      credit:
        entry.credit.toString(),
    })),
  );

  /*
   * Verify that the frozen invoice-posting journal still
   * exists before we build receipt posting on top of it.
   */
  const invoiceJournals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SALES_INVOICE",
        sourceId: INVOICE_ID,
      },
      select: {
        id: true,
        journalNumber: true,
        journalDate: true,
        sourceType: true,
        sourceId: true,
        currencyCode: true,
        exchangeRate: true,
        status: true,
        postedAt: true,

        lines: {
          select: {
            accountId: true,
            debit: true,
            credit: true,
            customerId: true,
          },
        },
      },
    });

  console.log("");
  console.log("=== SALES INVOICE JOURNAL ===");

  console.dir(
    invoiceJournals.map((journal) => ({
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
   * Assertions.
   *
   * This checkpoint remains read-only.
   */
  const invoicePassed =
    invoice.status === "POSTED" &&
    invoice.currencyCode === "GHS" &&
    invoice.exchangeRate.toString() === "1" &&
    invoice.total.toString() === "1150" &&
    invoice.amountPaid.toString() === "0" &&
    invoice.balanceDue.toString() === "1150" &&
    invoice.postedAt !== null;

  const financialAccountPassed =
    financialAccount.status === "ACTIVE" &&
    financialAccount.accountType === "BANK" &&
    financialAccount.currencyCode === "GHS" &&
    financialAccount.branchId === invoice.branchId &&
    financialAccount.ledgerAccountId !== null &&
    financialAccount.ledgerAccount !== null &&
    financialAccount.ledgerAccount.tenantId ===
      TENANT_ID &&
    financialAccount.ledgerAccount.code === "1110" &&
    financialAccount.ledgerAccount.type === "ASSET" &&
    financialAccount.ledgerAccount.normalBalance ===
      "DEBIT" &&
    financialAccount.ledgerAccount.status === "ACTIVE";

  const cleanPaymentState =
    existingPayments.length === 0 &&
    allocations.length === 0;

  const invoiceLedgerEntries =
    customerLedger.filter(
      (entry) =>
        entry.referenceType === "SALES_INVOICE" &&
        entry.referenceId === INVOICE_ID,
    );

  const invoiceLedgerPassed =
    invoiceLedgerEntries.length === 1 &&
    invoiceLedgerEntries[0]!.debit.toString() ===
      "1150" &&
    invoiceLedgerEntries[0]!.credit.toString() ===
      "0" &&
    invoiceLedgerEntries[0]!.currencyCode === "GHS";

  const invoiceJournalPassed =
    invoiceJournals.length === 1 &&
    invoiceJournals[0]!.status === "POSTED";

  console.log("");
  console.log("=== ASSERTIONS ===");

  console.log(
    "Frozen invoice state:",
    invoicePassed,
  );

  console.log(
    "Financial account state:",
    financialAccountPassed,
  );

  console.log(
    "No prior payment/allocation:",
    cleanPaymentState,
  );

  console.log(
    "Invoice customer-ledger debit:",
    invoiceLedgerPassed,
  );

  console.log(
    "Invoice GL journal exists:",
    invoiceJournalPassed,
  );

  const passed =
    invoicePassed &&
    financialAccountPassed &&
    cleanPaymentState &&
    invoiceLedgerPassed &&
    invoiceJournalPassed;

  console.log("");

  console.log(
    passed
      ? "15Q.13A.1 PAYMENT DATA PREFLIGHT: PASS"
      : "15Q.13A.1 PAYMENT DATA PREFLIGHT: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.13A.1 PAYMENT DATA PREFLIGHT: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });