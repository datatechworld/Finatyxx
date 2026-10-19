import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("=== 15R.11D FAILURE STATE ===");

  const bill =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BILL_ID,
        },
      },
    });

  assert(
    bill,
    "Supplier Bill not found.",
  );

  const payments =
    await prisma.supplierPayment.findMany({
      where: {
        tenantId: TENANT_ID,
        paymentNumber: {
          startsWith: "PAY-15R11D-",
        },
      },
      select: {
        id: true,
        paymentNumber: true,
        status: true,
        postedAt: true,
        amount: true,
        unallocatedAmount: true,
      },
    });

  const allocations =
    await prisma.supplierPaymentAllocation.count({
      where: {
        tenantId: TENANT_ID,
        supplierBillId: BILL_ID,
      },
    });

  const paymentIds =
    payments.map(
      (payment) => payment.id,
    );

  const supplierLedgerCount =
    paymentIds.length === 0
      ? 0
      : await prisma.supplierLedgerEntry.count({
          where: {
            tenantId: TENANT_ID,
            referenceType:
              "SUPPLIER_PAYMENT",
            referenceId: {
              in: paymentIds,
            },
          },
        });

  const journalCount =
    paymentIds.length === 0
      ? 0
      : await prisma.journalEntry.count({
          where: {
            tenantId: TENANT_ID,
            sourceType: "SUPPLIER_PAYMENT",
            sourceId: {
              in: paymentIds,
            },
          },
        });

  console.dir(
    {
      supplierBill: {
        id: bill.id,
        billNumber: bill.billNumber,
        status: bill.status,
        postedAt: bill.postedAt,
        amountPaid:
          bill.amountPaid.toString(),
        balanceDue:
          bill.balanceDue.toString(),
      },

      surviving15R11DPayments:
        payments.map((payment) => ({
          id: payment.id,
          paymentNumber:
            payment.paymentNumber,
          status: payment.status,
          postedAt: payment.postedAt,
          amount:
            payment.amount.toString(),
          unallocatedAmount:
            payment.unallocatedAmount.toString(),
        })),

      allocationsForBill: allocations,
      supplierPaymentLedgerCount:
        supplierLedgerCount,
      supplierPaymentJournalCount:
        journalCount,
    },
    { depth: null },
  );

  assert(
    bill.status === "POSTED",
    `Expected Supplier Bill POSTED; found ${bill.status}.`,
  );

  assert(
    bill.amountPaid.equals(0),
    "Supplier Bill amountPaid changed.",
  );

  assert(
    bill.balanceDue.equals(1150),
    "Supplier Bill balanceDue changed.",
  );

  assert(
    payments.length === 0,
    "A 15R.11D Supplier Payment unexpectedly survived.",
  );

  assert(
    allocations === 0,
    "A Supplier Payment allocation unexpectedly survived.",
  );

  assert(
    supplierLedgerCount === 0,
    "Unexpected Supplier Payment ledger evidence exists.",
  );

  assert(
    journalCount === 0,
    "Unexpected Supplier Payment journal evidence exists.",
  );

  console.log("");
  console.log(
    "15R.11D FAILURE ROLLBACK/NO-CREATE STATE: VERIFIED",
  );

  console.log(
    "Supplier Bill remains POSTED with GHS 1150 outstanding.",
  );

  console.log(
    "No 15R.11D Supplier Payment survived.",
  );

  console.log("");
  console.log(
    "DATABASE MUTATIONS: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("15R.11D-R: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });