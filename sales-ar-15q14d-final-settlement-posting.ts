import { prisma } from "./src/db/prisma.ts";
import {
  postCustomerPayment,
} from "./src/modules/sales/customer-payment-posting.service.ts";

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

const POSTED_BY_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

async function main() {
  console.log(
    "=== 15Q.14D FINAL SETTLEMENT POSTING ===",
  );

  /*
   * PRE-WRITE SAFETY GATE
   *
   * Reconfirm the exact 15Q.14C state immediately before
   * invoking the production posting service.
   */
  const invoiceBefore =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: INVOICE_ID,
      },
      select: {
        id: true,
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

  const paymentBefore =
    await prisma.payment.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: SECOND_PAYMENT_ID,
      },
      select: {
        id: true,
        customerId: true,
        branchId: true,
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
            paymentId: true,
            invoiceId: true,
            amount: true,
          },
        },
      },
    });

  const ledgerBefore =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "CUSTOMER_PAYMENT",
        referenceId: SECOND_PAYMENT_ID,
      },
    });

  const journalBefore =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "CUSTOMER_PAYMENT",
        sourceId: SECOND_PAYMENT_ID,
      },
    });

  if (!invoiceBefore || !paymentBefore) {
    throw new Error(
      "STOP: required invoice/payment fixture is missing.",
    );
  }

  const preWriteSafe =
    invoiceBefore.currencyCode === "GHS" &&
    invoiceBefore.exchangeRate.toString() === "1" &&
    invoiceBefore.total.toString() === "1150" &&
    invoiceBefore.amountPaid.toString() === "600" &&
    invoiceBefore.balanceDue.toString() === "550" &&
    invoiceBefore.status === "PARTIALLY_PAID" &&
    invoiceBefore.postedAt !== null &&
    invoiceBefore.paidAt === null &&

    paymentBefore.paymentNumber ===
      "REC-2098-000002" &&
    paymentBefore.currencyCode === "GHS" &&
    paymentBefore.exchangeRate.toString() === "1" &&
    paymentBefore.amount.toString() === "550" &&
    paymentBefore.unallocatedAmount.toString() === "0" &&
    paymentBefore.financialAccountId ===
      FINANCIAL_ACCOUNT_ID &&
    paymentBefore.status === "DRAFT" &&
    paymentBefore.postedAt === null &&
    paymentBefore.customerId ===
      invoiceBefore.customerId &&
    paymentBefore.branchId ===
      invoiceBefore.branchId &&

    paymentBefore.allocations.length === 1 &&
    paymentBefore.allocations[0]!.id ===
      SECOND_ALLOCATION_ID &&
    paymentBefore.allocations[0]!.tenantId ===
      TENANT_ID &&
    paymentBefore.allocations[0]!.paymentId ===
      SECOND_PAYMENT_ID &&
    paymentBefore.allocations[0]!.invoiceId ===
      INVOICE_ID &&
    paymentBefore.allocations[0]!.amount.toString() ===
      "550" &&

    ledgerBefore === 0 &&
    journalBefore === 0;

  console.log("");
  console.log(
    "Pre-write safety gate:",
    preWriteSafe,
  );

  if (!preWriteSafe) {
    throw new Error(
      "STOP: database no longer matches the verified 15Q.14C pre-posting state.",
    );
  }

  /*
   * PRODUCTION WRITE
   */
  console.log("");
  console.log(
    "Posting REC-2098-000002 through production service...",
  );

  const result =
    await postCustomerPayment({
      tenantId: TENANT_ID,
      paymentId: SECOND_PAYMENT_ID,
      postedById: POSTED_BY_ID,
    });

  console.log("");
  console.log("=== POSTING SERVICE RESULT ===");

  console.log({
    paymentId:
      result.paymentId,
    paymentNumber:
      result.paymentNumber,
    status:
      result.status,
    amount:
      result.amount.toString(),
    allocatedAmount:
      result.allocatedAmount.toString(),
    unallocatedAmount:
      result.unallocatedAmount.toString(),
    customerLedgerEntryId:
      result.customerLedgerEntryId,
    journalEntryId:
      result.journalEntryId,
    journalNumber:
      result.journalNumber,
  });

  /*
   * POST-COMMIT VERIFICATION
   */
  const paymentAfter =
    await prisma.payment.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: SECOND_PAYMENT_ID,
      },
      select: {
        id: true,
        paymentNumber: true,
        amount: true,
        unallocatedAmount: true,
        status: true,
        postedAt: true,
        financialAccountId: true,
      },
    });

  const invoiceAfter =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: INVOICE_ID,
      },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        postedAt: true,
        paidAt: true,
      },
    });

  const secondLedgerEntries =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "CUSTOMER_PAYMENT",
        referenceId: SECOND_PAYMENT_ID,
      },
      select: {
        id: true,
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

  const secondJournals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "CUSTOMER_PAYMENT",
        sourceId: SECOND_PAYMENT_ID,
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

  const firstPayment =
    await prisma.payment.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FIRST_PAYMENT_ID,
      },
      select: {
        paymentNumber: true,
        amount: true,
        unallocatedAmount: true,
        status: true,
        postedAt: true,
      },
    });

  const firstLedgerCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "CUSTOMER_PAYMENT",
        referenceId: FIRST_PAYMENT_ID,
      },
    });

  const firstJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "CUSTOMER_PAYMENT",
        sourceId: FIRST_PAYMENT_ID,
      },
    });

  const invoiceLedger =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        customerId: invoiceBefore.customerId,
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
      select: {
        entryType: true,
        referenceType: true,
        referenceId: true,
        debit: true,
        credit: true,
        currencyCode: true,
      },
    });

  const financialAccount =
    await prisma.financialAccount.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FINANCIAL_ACCOUNT_ID,
      },
      select: {
        currentBalanceCache: true,
        ledgerAccount: {
          select: {
            code: true,
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

  if (
    !paymentAfter ||
    !invoiceAfter ||
    !firstPayment ||
    !financialAccount
  ) {
    throw new Error(
      "STOP: post-commit verification could not load required records.",
    );
  }

  console.log("");
  console.log("=== POSTED PAYMENT ===");

  console.log({
    id:
      paymentAfter.id,
    paymentNumber:
      paymentAfter.paymentNumber,
    amount:
      paymentAfter.amount.toString(),
    unallocatedAmount:
      paymentAfter.unallocatedAmount.toString(),
    status:
      paymentAfter.status,
    postedAt:
      paymentAfter.postedAt,
    financialAccountId:
      paymentAfter.financialAccountId,
  });

  console.log("");
  console.log("=== SETTLED INVOICE ===");

  console.log({
    id:
      invoiceAfter.id,
    invoiceNumber:
      invoiceAfter.invoiceNumber,
    total:
      invoiceAfter.total.toString(),
    amountPaid:
      invoiceAfter.amountPaid.toString(),
    balanceDue:
      invoiceAfter.balanceDue.toString(),
    status:
      invoiceAfter.status,
    postedAt:
      invoiceAfter.postedAt,
    paidAt:
      invoiceAfter.paidAt,
  });

  console.log("");
  console.log("=== SECOND CUSTOMER LEDGER ENTRY ===");

  console.log(
    secondLedgerEntries.map(
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
  console.log("=== SECOND PAYMENT JOURNAL ===");

  console.log(
    secondJournals.map(
      (journal) => ({
        id:
          journal.id,
        journalNumber:
          journal.journalNumber,
        journalDate:
          journal.journalDate,
        sourceType:
          journal.sourceType,
        sourceId:
          journal.sourceId,
        currencyCode:
          journal.currencyCode,
        exchangeRate:
          journal.exchangeRate.toString(),
        status:
          journal.status,
        postedAt:
          journal.postedAt,

        lines:
          journal.lines.map(
            (line) => ({
              code:
                line.account.code,
              name:
                line.account.name,
              debit:
                line.debit.toString(),
              credit:
                line.credit.toString(),
              customerId:
                line.customerId,
            }),
          ),
      }),
    ),
  );

  /*
   * ASSERTIONS
   */
  const paymentPosted =
    result.paymentId === SECOND_PAYMENT_ID &&
    result.paymentNumber === "REC-2098-000002" &&
    result.status === "POSTED" &&
    result.amount.toString() === "550" &&
    result.allocatedAmount.toString() === "550" &&
    result.unallocatedAmount.toString() === "0" &&
    paymentAfter.paymentNumber === "REC-2098-000002" &&
    paymentAfter.amount.toString() === "550" &&
    paymentAfter.unallocatedAmount.toString() === "0" &&
    paymentAfter.status === "POSTED" &&
    paymentAfter.postedAt !== null &&
    paymentAfter.financialAccountId ===
      FINANCIAL_ACCOUNT_ID;

  const invoiceSettled =
    invoiceAfter.total.toString() === "1150" &&
    invoiceAfter.amountPaid.toString() === "1150" &&
    invoiceAfter.balanceDue.toString() === "0" &&
    invoiceAfter.status === "PAID" &&
    invoiceAfter.postedAt !== null &&
    invoiceAfter.paidAt !== null;

  const ledgerCorrect =
    secondLedgerEntries.length === 1 &&
    secondLedgerEntries[0]!.id ===
      result.customerLedgerEntryId &&
    secondLedgerEntries[0]!.entryType === "PAYMENT" &&
    secondLedgerEntries[0]!.referenceType ===
      "CUSTOMER_PAYMENT" &&
    secondLedgerEntries[0]!.referenceId ===
      SECOND_PAYMENT_ID &&
    secondLedgerEntries[0]!.debit.toString() === "0" &&
    secondLedgerEntries[0]!.credit.toString() === "550" &&
    secondLedgerEntries[0]!.currencyCode === "GHS";

  const journalCorrect =
    secondJournals.length === 1 &&
    secondJournals[0]!.id === result.journalEntryId &&
    secondJournals[0]!.journalNumber ===
      result.journalNumber &&
    secondJournals[0]!.sourceType ===
      "CUSTOMER_PAYMENT" &&
    secondJournals[0]!.sourceId ===
      SECOND_PAYMENT_ID &&
    secondJournals[0]!.currencyCode === "GHS" &&
    secondJournals[0]!.exchangeRate.toString() === "1" &&
    secondJournals[0]!.status === "POSTED" &&
    secondJournals[0]!.postedAt !== null &&
    secondJournals[0]!.lines.length === 2 &&
    secondJournals[0]!.lines.some(
      (line) =>
        line.account.code === "1110" &&
        line.debit.toString() === "550" &&
        line.credit.toString() === "0",
    ) &&
    secondJournals[0]!.lines.some(
      (line) =>
        line.account.code === "1200" &&
        line.debit.toString() === "0" &&
        line.credit.toString() === "550",
    );

  const firstReceiptPreserved =
    firstPayment.paymentNumber ===
      "REC-2098-000001" &&
    firstPayment.amount.toString() === "600" &&
    firstPayment.unallocatedAmount.toString() === "0" &&
    firstPayment.status === "POSTED" &&
    firstPayment.postedAt !== null &&
    firstLedgerCount === 1 &&
    firstJournalCount === 1;

  const customerSubledgerSettled =
    invoiceLedger.length === 3 &&
    invoiceLedger.reduce(
      (total, entry) =>
        total
          .plus(entry.debit)
          .minus(entry.credit),
      new (
        invoiceAfter.total.constructor as typeof import(
          "./src/generated/prisma/client.ts"
        ).Prisma.Decimal
      )(0),
    ).equals(0);

  const bankingBoundaryPreserved =
    financialAccount.ledgerAccount.code === "1110" &&
    financialAccount.currentBalanceCache.toString() === "0" &&
    bankTransactionCount === 0;

  console.log("");
  console.log("=== ASSERTIONS ===");

  console.log(
    "Second receipt posted:",
    paymentPosted,
  );

  console.log(
    "Invoice fully settled:",
    invoiceSettled,
  );

  console.log(
    "Customer ledger correct:",
    ledgerCorrect,
  );

  console.log(
    "General ledger correct:",
    journalCorrect,
  );

  console.log(
    "First receipt preserved:",
    firstReceiptPreserved,
  );

  console.log(
    "Customer subledger net settled:",
    customerSubledgerSettled,
  );

  console.log(
    "Banking boundary preserved:",
    bankingBoundaryPreserved,
  );

  const passed =
    paymentPosted &&
    invoiceSettled &&
    ledgerCorrect &&
    journalCorrect &&
    firstReceiptPreserved &&
    customerSubledgerSettled &&
    bankingBoundaryPreserved;

  console.log("");

  console.log(
    passed
      ? "15Q.14D FINAL SETTLEMENT POSTING: PASS"
      : "15Q.14D FINAL SETTLEMENT POSTING: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.14D FINAL SETTLEMENT POSTING: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });