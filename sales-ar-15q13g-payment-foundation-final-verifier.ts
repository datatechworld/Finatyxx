import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const PAYMENT_ID =
  "faae4ca4-1073-4efa-a8e0-8da4961751ab";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

const CUSTOMER_LEDGER_ID =
  "e80a7016-41d7-4cf3-8aca-f2d84ee3f9fc";

const PAYMENT_JOURNAL_ID =
  "855bbcac-67c4-4a53-bbda-68b28bf04f71";

async function main() {
  console.log(
    "=== 15Q.13G.1 PAYMENT FOUNDATION FINAL VERIFIER ===",
  );

  const payment =
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

  const invoice =
    await prisma.invoice.findFirst({
      where: {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        currencyCode: true,
        exchangeRate: true,
        status: true,
        paidAt: true,
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

  const customerLedger =
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
        entryType: true,
        referenceType: true,
        referenceId: true,
        debit: true,
        credit: true,
        currencyCode: true,
      },
    });

  const paymentJournals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "CUSTOMER_PAYMENT",
        sourceId: PAYMENT_ID,
      },
      select: {
        id: true,
        journalNumber: true,
        branchId: true,
        sourceType: true,
        sourceId: true,
        currencyCode: true,
        exchangeRate: true,
        status: true,
        postedAt: true,

        lines: {
          select: {
            id: true,
            customerId: true,
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

  const bankTransactions =
    await prisma.bankTransaction.count({
      where: {
        tenantId: TENANT_ID,
        financialAccountId:
          FINANCIAL_ACCOUNT_ID,
      },
    });

  if (
    !payment ||
    !invoice ||
    !financialAccount
  ) {
    throw new Error(
      "STOP: required frozen evidence is missing.",
    );
  }

  const paymentJournal =
    paymentJournals[0];

  const bankLine =
    paymentJournal?.lines.find(
      (line) =>
        line.account.code === "1110",
    );

  const arLine =
    paymentJournal?.lines.find(
      (line) =>
        line.account.code === "1200",
    );

  const paymentVerified =
    payment.paymentNumber ===
      "REC-2098-000001" &&
    payment.status === "POSTED" &&
    payment.postedAt !== null &&
    payment.currencyCode === "GHS" &&
    payment.exchangeRate.toString() === "1" &&
    payment.amount.toString() === "600" &&
    payment.unallocatedAmount.toString() === "0" &&
    payment.financialAccountId ===
      FINANCIAL_ACCOUNT_ID &&
    payment.allocations.length === 1 &&
    payment.allocations[0]!.tenantId ===
      TENANT_ID &&
    payment.allocations[0]!.invoiceId ===
      INVOICE_ID &&
    payment.allocations[0]!.amount.toString() ===
      "600";

  const invoiceVerified =
    invoice.currencyCode === "GHS" &&
    invoice.exchangeRate.toString() === "1" &&
    invoice.total.toString() === "1150" &&
    invoice.amountPaid.toString() === "600" &&
    invoice.balanceDue.toString() === "550" &&
    invoice.status === "PARTIALLY_PAID" &&
    invoice.paidAt === null;

  const financialAccountVerified =
    financialAccount.accountType === "BANK" &&
    financialAccount.currencyCode === "GHS" &&
    financialAccount.status === "ACTIVE" &&
    financialAccount.openingBalance.toString() === "0" &&
    financialAccount.currentBalanceCache.toString() === "0" &&
    financialAccount.ledgerAccountId ===
      financialAccount.ledgerAccount.id &&
    financialAccount.ledgerAccount.tenantId ===
      TENANT_ID &&
    financialAccount.ledgerAccount.code === "1110" &&
    financialAccount.ledgerAccount.type === "ASSET" &&
    financialAccount.ledgerAccount.normalBalance ===
      "DEBIT" &&
    financialAccount.ledgerAccount.status === "ACTIVE";

  const customerLedgerVerified =
    customerLedger.length === 1 &&
    customerLedger[0]!.id ===
      CUSTOMER_LEDGER_ID &&
    customerLedger[0]!.tenantId ===
      TENANT_ID &&
    customerLedger[0]!.customerId ===
      payment.customerId &&
    customerLedger[0]!.branchId ===
      payment.branchId &&
    customerLedger[0]!.entryType === "PAYMENT" &&
    customerLedger[0]!.referenceType ===
      "CUSTOMER_PAYMENT" &&
    customerLedger[0]!.referenceId ===
      PAYMENT_ID &&
    customerLedger[0]!.debit.toString() === "0" &&
    customerLedger[0]!.credit.toString() === "600" &&
    customerLedger[0]!.currencyCode === "GHS";

  const paymentJournalVerified =
    paymentJournals.length === 1 &&
    paymentJournal !== undefined &&
    paymentJournal.id ===
      PAYMENT_JOURNAL_ID &&
    paymentJournal.journalNumber ===
      "JRN-2098-000008" &&
    paymentJournal.sourceType ===
      "CUSTOMER_PAYMENT" &&
    paymentJournal.sourceId === PAYMENT_ID &&
    paymentJournal.currencyCode === "GHS" &&
    paymentJournal.exchangeRate.toString() === "1" &&
    paymentJournal.status === "POSTED" &&
    paymentJournal.postedAt !== null &&
    paymentJournal.lines.length === 2 &&
    bankLine !== undefined &&
    bankLine.debit.toString() === "600" &&
    bankLine.credit.toString() === "0" &&
    bankLine.customerId ===
      payment.customerId &&
    arLine !== undefined &&
    arLine.debit.toString() === "0" &&
    arLine.credit.toString() === "600" &&
    arLine.customerId ===
      payment.customerId;

  const originalInvoiceJournalVerified =
    invoiceJournals.length === 1 &&
    invoiceJournals[0]!.status === "POSTED" &&
    invoiceJournals[0]!.lines.length === 3 &&
    invoiceJournals[0]!.lines.some(
      (line) =>
        line.account.code === "1200" &&
        line.debit.toString() === "1150" &&
        line.credit.toString() === "0",
    ) &&
    invoiceJournals[0]!.lines.some(
      (line) =>
        line.account.code === "4100" &&
        line.debit.toString() === "0" &&
        line.credit.toString() === "1000",
    ) &&
    invoiceJournals[0]!.lines.some(
      (line) =>
        line.account.code === "2200" &&
        line.debit.toString() === "0" &&
        line.credit.toString() === "150",
    );

  const bankingBoundaryVerified =
    bankTransactions === 0 &&
    financialAccount.currentBalanceCache.toString() ===
      "0";

  console.log("");
  console.log("=== FROZEN EVIDENCE ===");

  console.log({
    paymentId:
      payment.id,
    paymentNumber:
      payment.paymentNumber,
    paymentStatus:
      payment.status,
    paymentAmount:
      payment.amount.toString(),

    invoiceId:
      invoice.id,
    invoiceAmountPaid:
      invoice.amountPaid.toString(),
    invoiceBalanceDue:
      invoice.balanceDue.toString(),
    invoiceStatus:
      invoice.status,

    customerLedgerId:
      customerLedger[0]?.id ?? null,

    paymentJournalId:
      paymentJournal?.id ?? null,
    paymentJournalNumber:
      paymentJournal?.journalNumber ?? null,

    financialAccountId:
      financialAccount.id,
    financialAccountLedger:
      financialAccount.ledgerAccount.code,

    bankTransactions,

    currentBalanceCache:
      financialAccount.currentBalanceCache.toString(),
  });

  console.log("");
  console.log("=== ASSERTIONS ===");

  console.log(
    "Payment evidence:",
    paymentVerified,
  );

  console.log(
    "Invoice settlement:",
    invoiceVerified,
  );

  console.log(
    "Financial-account linkage:",
    financialAccountVerified,
  );

  console.log(
    "Customer subledger:",
    customerLedgerVerified,
  );

  console.log(
    "Payment GL:",
    paymentJournalVerified,
  );

  console.log(
    "Original invoice GL preserved:",
    originalInvoiceJournalVerified,
  );

  console.log(
    "Banking boundary preserved:",
    bankingBoundaryVerified,
  );

  const passed =
    paymentVerified &&
    invoiceVerified &&
    financialAccountVerified &&
    customerLedgerVerified &&
    paymentJournalVerified &&
    originalInvoiceJournalVerified &&
    bankingBoundaryVerified;

  console.log("");

  console.log(
    passed
      ? "15Q.13G.1 PAYMENT FOUNDATION FINAL VERIFIER: PASS"
      : "15Q.13G.1 PAYMENT FOUNDATION FINAL VERIFIER: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.13G.1 PAYMENT FOUNDATION FINAL VERIFIER: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });