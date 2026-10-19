import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

const PAYMENT_ID =
  "94d4433f-c996-443c-9470-0ccb72e6d12d";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  console.log(
    "=== 15R.11G READ-ONLY TIMEOUT STATE ===",
  );

  const payment =
    await prisma.supplierPayment.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: PAYMENT_ID,
        },
      },
      include: {
        allocations: true,
      },
    });

  const bill =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BILL_ID,
        },
      },
    });

  assert(payment, "Supplier Payment fixture missing.");
  assert(bill, "Supplier Bill missing.");

  const supplierLedgerEntries =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_PAYMENT",
        referenceId: PAYMENT_ID,
      },
      select: {
        id: true,
        entryType: true,
        debit: true,
        credit: true,
      },
    });

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_PAYMENT",
        sourceId: PAYMENT_ID,
      },
      select: {
        id: true,
        journalNumber: true,
        status: true,
      },
    });

  console.dir(
    {
      payment: {
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        status: payment.status,
        postedAt: payment.postedAt,
        amount: payment.amount.toString(),
        unallocatedAmount:
          payment.unallocatedAmount.toString(),
        allocationCount:
          payment.allocations.length,
      },

      bill: {
        id: bill.id,
        status: bill.status,
        amountPaid:
          bill.amountPaid.toString(),
        balanceDue:
          bill.balanceDue.toString(),
      },

      supplierLedgerEntries:
        supplierLedgerEntries.map((entry) => ({
          id: entry.id,
          entryType: entry.entryType,
          debit: entry.debit.toString(),
          credit: entry.credit.toString(),
        })),

      journals,
    },
    { depth: null },
  );

  assert(
    payment.status === "DRAFT",
    `Expected payment DRAFT; found ${payment.status}.`,
  );

  assert(
    payment.postedAt === null,
    "Payment unexpectedly has postedAt.",
  );

  assert(
    payment.amount.equals(1150),
    "Payment amount changed.",
  );

  assert(
    payment.unallocatedAmount.equals(0),
    "Payment unallocatedAmount changed.",
  );

  assert(
    payment.allocations.length === 1,
    "Expected exactly one preserved allocation.",
  );

  assert(
    payment.allocations[0]?.supplierBillId ===
      BILL_ID,
    "Allocation Supplier Bill mismatch.",
  );

  assert(
    payment.allocations[0]?.amount.equals(1150),
    "Allocation amount changed.",
  );

  assert(
    bill.status === "POSTED",
    `Expected bill POSTED; found ${bill.status}.`,
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
    supplierLedgerEntries.length === 0,
    "Supplier Ledger posting residue exists.",
  );

  assert(
    journals.length === 0,
    "Journal posting residue exists.",
  );

  console.log("");
  console.log(
    "15R.11G TIMEOUT ROLLBACK: VERIFIED",
  );

  console.log(
    "Payment fixture preserved as DRAFT.",
  );

  console.log(
    "Production posting transaction fully rolled back.",
  );

  console.log(
    "DATABASE MUTATIONS: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("15R.11G: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });