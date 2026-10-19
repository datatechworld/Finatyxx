import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

async function main(): Promise<void> {
  console.log(
    "=== 15R.10J SUPPLIER BILL PRE-POSTING SAFETY GATE ===",
  );

  const bill = await prisma.supplierBill.findUnique({
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
      "SAFETY_GATE_FAILED: Supplier Bill not found.",
    );
  }

  const supplierLedgerCount =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
        referenceId: BILL_ID,
      },
    });

  const journalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_BILL",
        sourceId: BILL_ID,
      },
    });

  console.log("");
  console.log("SUPPLIER BILL");
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
      supplierLedgerCount,
      journalCount,
    },
    { depth: null },
  );

  if (bill.status !== "DRAFT") {
    throw new Error(
      `SAFETY_GATE_FAILED: Bill status is ${bill.status}, expected DRAFT.`,
    );
  }

  if (bill.postedAt !== null) {
    throw new Error(
      "SAFETY_GATE_FAILED: Bill already has postedAt.",
    );
  }

  if (bill.items.length !== 1) {
    throw new Error(
      `SAFETY_GATE_FAILED: Expected 1 bill item, found ${bill.items.length}.`,
    );
  }

  if (bill.subtotal.toString() !== "1000") {
    throw new Error(
      "SAFETY_GATE_FAILED: Expected subtotal 1000.",
    );
  }

  if (bill.taxTotal.toString() !== "150") {
    throw new Error(
      "SAFETY_GATE_FAILED: Expected taxTotal 150.",
    );
  }

  if (bill.total.toString() !== "1150") {
    throw new Error(
      "SAFETY_GATE_FAILED: Expected total 1150.",
    );
  }

  if (bill.amountPaid.toString() !== "0") {
    throw new Error(
      "SAFETY_GATE_FAILED: Expected amountPaid 0.",
    );
  }

  if (bill.balanceDue.toString() !== "1150") {
    throw new Error(
      "SAFETY_GATE_FAILED: Expected balanceDue 1150.",
    );
  }

  if (supplierLedgerCount !== 0) {
    throw new Error(
      "SAFETY_GATE_FAILED: Supplier Ledger already contains posting evidence.",
    );
  }

  if (journalCount !== 0) {
    throw new Error(
      "SAFETY_GATE_FAILED: Journal already contains posting evidence.",
    );
  }

  console.log("");
  console.log(
    "15R.10J PRE-POSTING SAFETY GATE: PASS",
  );
  console.log(
    "Supplier Bill remains safe for controlled behavioral posting.",
  );
  console.log(
    "Database mutations performed by gate: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10J PRE-POSTING SAFETY GATE: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });