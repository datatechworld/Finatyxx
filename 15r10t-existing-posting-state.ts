import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

async function main(): Promise<void> {
  const bill = await prisma.supplierBill.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: BILL_ID,
      },
    },
  });

  if (!bill) {
    throw new Error("Supplier Bill not found.");
  }

  const ledgers =
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
        postedAt: true,
        _count: {
          select: {
            lines: true,
          },
        },
      },
    });

  console.log("");
  console.log("CURRENT DATABASE STATE");

  console.dir(
    {
      supplierBill: {
        id: bill.id,
        billNumber: bill.billNumber,
        status: bill.status,
        postedAt: bill.postedAt,
        subtotal: bill.subtotal.toString(),
        taxTotal: bill.taxTotal.toString(),
        total: bill.total.toString(),
        amountPaid: bill.amountPaid.toString(),
        balanceDue: bill.balanceDue.toString(),
      },

      supplierLedgerEntries:
        ledgers.map((entry) => ({
          id: entry.id,
          entryType: entry.entryType,
          debit: entry.debit.toString(),
          credit: entry.credit.toString(),
        })),

      journals,
    },
    { depth: null },
  );

  console.log("");

  if (
    bill.status === "DRAFT" &&
    bill.postedAt === null &&
    ledgers.length === 0 &&
    journals.length === 0
  ) {
    console.log(
      "STATE CLASSIFICATION: PRISTINE_DRAFT",
    );

    console.log(
      "The existing 15R.10S has NOT left posting evidence.",
    );
  } else if (
    bill.status === "POSTED" &&
    bill.postedAt !== null &&
    ledgers.length === 1 &&
    journals.length === 1
  ) {
    console.log(
      "STATE CLASSIFICATION: POSTING_EVIDENCE_EXISTS",
    );

    console.log(
      "DO NOT execute another Supplier Bill posting.",
    );
  } else {
    console.log(
      "STATE CLASSIFICATION: REQUIRES_DIAGNOSTIC",
    );

    console.log(
      "DO NOT execute another Supplier Bill posting.",
    );
  }

  console.log("");
  console.log("15R.10T DATABASE MUTATIONS: NONE");
}

main()
  .catch((error) => {
    console.error("15R.10T: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });