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
  const bill =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BILL_ID,
        },
      },
    });

  assert(bill, "Supplier Bill not found.");

  const failedPayments =
    await prisma.supplierPayment.findMany({
      where: {
        tenantId: TENANT_ID,
        OR: [
          {
            paymentNumber: {
              startsWith: "PAY-15R11D-",
            },
          },
          {
            paymentNumber: {
              startsWith: "PAY-15R11E-",
            },
          },
        ],
      },
      select: {
        id: true,
        paymentNumber: true,
        status: true,
        postedAt: true,
      },
    });

  const allocations =
    await prisma.supplierPaymentAllocation.count({
      where: {
        tenantId: TENANT_ID,
        supplierBillId: BILL_ID,
      },
    });

  console.dir(
    {
      bill: {
        id: bill.id,
        status: bill.status,
        amountPaid:
          bill.amountPaid.toString(),
        balanceDue:
          bill.balanceDue.toString(),
      },
      failedPayments,
      allocations,
    },
    { depth: null },
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
    failedPayments.length === 0,
    "A failed-test Supplier Payment survived.",
  );

  assert(
    allocations === 0,
    "A failed-test allocation survived.",
  );

  console.log("");
  console.log(
    "15R.11F PREFLIGHT DATABASE STATE: PASS",
  );
  console.log(
    "DATABASE MUTATIONS: NONE",
  );
}

main()
  .catch((error) => {
    console.error("15R.11F PREFLIGHT: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });