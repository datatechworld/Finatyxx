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

const POSTED_BY_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

async function readState() {
  const payment =
    await prisma.payment.findFirst({
      where: {
        id: PAYMENT_ID,
        tenantId: TENANT_ID,
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

  const ledgerEntries =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "CUSTOMER_PAYMENT",
        referenceId: PAYMENT_ID,
      },
      select: {
        id: true,
        debit: true,
        credit: true,
        entryType: true,
        referenceType: true,
        referenceId: true,
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
        journalNumber: true,
        status: true,

        lines: {
          select: {
            id: true,
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

  return {
    payment,
    invoice,
    ledgerEntries,
    journals,
  };
}

function snapshot(state: Awaited<ReturnType<typeof readState>>) {
  if (!state.payment || !state.invoice) {
    throw new Error(
      "STOP: immutable payment/invoice evidence is missing.",
    );
  }

  return JSON.stringify({
    payment: {
      id: state.payment.id,
      paymentNumber:
        state.payment.paymentNumber,
      amount:
        state.payment.amount.toString(),
      unallocatedAmount:
        state.payment.unallocatedAmount.toString(),
      status:
        state.payment.status,
      postedAt:
        state.payment.postedAt?.toISOString() ??
        null,
    },

    invoice: {
      id:
        state.invoice.id,
      total:
        state.invoice.total.toString(),
      amountPaid:
        state.invoice.amountPaid.toString(),
      balanceDue:
        state.invoice.balanceDue.toString(),
      status:
        state.invoice.status,
      paidAt:
        state.invoice.paidAt?.toISOString() ??
        null,
    },

    ledgerEntries:
      state.ledgerEntries
        .map((entry) => ({
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
        }))
        .sort((a, b) =>
          a.id.localeCompare(b.id),
        ),

    journals:
      state.journals
        .map((journal) => ({
          id:
            journal.id,
          journalNumber:
            journal.journalNumber,
          status:
            journal.status,

          lines:
            journal.lines
              .map((line) => ({
                id:
                  line.id,
                code:
                  line.account.code,
                debit:
                  line.debit.toString(),
                credit:
                  line.credit.toString(),
              }))
              .sort((a, b) =>
                a.id.localeCompare(b.id),
              ),
        }))
        .sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
  });
}

async function main() {
  console.log(
    "=== 15Q.13F PAYMENT IDEMPOTENCY TEST ===",
  );

  const before =
    await readState();

  if (!before.payment || !before.invoice) {
    throw new Error(
      "STOP: 15Q.13E immutable evidence is missing.",
    );
  }

  const beforeValid =
    before.payment.status === "POSTED" &&
    before.payment.amount.toString() === "600" &&
    before.payment.unallocatedAmount.toString() === "0" &&
    before.invoice.total.toString() === "1150" &&
    before.invoice.amountPaid.toString() === "600" &&
    before.invoice.balanceDue.toString() === "550" &&
    before.invoice.status === "PARTIALLY_PAID" &&
    before.ledgerEntries.length === 1 &&
    before.journals.length === 1;

  console.log("");
  console.log(
    "Frozen pre-state valid:",
    beforeValid,
  );

  if (!beforeValid) {
    throw new Error(
      "STOP: immutable payment evidence is not in the expected state.",
    );
  }

  const beforeSnapshot =
    snapshot(before);

  let duplicateRejected = false;
  let rejectionCode: string | null = null;
  let rejectionMessage: string | null = null;

  console.log("");
  console.log(
    "=== ATTEMPTING DUPLICATE POST ===",
  );

  try {
    await postCustomerPayment({
      tenantId: TENANT_ID,
      paymentId: PAYMENT_ID,
      postedById: POSTED_BY_ID,
    });

    throw new Error(
      "STOP: duplicate payment posting unexpectedly succeeded.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "STOP: duplicate payment posting unexpectedly succeeded."
    ) {
      throw error;
    }

    duplicateRejected = true;

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      rejectionCode = error.code;
    }

    if (error instanceof Error) {
      rejectionMessage = error.message;
    }

    console.log({
      duplicateRejected,
      rejectionCode,
      rejectionMessage,
    });
  }

  const after =
    await readState();

  const afterSnapshot =
    snapshot(after);

  const evidenceUnchanged =
    beforeSnapshot === afterSnapshot;

  const countsStillUnique =
    after.ledgerEntries.length === 1 &&
    after.journals.length === 1;

  const duplicateContractPassed =
    duplicateRejected &&
    rejectionCode === "PAYMENT_NOT_DRAFT";

  console.log("");
  console.log("=== ASSERTIONS ===");

  console.log(
    "Duplicate rejected:",
    duplicateRejected,
  );

  console.log(
    "Rejection code PAYMENT_NOT_DRAFT:",
    rejectionCode === "PAYMENT_NOT_DRAFT",
  );

  console.log(
    "Financial evidence unchanged:",
    evidenceUnchanged,
  );

  console.log(
    "Ledger/journal source counts remain 1/1:",
    countsStillUnique,
  );

  const passed =
    duplicateContractPassed &&
    evidenceUnchanged &&
    countsStillUnique;

  console.log("");

  console.log(
    passed
      ? "15Q.13F PAYMENT IDEMPOTENCY TEST: PASS"
      : "15Q.13F PAYMENT IDEMPOTENCY TEST: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.13F PAYMENT IDEMPOTENCY TEST: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });