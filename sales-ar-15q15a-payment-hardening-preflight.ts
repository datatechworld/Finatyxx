import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FIRST_PAYMENT_ID =
  "faae4ca4-1073-4efa-a8e0-8da4961751ab";

const SECOND_PAYMENT_ID =
  "5c0d8611-5c78-4fb7-a709-e9f51f581a74";

async function main() {
  console.log(
    "=== 15Q.15A PAYMENT HARDENING PREFLIGHT ===",
  );

  /*
   * Verify that the payments table supports the exact
   * tenant-safe row-lock predicate we intend to use.
   *
   * This SELECT does NOT use FOR UPDATE because this
   * checkpoint is intentionally read-only.
   */
  const paymentRows = await prisma.$queryRaw<
    Array<{
      id: string;
      tenantId: string;
      status: string;
    }>
  >`
    SELECT
      id::text AS id,
      "tenantId"::text AS "tenantId",
      status::text AS status
    FROM public.payments
    WHERE "tenantId" = ${TENANT_ID}::uuid
      AND id = ANY(
        ${[
          FIRST_PAYMENT_ID,
          SECOND_PAYMENT_ID,
        ]}::uuid[]
      )
    ORDER BY id
  `;

  const invoice =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: INVOICE_ID,
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

  const payments =
    await prisma.payment.findMany({
      where: {
        tenantId: TENANT_ID,
        id: {
          in: [
            FIRST_PAYMENT_ID,
            SECOND_PAYMENT_ID,
          ],
        },
      },
      select: {
        id: true,
        paymentNumber: true,
        amount: true,
        unallocatedAmount: true,
        status: true,
        postedAt: true,
        allocations: {
          select: {
            amount: true,
            invoiceId: true,
          },
        },
      },
    });

  const ledgerCounts =
    await Promise.all(
      [
        FIRST_PAYMENT_ID,
        SECOND_PAYMENT_ID,
      ].map(async (paymentId) => ({
        paymentId,
        count:
          await prisma.customerLedgerEntry.count({
            where: {
              tenantId: TENANT_ID,
              referenceType:
                "CUSTOMER_PAYMENT",
              referenceId: paymentId,
            },
          }),
      })),
    );

  const journalCounts =
    await Promise.all(
      [
        FIRST_PAYMENT_ID,
        SECOND_PAYMENT_ID,
      ].map(async (paymentId) => ({
        paymentId,
        count:
          await prisma.journalEntry.count({
            where: {
              tenantId: TENANT_ID,
              sourceType:
                "CUSTOMER_PAYMENT",
              sourceId: paymentId,
            },
          }),
      })),
    );

  console.log("");
  console.log("=== PAYMENT ROW CONTRACT ===");
  console.log(paymentRows);

  console.log("");
  console.log("=== FROZEN INVOICE ===");
  console.log(
    invoice
      ? {
          id: invoice.id,
          total:
            invoice.total.toString(),
          amountPaid:
            invoice.amountPaid.toString(),
          balanceDue:
            invoice.balanceDue.toString(),
          status:
            invoice.status,
          paidAt:
            invoice.paidAt,
        }
      : null,
  );

  console.log("");
  console.log("=== FROZEN RECEIPTS ===");

  console.log(
    payments.map((payment) => ({
      id:
        payment.id,
      paymentNumber:
        payment.paymentNumber,
      amount:
        payment.amount.toString(),
      allocatedAmount:
        payment.allocations
          .reduce(
            (total, allocation) =>
              total.plus(allocation.amount),
            payment.amount.minus(
              payment.amount,
            ),
          )
          .toString(),
      unallocatedAmount:
        payment.unallocatedAmount.toString(),
      status:
        payment.status,
      postedAt:
        payment.postedAt,
    })),
  );

  console.log("");
  console.log("=== IDEMPOTENCY EVIDENCE ===");

  console.log({
    ledgerCounts,
    journalCounts,
  });

  const paymentRowContractReady =
    paymentRows.length === 2 &&
    paymentRows.every(
      (row) =>
        row.tenantId === TENANT_ID &&
        row.status === "POSTED",
    );

  const invoicePreserved =
    !!invoice &&
    invoice.total.toString() === "1150" &&
    invoice.amountPaid.toString() ===
      "1150" &&
    invoice.balanceDue.toString() === "0" &&
    invoice.status === "PAID" &&
    invoice.paidAt !== null;

  const firstPayment =
    payments.find(
      (payment) =>
        payment.id === FIRST_PAYMENT_ID,
    );

  const secondPayment =
    payments.find(
      (payment) =>
        payment.id === SECOND_PAYMENT_ID,
    );

  const firstAllocated =
    firstPayment?.allocations.reduce(
      (total, allocation) =>
        total.plus(allocation.amount),
      firstPayment.amount.minus(
        firstPayment.amount,
      ),
    );

  const secondAllocated =
    secondPayment?.allocations.reduce(
      (total, allocation) =>
        total.plus(allocation.amount),
      secondPayment.amount.minus(
        secondPayment.amount,
      ),
    );

  const fullyAllocatedEvidence =
    payments.length === 2 &&
    firstPayment?.amount.toString() ===
      "600" &&
    firstAllocated?.toString() ===
      "600" &&
    firstPayment.unallocatedAmount.toString() ===
      "0" &&
    firstPayment.status === "POSTED" &&
    secondPayment?.amount.toString() ===
      "550" &&
    secondAllocated?.toString() ===
      "550" &&
    secondPayment.unallocatedAmount.toString() ===
      "0" &&
    secondPayment.status === "POSTED";

  const idempotencyEvidencePreserved =
    ledgerCounts.length === 2 &&
    ledgerCounts.every(
      (item) => item.count === 1,
    ) &&
    journalCounts.length === 2 &&
    journalCounts.every(
      (item) => item.count === 1,
    );

  console.log("");
  console.log("=== ASSERTIONS ===");

  console.log(
    "Payment row-lock contract ready:",
    paymentRowContractReady,
  );

  console.log(
    "Frozen invoice preserved:",
    invoicePreserved,
  );

  console.log(
    "Fully allocated receipt evidence preserved:",
    fullyAllocatedEvidence,
  );

  console.log(
    "Idempotency evidence preserved:",
    idempotencyEvidencePreserved,
  );

  const passed =
    paymentRowContractReady &&
    invoicePreserved &&
    fullyAllocatedEvidence &&
    idempotencyEvidencePreserved;

  console.log("");

  console.log(
    passed
      ? "15Q.15A PAYMENT HARDENING PREFLIGHT: PASS"
      : "15Q.15A PAYMENT HARDENING PREFLIGHT: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.15A PAYMENT HARDENING PREFLIGHT: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });