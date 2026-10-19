import {
  Prisma,
} from "./src/generated/prisma/client.ts";

import { prisma } from "./src/db/prisma.ts";

import {
  allocateDocumentNumberInTransaction,
} from "./src/modules/documents/document-number.service.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

const PAYMENT_AMOUNT =
  new Prisma.Decimal("600");

const PAYMENT_DATE =
  "2098-06-20";

async function main() {
  console.log(
    "=== 15Q.13D CREATE PAYMENT FIXTURE ===",
  );

  /*
   * Safety preflight before any write.
   */
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
        currencyCode: true,
        exchangeRate: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        createdById: true,
      },
    });

  if (!invoice) {
    throw new Error(
      "STOP: frozen invoice fixture not found.",
    );
  }

  const invoiceReady =
    invoice.currencyCode === "GHS" &&
    invoice.exchangeRate.toString() === "1" &&
    invoice.total.toString() === "1150" &&
    invoice.amountPaid.toString() === "0" &&
    invoice.balanceDue.toString() === "1150" &&
    invoice.status === "POSTED";

  console.log("");
  console.log("Invoice ready:", invoiceReady);

  if (!invoiceReady) {
    throw new Error(
      "STOP: frozen invoice is not in the required pre-payment state.",
    );
  }

  const financialAccount =
    await prisma.financialAccount.findFirst({
      where: {
        id: FINANCIAL_ACCOUNT_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        branchId: true,
        currencyCode: true,
        ledgerAccountId: true,
        status: true,
      },
    });

  if (!financialAccount) {
    throw new Error(
      "STOP: financial-account fixture not found.",
    );
  }

  const financialAccountReady =
    financialAccount.status === "ACTIVE" &&
    financialAccount.currencyCode === "GHS" &&
    financialAccount.branchId ===
      invoice.branchId &&
    financialAccount.ledgerAccountId !== null;

  console.log(
    "Financial account ready:",
    financialAccountReady,
  );

  if (!financialAccountReady) {
    throw new Error(
      "STOP: financial account is not ready.",
    );
  }

  /*
   * This frozen customer/invoice must still have no payment
   * before we create the first receipt fixture.
   */
  const existingPayments =
    await prisma.payment.count({
      where: {
        tenantId: TENANT_ID,
        customerId: invoice.customerId,
      },
    });

  const existingAllocations =
    await prisma.paymentAllocation.count({
      where: {
        tenantId: TENANT_ID,
        invoiceId: INVOICE_ID,
      },
    });

  console.log("");
  console.log({
    existingPayments,
    existingAllocations,
  });

  if (
    existingPayments !== 0 ||
    existingAllocations !== 0
  ) {
    throw new Error(
      "STOP: payment fixture already exists. Do not create another.",
    );
  }

  /*
   * Create the DRAFT receipt and its allocation atomically.
   *
   * Document-number allocation participates in this same
   * transaction, so a failed creation does not consume a
   * receipt number.
   */
  const created =
    await prisma.$transaction(
      async (tx) => {
        const allocated =
          await allocateDocumentNumberInTransaction(
            tx,
            TENANT_ID,
            "RECEIPT",
            PAYMENT_DATE,
          );

        const payment =
          await tx.payment.create({
            data: {
              tenantId: TENANT_ID,
              branchId: invoice.branchId,
              customerId: invoice.customerId,
              paymentNumber:
                allocated.documentNumber,
              paymentDate:
                new Date(
                  `${PAYMENT_DATE}T00:00:00.000Z`,
                ),
              currencyCode: "GHS",
              exchangeRate:
                new Prisma.Decimal("1"),
              amount: PAYMENT_AMOUNT,
              unallocatedAmount:
                new Prisma.Decimal("0"),
              financialAccountId:
                FINANCIAL_ACCOUNT_ID,
              reference:
                "15Q.13D GHS 600 receipt test",
              notes:
                "Immutable Sales/AR customer-payment behavioral fixture.",
              status: "DRAFT",
              receivedById:
                invoice.createdById,
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

        const allocation =
          await tx.paymentAllocation.create({
            data: {
              tenantId: TENANT_ID,
              paymentId: payment.id,
              invoiceId: INVOICE_ID,
              amount: PAYMENT_AMOUNT,
            },
            select: {
              id: true,
              tenantId: true,
              paymentId: true,
              invoiceId: true,
              amount: true,
            },
          });

        return {
          payment,
          allocation,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

  console.log("");
  console.log("=== CREATED PAYMENT ===");

  console.log({
    ...created.payment,
    exchangeRate:
      created.payment.exchangeRate.toString(),
    amount:
      created.payment.amount.toString(),
    unallocatedAmount:
      created.payment.unallocatedAmount.toString(),
  });

  console.log("");
  console.log("=== CREATED ALLOCATION ===");

  console.log({
    ...created.allocation,
    amount:
      created.allocation.amount.toString(),
  });

  /*
   * Post-write verification from a fresh query.
   */
  const payment =
    await prisma.payment.findFirst({
      where: {
        id: created.payment.id,
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

  if (!payment) {
    throw new Error(
      "STOP: created payment could not be re-read.",
    );
  }

  const paymentVerified =
    payment.tenantId === TENANT_ID &&
    payment.branchId === invoice.branchId &&
    payment.customerId === invoice.customerId &&
    payment.paymentNumber.startsWith(
      "REC-2098-",
    ) &&
    payment.currencyCode === "GHS" &&
    payment.exchangeRate.toString() === "1" &&
    payment.amount.toString() === "600" &&
    payment.unallocatedAmount.toString() === "0" &&
    payment.financialAccountId ===
      FINANCIAL_ACCOUNT_ID &&
    payment.status === "DRAFT" &&
    payment.postedAt === null &&
    payment.allocations.length === 1 &&
    payment.allocations[0]!.tenantId ===
      TENANT_ID &&
    payment.allocations[0]!.invoiceId ===
      INVOICE_ID &&
    payment.allocations[0]!.amount.toString() ===
      "600";

  /*
   * Creating the DRAFT payment must not touch accounting.
   */
  const paymentLedgerCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "CUSTOMER_PAYMENT",
        referenceId: payment.id,
      },
    });

  const paymentJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "CUSTOMER_PAYMENT",
        sourceId: payment.id,
      },
    });

  const invoiceAfter =
    await prisma.invoice.findFirst({
      where: {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
      },
      select: {
        amountPaid: true,
        balanceDue: true,
        status: true,
      },
    });

  if (!invoiceAfter) {
    throw new Error(
      "STOP: invoice disappeared after fixture creation.",
    );
  }

  const accountingUntouched =
    paymentLedgerCount === 0 &&
    paymentJournalCount === 0 &&
    invoiceAfter.amountPaid.toString() === "0" &&
    invoiceAfter.balanceDue.toString() === "1150" &&
    invoiceAfter.status === "POSTED";

  console.log("");
  console.log("=== ASSERTIONS ===");

  console.log(
    "Payment fixture verified:",
    paymentVerified,
  );

  console.log(
    "Accounting untouched:",
    accountingUntouched,
  );

  console.log(
    "Customer-ledger payment rows:",
    paymentLedgerCount,
  );

  console.log(
    "Payment journals:",
    paymentJournalCount,
  );

  console.log("");
  console.log(
    "PAYMENT_FIXTURE_ID=" + payment.id,
  );

  console.log(
    "PAYMENT_NUMBER=" +
      payment.paymentNumber,
  );

  console.log("");

  const passed =
    paymentVerified &&
    accountingUntouched;

  console.log(
    passed
      ? "15Q.13D CREATE PAYMENT FIXTURE: PASS"
      : "15Q.13D CREATE PAYMENT FIXTURE: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.13D CREATE PAYMENT FIXTURE: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });