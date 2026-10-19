import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FIRST_PAYMENT_ID =
  "faae4ca4-1073-4efa-a8e0-8da4961751ab";

const SECOND_PAYMENT_ID =
  "5c0d8611-5c78-4fb7-a709-e9f51f581a74";

const SECOND_ALLOCATION_ID =
  "b555c22f-dc06-4033-aa82-234effb015bc";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

async function main() {
  console.log(
    "=== 15Q.14C FINAL-SETTLEMENT DRAFT VERIFIER ===",
  );

  const invoice =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: INVOICE_ID,
      },
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        branchId: true,
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
        tenantId: TENANT_ID,
        id: FIRST_PAYMENT_ID,
      },
      select: {
        id: true,
        paymentNumber: true,
        amount: true,
        unallocatedAmount: true,
        status: true,
        postedAt: true,
      },
    });

  const secondPayment =
    await prisma.payment.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: SECOND_PAYMENT_ID,
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
        postedAt: true,
        receivedById: true,

        allocations: {
          select: {
            id: true,
            tenantId: true,
            paymentId: true,
            invoiceId: true,
            amount: true,
          },
        },
      },
    });

  const financialAccount =
    await prisma.financialAccount.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FINANCIAL_ACCOUNT_ID,
      },
      select: {
        id: true,
        branchId: true,
        accountType: true,
        currencyCode: true,
        status: true,
        currentBalanceCache: true,
        ledgerAccountId: true,

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
        paymentId: true,
        invoiceId: true,
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
        customerId:
          invoice?.customerId ?? undefined,
        OR: [
          {
            referenceType:
              "SALES_INVOICE",
            referenceId:
              INVOICE_ID,
          },
          {
            referenceType:
              "CUSTOMER_PAYMENT",
            referenceId:
              FIRST_PAYMENT_ID,
          },
          {
            referenceType:
              "CUSTOMER_PAYMENT",
            referenceId:
              SECOND_PAYMENT_ID,
          },
        ],
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

  const secondPaymentLedgerCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType:
          "CUSTOMER_PAYMENT",
        referenceId:
          SECOND_PAYMENT_ID,
      },
    });

  const secondPaymentJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType:
          "CUSTOMER_PAYMENT",
        sourceId:
          SECOND_PAYMENT_ID,
      },
    });

  const firstPaymentJournal =
    await prisma.journalEntry.findFirst({
      where: {
        tenantId: TENANT_ID,
        sourceType:
          "CUSTOMER_PAYMENT",
        sourceId:
          FIRST_PAYMENT_ID,
      },
      select: {
        id: true,
        journalNumber: true,
        status: true,
        lines: {
          orderBy: {
            createdAt: "asc",
          },
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

  const sequence =
    await prisma.documentSequence.findFirst({
      where: {
        tenantId: TENANT_ID,
        branchId: null,
        documentType: "RECEIPT",
        year: 2098,
      },
      select: {
        nextNumber: true,
      },
    });

  const bankTransactionCount =
    await prisma.bankTransaction.count({
      where: {
        tenantId: TENANT_ID,
        financialAccountId:
          FINANCIAL_ACCOUNT_ID,
      },
    });

  console.log("");
  console.log("=== INVOICE ===");

  console.log(
    invoice
      ? {
          id: invoice.id,
          invoiceNumber:
            invoice.invoiceNumber,
          currencyCode:
            invoice.currencyCode,
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
        }
      : null,
  );

  console.log("");
  console.log("=== FIRST FROZEN RECEIPT ===");

  console.log(
    firstPayment
      ? {
          id:
            firstPayment.id,
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
        }
      : null,
  );

  console.log("");
  console.log("=== SECOND DRAFT RECEIPT ===");

  console.log(
    secondPayment
      ? {
          id:
            secondPayment.id,
          paymentNumber:
            secondPayment.paymentNumber,
          paymentDate:
            secondPayment.paymentDate,
          customerId:
            secondPayment.customerId,
          branchId:
            secondPayment.branchId,
          currencyCode:
            secondPayment.currencyCode,
          exchangeRate:
            secondPayment.exchangeRate.toString(),
          amount:
            secondPayment.amount.toString(),
          unallocatedAmount:
            secondPayment.unallocatedAmount.toString(),
          financialAccountId:
            secondPayment.financialAccountId,
          reference:
            secondPayment.reference,
          status:
            secondPayment.status,
          postedAt:
            secondPayment.postedAt,
          receivedById:
            secondPayment.receivedById,
          allocations:
            secondPayment.allocations.map(
              (allocation) => ({
                id:
                  allocation.id,
                tenantId:
                  allocation.tenantId,
                paymentId:
                  allocation.paymentId,
                invoiceId:
                  allocation.invoiceId,
                amount:
                  allocation.amount.toString(),
              }),
            ),
        }
      : null,
  );

  console.log("");
  console.log("=== FINANCIAL ACCOUNT ===");

  console.log(
    financialAccount
      ? {
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
        }
      : null,
  );

  console.log("");
  console.log("=== INVOICE ALLOCATIONS ===");

  console.log(
    allocations.map(
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
  );

  console.log("");
  console.log("=== CUSTOMER LEDGER ===");

  console.log(
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
  );

  console.log("");
  console.log("=== FIRST PAYMENT JOURNAL ===");

  console.log(
    firstPaymentJournal
      ? {
          id:
            firstPaymentJournal.id,
          journalNumber:
            firstPaymentJournal.journalNumber,
          status:
            firstPaymentJournal.status,
          lines:
            firstPaymentJournal.lines.map(
              (line) => ({
                code:
                  line.account.code,
                debit:
                  line.debit.toString(),
                credit:
                  line.credit.toString(),
              }),
            ),
        }
      : null,
  );

  console.log("");
  console.log("=== CONTROL COUNTS ===");

  console.log({
    receiptSequenceNextNumber:
      sequence?.nextNumber.toString() ?? null,
    secondPaymentLedgerCount,
    secondPaymentJournalCount,
    bankTransactionCount,
  });

  if (
    !invoice ||
    !firstPayment ||
    !secondPayment ||
    !financialAccount ||
    !firstPaymentJournal ||
    !sequence
  ) {
    throw new Error(
      "STOP: one or more required verification records are missing.",
    );
  }

  const invoiceReady =
    invoice.currencyCode === "GHS" &&
    invoice.exchangeRate.toString() === "1" &&
    invoice.total.toString() === "1150" &&
    invoice.amountPaid.toString() === "600" &&
    invoice.balanceDue.toString() === "550" &&
    invoice.status === "PARTIALLY_PAID" &&
    invoice.postedAt !== null &&
    invoice.paidAt === null;

  const firstReceiptPreserved =
    firstPayment.paymentNumber ===
      "REC-2098-000001" &&
    firstPayment.amount.toString() === "600" &&
    firstPayment.unallocatedAmount.toString() ===
      "0" &&
    firstPayment.status === "POSTED" &&
    firstPayment.postedAt !== null;

  const secondDraftReady =
    secondPayment.paymentNumber ===
      "REC-2098-000002" &&
    secondPayment.currencyCode === "GHS" &&
    secondPayment.exchangeRate.toString() === "1" &&
    secondPayment.amount.toString() === "550" &&
    secondPayment.unallocatedAmount.toString() ===
      "0" &&
    secondPayment.financialAccountId ===
      FINANCIAL_ACCOUNT_ID &&
    secondPayment.status === "DRAFT" &&
    secondPayment.postedAt === null &&
    secondPayment.customerId ===
      invoice.customerId &&
    secondPayment.branchId ===
      invoice.branchId &&
    secondPayment.allocations.length === 1 &&
    secondPayment.allocations[0]!.id ===
      SECOND_ALLOCATION_ID &&
    secondPayment.allocations[0]!.tenantId ===
      TENANT_ID &&
    secondPayment.allocations[0]!.paymentId ===
      SECOND_PAYMENT_ID &&
    secondPayment.allocations[0]!.invoiceId ===
      INVOICE_ID &&
    secondPayment.allocations[0]!.amount.toString() ===
      "550";

  const financialAccountReady =
    financialAccount.accountType === "BANK" &&
    financialAccount.currencyCode === "GHS" &&
    financialAccount.status === "ACTIVE" &&
    financialAccount.ledgerAccount.code === "1110" &&
    financialAccount.ledgerAccount.type === "ASSET" &&
    financialAccount.ledgerAccount.normalBalance ===
      "DEBIT" &&
    financialAccount.ledgerAccount.status === "ACTIVE";

  const allocationsReady =
    allocations.length === 2 &&
    allocations.some(
      (allocation) =>
        allocation.paymentId ===
          FIRST_PAYMENT_ID &&
        allocation.amount.toString() === "600" &&
        allocation.payment.status === "POSTED",
    ) &&
    allocations.some(
      (allocation) =>
        allocation.paymentId ===
          SECOND_PAYMENT_ID &&
        allocation.id ===
          SECOND_ALLOCATION_ID &&
        allocation.amount.toString() === "550" &&
        allocation.payment.status === "DRAFT",
    );

  const ledgerPreserved =
    customerLedger.length === 2 &&
    customerLedger.some(
      (entry) =>
        entry.entryType === "INVOICE" &&
        entry.referenceType ===
          "SALES_INVOICE" &&
        entry.referenceId ===
          INVOICE_ID &&
        entry.debit.toString() === "1150" &&
        entry.credit.toString() === "0",
    ) &&
    customerLedger.some(
      (entry) =>
        entry.entryType === "PAYMENT" &&
        entry.referenceType ===
          "CUSTOMER_PAYMENT" &&
        entry.referenceId ===
          FIRST_PAYMENT_ID &&
        entry.debit.toString() === "0" &&
        entry.credit.toString() === "600",
    ) &&
    secondPaymentLedgerCount === 0;

  const firstReceiptGlPreserved =
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

  const noSecondAccountingYet =
    secondPaymentLedgerCount === 0 &&
    secondPaymentJournalCount === 0;

  const boundariesPreserved =
    financialAccount.currentBalanceCache.toString() ===
      "0" &&
    bankTransactionCount === 0;

  const sequenceReady =
    sequence.nextNumber === 3n;

  console.log("");
  console.log("=== ASSERTIONS ===");

  console.log(
    "Invoice ready for final settlement:",
    invoiceReady,
  );

  console.log(
    "First frozen receipt preserved:",
    firstReceiptPreserved,
  );

  console.log(
    "Second draft receipt ready:",
    secondDraftReady,
  );

  console.log(
    "Financial account ready:",
    financialAccountReady,
  );

  console.log(
    "Two allocations ready:",
    allocationsReady,
  );

  console.log(
    "Customer ledger preserved:",
    ledgerPreserved,
  );

  console.log(
    "First receipt GL preserved:",
    firstReceiptGlPreserved,
  );

  console.log(
    "No second receipt accounting yet:",
    noSecondAccountingYet,
  );

  console.log(
    "Banking boundary preserved:",
    boundariesPreserved,
  );

  console.log(
    "Receipt sequence ready:",
    sequenceReady,
  );

  const passed =
    invoiceReady &&
    firstReceiptPreserved &&
    secondDraftReady &&
    financialAccountReady &&
    allocationsReady &&
    ledgerPreserved &&
    firstReceiptGlPreserved &&
    noSecondAccountingYet &&
    boundariesPreserved &&
    sequenceReady;

  console.log("");

  console.log(
    passed
      ? "15Q.14C FINAL-SETTLEMENT DRAFT VERIFIER: PASS"
      : "15Q.14C FINAL-SETTLEMENT DRAFT VERIFIER: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.14C FINAL-SETTLEMENT DRAFT VERIFIER: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });