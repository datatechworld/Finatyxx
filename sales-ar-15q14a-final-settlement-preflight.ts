import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FIRST_PAYMENT_ID =
  "faae4ca4-1073-4efa-a8e0-8da4961751ab";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

async function main() {
  console.log(
    "=== 15Q.14A FINAL SETTLEMENT PREFLIGHT ===",
  );

  const invoice =
    await prisma.invoice.findFirst({
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
        currencyCode: true,
        exchangeRate: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        postedAt: true,
        paidAt: true,
      },
    });

  const firstPayment =
    await prisma.payment.findFirst({
      where: {
        id: FIRST_PAYMENT_ID,
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

        allocations: {
          select: {
            invoiceId: true,
            amount: true,
          },
        },
      },
    });

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
        accountType: true,
        currencyCode: true,
        ledgerAccountId: true,
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

  const invoiceAllocations =
    await prisma.paymentAllocation.findMany({
      where: {
        tenantId: TENANT_ID,
        invoiceId: INVOICE_ID,
      },
      select: {
        id: true,
        paymentId: true,
        amount: true,

        payment: {
          select: {
            paymentNumber: true,
            amount: true,
            status: true,
          },
        },
      },
    });

  const customerLedger =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        customerId: invoice?.customerId,
      },
      orderBy: {
        transactionDate: "asc",
      },
      select: {
        id: true,
        entryType: true,
        referenceType: true,
        referenceId: true,
        debit: true,
        credit: true,
        currencyCode: true,
      },
    });

  const receiptSequence =
    await prisma.documentSequence.findFirst({
      where: {
        tenantId: TENANT_ID,
        documentType: "RECEIPT",
        year: 2098,
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        documentType: true,
        year: true,
        nextNumber: true,
      },
    });

  const paymentJournals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "CUSTOMER_PAYMENT",
      },
      select: {
        id: true,
        journalNumber: true,
        sourceId: true,
        status: true,

        lines: {
          select: {
            debit: true,
            credit: true,

            account: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

  if (
    !invoice ||
    !firstPayment ||
    !financialAccount
  ) {
    throw new Error(
      "STOP: required frozen Sales/AR evidence is missing.",
    );
  }

  console.log("");
  console.log("=== INVOICE STARTING STATE ===");

  console.log({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    currencyCode: invoice.currencyCode,
    exchangeRate:
      invoice.exchangeRate.toString(),
    total:
      invoice.total.toString(),
    amountPaid:
      invoice.amountPaid.toString(),
    balanceDue:
      invoice.balanceDue.toString(),
    status:
      invoice.status,
    postedAt:
      invoice.postedAt,
    paidAt:
      invoice.paidAt,
  });

  console.log("");
  console.log("=== FIRST FROZEN RECEIPT ===");

  console.log({
    id: firstPayment.id,
    paymentNumber:
      firstPayment.paymentNumber,
    amount:
      firstPayment.amount.toString(),
    unallocatedAmount:
      firstPayment.unallocatedAmount.toString(),
    status:
      firstPayment.status,
    postedAt:
      firstPayment.postedAt,
    allocationCount:
      firstPayment.allocations.length,
    allocations:
      firstPayment.allocations.map(
        (allocation) => ({
          invoiceId:
            allocation.invoiceId,
          amount:
            allocation.amount.toString(),
        }),
      ),
  });

  console.log("");
  console.log("=== FINANCIAL ACCOUNT ===");

  console.log({
    id:
      financialAccount.id,
    accountType:
      financialAccount.accountType,
    currencyCode:
      financialAccount.currencyCode,
    status:
      financialAccount.status,
    ledgerAccountId:
      financialAccount.ledgerAccountId,
    ledgerCode:
      financialAccount.ledgerAccount.code,
    ledgerName:
      financialAccount.ledgerAccount.name,
    ledgerType:
      financialAccount.ledgerAccount.type,
    normalBalance:
      financialAccount.ledgerAccount.normalBalance,
    ledgerStatus:
      financialAccount.ledgerAccount.status,
    currentBalanceCache:
      financialAccount.currentBalanceCache.toString(),
  });

  console.log("");
  console.log("=== EXISTING INVOICE ALLOCATIONS ===");

  console.dir(
    invoiceAllocations.map(
      (allocation) => ({
        id:
          allocation.id,
        paymentId:
          allocation.paymentId,
        amount:
          allocation.amount.toString(),
        paymentNumber:
          allocation.payment.paymentNumber,
        paymentAmount:
          allocation.payment.amount.toString(),
        paymentStatus:
          allocation.payment.status,
      }),
    ),
    {
      depth: null,
    },
  );

  console.log("");
  console.log("=== CUSTOMER LEDGER ===");

  console.dir(
    customerLedger.map(
      (entry) => ({
        id:
          entry.id,
        entryType:
          entry.entryType,
        referenceType:
          entry.referenceType,
        referenceId:
          entry.referenceId,
        debit:
          entry.debit.toString(),
        credit:
          entry.credit.toString(),
        currencyCode:
          entry.currencyCode,
      }),
    ),
    {
      depth: null,
    },
  );

  console.log("");
  console.log("=== RECEIPT SEQUENCE ===");

  console.log(
    receiptSequence
      ? {
          id:
            receiptSequence.id,
          branchId:
            receiptSequence.branchId,
          documentType:
            receiptSequence.documentType,
          year:
            receiptSequence.year,
          nextNumber:
            receiptSequence.nextNumber,
        }
      : null,
  );

  console.log("");
  console.log("=== EXISTING PAYMENT JOURNALS ===");

  console.dir(
    paymentJournals.map(
      (journal) => ({
        id:
          journal.id,
        journalNumber:
          journal.journalNumber,
        sourceId:
          journal.sourceId,
        status:
          journal.status,

        lines:
          journal.lines.map(
            (line) => ({
              code:
                line.account.code,
              debit:
                line.debit.toString(),
              credit:
                line.credit.toString(),
            }),
          ),
      }),
    ),
    {
      depth: null,
    },
  );

  const invoiceVerified =
    invoice.currencyCode === "GHS" &&
    invoice.exchangeRate.toString() === "1" &&
    invoice.total.toString() === "1150" &&
    invoice.amountPaid.toString() === "600" &&
    invoice.balanceDue.toString() === "550" &&
    invoice.status === "PARTIALLY_PAID" &&
    invoice.postedAt !== null &&
    invoice.paidAt === null;

  const firstPaymentVerified =
    firstPayment.paymentNumber ===
      "REC-2098-000001" &&
    firstPayment.amount.toString() === "600" &&
    firstPayment.unallocatedAmount.toString() === "0" &&
    firstPayment.status === "POSTED" &&
    firstPayment.postedAt !== null &&
    firstPayment.customerId ===
      invoice.customerId &&
    firstPayment.branchId ===
      invoice.branchId &&
    firstPayment.currencyCode === "GHS" &&
    firstPayment.exchangeRate.toString() === "1" &&
    firstPayment.financialAccountId ===
      FINANCIAL_ACCOUNT_ID &&
    firstPayment.allocations.length === 1 &&
    firstPayment.allocations[0]!.invoiceId ===
      INVOICE_ID &&
    firstPayment.allocations[0]!.amount.toString() ===
      "600";

  const financialAccountVerified =
    financialAccount.accountType === "BANK" &&
    financialAccount.currencyCode === "GHS" &&
    financialAccount.status === "ACTIVE" &&
    financialAccount.ledgerAccountId ===
      financialAccount.ledgerAccount.id &&
    financialAccount.ledgerAccount.tenantId ===
      TENANT_ID &&
    financialAccount.ledgerAccount.code === "1110" &&
    financialAccount.ledgerAccount.type === "ASSET" &&
    financialAccount.ledgerAccount.normalBalance ===
      "DEBIT" &&
    financialAccount.ledgerAccount.status === "ACTIVE";

  const allocationsVerified =
    invoiceAllocations.length === 1 &&
    invoiceAllocations[0]!.paymentId ===
      FIRST_PAYMENT_ID &&
    invoiceAllocations[0]!.amount.toString() ===
      "600" &&
    invoiceAllocations[0]!.payment.status ===
      "POSTED";

  const invoiceLedgerEntry =
    customerLedger.find(
      (entry) =>
        entry.referenceType ===
          "SALES_INVOICE" &&
        entry.referenceId ===
          INVOICE_ID,
    );

  const firstPaymentLedgerEntry =
    customerLedger.find(
      (entry) =>
        entry.referenceType ===
          "CUSTOMER_PAYMENT" &&
        entry.referenceId ===
          FIRST_PAYMENT_ID,
    );

  const ledgerVerified =
    invoiceLedgerEntry !== undefined &&
    invoiceLedgerEntry.debit.toString() ===
      "1150" &&
    invoiceLedgerEntry.credit.toString() ===
      "0" &&
    firstPaymentLedgerEntry !== undefined &&
    firstPaymentLedgerEntry.debit.toString() ===
      "0" &&
    firstPaymentLedgerEntry.credit.toString() ===
      "600";

  const firstPaymentJournal =
    paymentJournals.find(
      (journal) =>
        journal.sourceId ===
          FIRST_PAYMENT_ID,
    );

  const paymentJournalVerified =
    firstPaymentJournal !== undefined &&
    firstPaymentJournal.status === "POSTED" &&
    firstPaymentJournal.lines.length === 2 &&
    firstPaymentJournal.lines.some(
      (line) =>
        line.account.code === "1110" &&
        line.debit.toString() === "600" &&
        line.credit.toString() === "0",
    ) &&
    firstPaymentJournal.lines.some(
      (line) =>
        line.account.code === "1200" &&
        line.debit.toString() === "0" &&
        line.credit.toString() === "600",
    );

  const noSecondPaymentYet =
    invoiceAllocations.length === 1;

  console.log("");
  console.log("=== ASSERTIONS ===");

  console.log(
    "Invoice is ready for final settlement:",
    invoiceVerified,
  );

  console.log(
    "First frozen receipt preserved:",
    firstPaymentVerified,
  );

  console.log(
    "Financial account ready:",
    financialAccountVerified,
  );

  console.log(
    "Existing allocation preserved:",
    allocationsVerified,
  );

  console.log(
    "Customer ledger preserved:",
    ledgerVerified,
  );

  console.log(
    "First receipt GL preserved:",
    paymentJournalVerified,
  );

  console.log(
    "No second allocation exists yet:",
    noSecondPaymentYet,
  );

  const passed =
    invoiceVerified &&
    firstPaymentVerified &&
    financialAccountVerified &&
    allocationsVerified &&
    ledgerVerified &&
    paymentJournalVerified &&
    noSecondPaymentYet;

  console.log("");

  console.log(
    passed
      ? "15Q.14A FINAL SETTLEMENT PREFLIGHT: PASS"
      : "15Q.14A FINAL SETTLEMENT PREFLIGHT: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.14A FINAL SETTLEMENT PREFLIGHT: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });