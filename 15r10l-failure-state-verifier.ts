import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

async function main(): Promise<void> {
  console.log(
    "=== 15R.10L FAILED POSTING STATE VERIFICATION ===",
  );

  const bill =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BILL_ID,
        },
      },
      include: {
        items: true,
      },
    });

  if (!bill) {
    throw new Error(
      "15R.10L_FAILED: Supplier Bill not found.",
    );
  }

  const supplierLedger =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: BILL_ID,
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
        sourceType: "SUPPLIER_BILL",
        sourceId: BILL_ID,
      },
      select: {
        id: true,
        journalNumber: true,
        status: true,
      },
    });

  console.log("");
  console.log("SUPPLIER BILL STATE");

  console.dir(
    {
      id: bill.id,
      billNumber: bill.billNumber,
      status: bill.status,
      postedAt: bill.postedAt,
      subtotal: bill.subtotal.toString(),
      taxTotal: bill.taxTotal.toString(),
      total: bill.total.toString(),
      amountPaid: bill.amountPaid.toString(),
      balanceDue: bill.balanceDue.toString(),
      itemCount: bill.items.length,
    },
    { depth: null },
  );

  console.log("");
  console.log("FINANCIAL POSTING STATE");

  console.dir(
    {
      supplierLedger,
      journals,
    },
    { depth: null },
  );

  if (bill.status !== "DRAFT") {
    throw new Error(
      `15R.10L_FAILED: Expected DRAFT, found ${bill.status}.`,
    );
  }

  if (bill.postedAt !== null) {
    throw new Error(
      "15R.10L_FAILED: postedAt is not null.",
    );
  }

  if (supplierLedger.length !== 0) {
    throw new Error(
      "15R.10L_FAILED: Supplier Ledger mutation survived.",
    );
  }

  if (journals.length !== 0) {
    throw new Error(
      "15R.10L_FAILED: Journal mutation survived.",
    );
  }

  console.log("");
  console.log(
    "15R.10L FAILED POSTING ROLLBACK: VERIFIED",
  );

  console.log(
    "Supplier Bill remains safe for a future controlled posting.",
  );

  console.log(
    "Database mutations performed by verifier: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10L FAILURE STATE VERIFICATION: FAIL",
    );

    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });