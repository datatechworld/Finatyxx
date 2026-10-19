import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FIRST_PAYMENT_ID =
  "faae4ca4-1073-4efa-a8e0-8da4961751ab";

const SECOND_PAYMENT_ID =
  "5c0d8611-5c78-4fb7-a709-e9f51f581a74";

const FIRST_LEDGER_ID =
  "e80a7016-41d7-4cf3-8aca-f2d84ee3f9fc";

const SECOND_LEDGER_ID =
  "b4a41540-9a1d-4d59-a1f2-eaa9f4d7d295";

const FIRST_JOURNAL_ID =
  "855bbcac-67c4-4a53-bbda-68b28bf04f71";

const SECOND_JOURNAL_ID =
  "0f5a6669-59a8-4085-a638-181e07a84bfd";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

async function main() {
  console.log(
    "=== 15Q.14E FINAL SETTLEMENT VERIFIER ===",
  );

  const invoice = await prisma.invoice.findFirst({
    where: {
      tenantId: TENANT_ID,
      id: INVOICE_ID,
    },
    select: {
      id: true,
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

  const payments = await prisma.payment.findMany({
    where: {
      tenantId: TENANT_ID,
      id: {
        in: [
          FIRST_PAYMENT_ID,
          SECOND_PAYMENT_ID,
        ],
      },
    },
    orderBy: {
      paymentNumber: "asc",
    },
    select: {
      id: true,
      paymentNumber: true,
      amount: true,
      unallocatedAmount: true,
      currencyCode: true,
      exchangeRate: true,
      status: true,
      postedAt: true,
      financialAccountId: true,
      allocations: {
        select: {
          invoiceId: true,
          amount: true,
        },
      },
    },
  });

  const ledger = await prisma.customerLedgerEntry.findMany({
    where: {
      tenantId: TENANT_ID,
      OR: [
        {
          referenceType: "SALES_INVOICE",
          referenceId: INVOICE_ID,
        },
        {
          referenceType: "CUSTOMER_PAYMENT",
          referenceId: FIRST_PAYMENT_ID,
        },
        {
          referenceType: "CUSTOMER_PAYMENT",
          referenceId: SECOND_PAYMENT_ID,
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

  const journals = await prisma.journalEntry.findMany({
    where: {
      tenantId: TENANT_ID,
      sourceType: "CUSTOMER_PAYMENT",
      sourceId: {
        in: [
          FIRST_PAYMENT_ID,
          SECOND_PAYMENT_ID,
        ],
      },
    },
    orderBy: {
      journalNumber: "asc",
    },
    select: {
      id: true,
      journalNumber: true,
      sourceId: true,
      currencyCode: true,
      exchangeRate: true,
      status: true,
      postedAt: true,
      lines: {
        select: {
          debit: true,
          credit: true,
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

  const financialAccount =
    await prisma.financialAccount.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FINANCIAL_ACCOUNT_ID,
      },
      select: {
        accountType: true,
        currencyCode: true,
        status: true,
        currentBalanceCache: true,
        ledgerAccount: {
          select: {
            code: true,
            type: true,
            normalBalance: true,
            status: true,
          },
        },
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

  const receiptSequence =
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

  if (
    !invoice ||
    !financialAccount ||
    !receiptSequence
  ) {
    throw new Error(
      "Required final-settlement evidence is missing.",
    );
  }

  console.log("");
  console.log("=== FINAL INVOICE ===");
  console.log({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total.toString(),
    amountPaid: invoice.amountPaid.toString(),
    balanceDue: invoice.balanceDue.toString(),
    status: invoice.status,
    postedAt: invoice.postedAt,
    paidAt: invoice.paidAt,
  });

  console.log("");
  console.log("=== RECEIPTS ===");
  console.log(
    payments.map((payment) => ({
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      amount: payment.amount.toString(),
      unallocatedAmount:
        payment.unallocatedAmount.toString(),
      status: payment.status,
      postedAt: payment.postedAt,
      allocations: payment.allocations.map(
        (allocation) => ({
          invoiceId: allocation.invoiceId,
          amount: allocation.amount.toString(),
        }),
      ),
    })),
  );

  console.log("");
  console.log("=== CUSTOMER SUBLEDGER ===");
  console.log(
    ledger.map((entry) => ({
      id: entry.id,
      entryType: entry.entryType,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      debit: entry.debit.toString(),
      credit: entry.credit.toString(),
      currencyCode: entry.currencyCode,
    })),
  );

  console.log("");
  console.log("=== PAYMENT JOURNALS ===");
  console.log(
    journals.map((journal) => ({
      id: journal.id,
      journalNumber: journal.journalNumber,
      sourceId: journal.sourceId,
      status: journal.status,
      lines: journal.lines.map((line) => ({
        code: line.account.code,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
      })),
    })),
  );

  const invoiceSettled =
    invoice.currencyCode === "GHS" &&
    invoice.exchangeRate.toString() === "1" &&
    invoice.total.toString() === "1150" &&
    invoice.amountPaid.toString() === "1150" &&
    invoice.balanceDue.toString() === "0" &&
    invoice.status === "PAID" &&
    invoice.postedAt !== null &&
    invoice.paidAt !== null;

  const firstPayment = payments.find(
    (p) => p.id === FIRST_PAYMENT_ID,
  );

  const secondPayment = payments.find(
    (p) => p.id === SECOND_PAYMENT_ID,
  );

  const receiptsCorrect =
    payments.length === 2 &&
    firstPayment?.paymentNumber ===
      "REC-2098-000001" &&
    firstPayment.amount.toString() === "600" &&
    firstPayment.unallocatedAmount.toString() === "0" &&
    firstPayment.status === "POSTED" &&
    firstPayment.postedAt !== null &&
    firstPayment.allocations.length === 1 &&
    firstPayment.allocations[0]!.invoiceId ===
      INVOICE_ID &&
    firstPayment.allocations[0]!.amount.toString() ===
      "600" &&
    secondPayment?.paymentNumber ===
      "REC-2098-000002" &&
    secondPayment.amount.toString() === "550" &&
    secondPayment.unallocatedAmount.toString() === "0" &&
    secondPayment.status === "POSTED" &&
    secondPayment.postedAt !== null &&
    secondPayment.allocations.length === 1 &&
    secondPayment.allocations[0]!.invoiceId ===
      INVOICE_ID &&
    secondPayment.allocations[0]!.amount.toString() ===
      "550";

  const invoiceLedger = ledger.find(
    (e) =>
      e.referenceType === "SALES_INVOICE" &&
      e.referenceId === INVOICE_ID,
  );

  const firstLedger = ledger.find(
    (e) => e.id === FIRST_LEDGER_ID,
  );

  const secondLedger = ledger.find(
    (e) => e.id === SECOND_LEDGER_ID,
  );

  const subledgerCorrect =
    ledger.length === 3 &&
    invoiceLedger?.debit.toString() === "1150" &&
    invoiceLedger.credit.toString() === "0" &&
    firstLedger?.debit.toString() === "0" &&
    firstLedger.credit.toString() === "600" &&
    secondLedger?.debit.toString() === "0" &&
    secondLedger.credit.toString() === "550";

  const firstJournal = journals.find(
    (j) => j.id === FIRST_JOURNAL_ID,
  );

  const secondJournal = journals.find(
    (j) => j.id === SECOND_JOURNAL_ID,
  );

  const journalMatches = (
    journal:
      | (typeof journals)[number]
      | undefined,
    bankDebit: string,
    arCredit: string,
  ) =>
    journal?.status === "POSTED" &&
    journal.currencyCode === "GHS" &&
    journal.exchangeRate.toString() === "1" &&
    journal.postedAt !== null &&
    journal.lines.length === 2 &&
    journal.lines.some(
      (line) =>
        line.account.code === "1110" &&
        line.debit.toString() === bankDebit &&
        line.credit.toString() === "0",
    ) &&
    journal.lines.some(
      (line) =>
        line.account.code === "1200" &&
        line.debit.toString() === "0" &&
        line.credit.toString() === arCredit,
    );

  const journalsCorrect =
    journals.length === 2 &&
    firstJournal?.sourceId === FIRST_PAYMENT_ID &&
    firstJournal.journalNumber ===
      "JRN-2098-000008" &&
    journalMatches(firstJournal, "600", "600") &&
    secondJournal?.sourceId === SECOND_PAYMENT_ID &&
    secondJournal.journalNumber ===
      "JRN-2098-000009" &&
    journalMatches(secondJournal, "550", "550");

  const subledgerNet =
    ledger.reduce(
      (balance, entry) =>
        balance
          .plus(entry.debit)
          .minus(entry.credit),
      invoice.total.minus(invoice.total),
    );

  const customerBalanceSettled =
    subledgerNet.equals(0);

  const bankingBoundaryPreserved =
    financialAccount.accountType === "BANK" &&
    financialAccount.currencyCode === "GHS" &&
    financialAccount.status === "ACTIVE" &&
    financialAccount.ledgerAccount.code === "1110" &&
    financialAccount.ledgerAccount.type === "ASSET" &&
    financialAccount.ledgerAccount.normalBalance ===
      "DEBIT" &&
    financialAccount.ledgerAccount.status === "ACTIVE" &&
    financialAccount.currentBalanceCache.toString() ===
      "0" &&
    bankTransactionCount === 0;

  const sequenceCorrect =
    receiptSequence.nextNumber === 3n;

  console.log("");
  console.log("=== ASSERTIONS ===");
  console.log(
    "Invoice fully settled:",
    invoiceSettled,
  );
  console.log(
    "Both receipts preserved:",
    receiptsCorrect,
  );
  console.log(
    "Customer subledger correct:",
    subledgerCorrect,
  );
  console.log(
    "Both payment journals correct:",
    journalsCorrect,
  );
  console.log(
    "Customer A/R balance settled:",
    customerBalanceSettled,
  );
  console.log(
    "Banking boundary preserved:",
    bankingBoundaryPreserved,
  );
  console.log(
    "Receipt sequence preserved:",
    sequenceCorrect,
  );

  const passed =
    invoiceSettled &&
    receiptsCorrect &&
    subledgerCorrect &&
    journalsCorrect &&
    customerBalanceSettled &&
    bankingBoundaryPreserved &&
    sequenceCorrect;

  console.log("");
  console.log(
    passed
      ? "15Q.14E FINAL SETTLEMENT VERIFIER: PASS"
      : "15Q.14E FINAL SETTLEMENT VERIFIER: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.14E FINAL SETTLEMENT VERIFIER: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });