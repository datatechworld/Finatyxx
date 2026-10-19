import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

async function main(): Promise<void> {
  console.log(
    "=== 15R.10Q ROLLBACK VERIFICATION ===",
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
    throw new Error("Supplier Bill not found.");
  }

  const supplierLedgerEntries =
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

  const item = bill.items[0];

  if (!item) {
    throw new Error("Supplier Bill item missing.");
  }

  if (!item.productId) {
    throw new Error("Supplier Bill productId missing.");
  }

  const stockMovementCount =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId,
      },
    });

  const inventoryBalanceCount =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
        productId: item.productId,
      },
    });

  console.log("");
  console.log("POST-15R.10P DATABASE STATE");

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
        supplierLedgerEntries.map((entry) => ({
          id: entry.id,
          entryType: entry.entryType,
          debit: entry.debit.toString(),
          credit: entry.credit.toString(),
        })),

      journals,

      stockMovementCount,
      inventoryBalanceCount,
    },
    { depth: null },
  );

  if (bill.status !== "DRAFT") {
    throw new Error(
      `ROLLBACK NOT CLEAN: bill status is ${bill.status}`,
    );
  }

  if (bill.postedAt !== null) {
    throw new Error(
      "ROLLBACK NOT CLEAN: postedAt is populated",
    );
  }

  if (supplierLedgerEntries.length !== 0) {
    throw new Error(
      `ROLLBACK NOT CLEAN: ${supplierLedgerEntries.length} Supplier Ledger entries exist`,
    );
  }

  if (journals.length !== 0) {
    throw new Error(
      `ROLLBACK NOT CLEAN: ${journals.length} Journal entries exist`,
    );
  }

  if (stockMovementCount !== 0) {
    throw new Error(
      `Unexpected StockMovement count: ${stockMovementCount}`,
    );
  }

  if (inventoryBalanceCount !== 0) {
    throw new Error(
      `Unexpected InventoryBalance count: ${inventoryBalanceCount}`,
    );
  }

  console.log("");
  console.log(
    "15R.10P TRANSACTION ROLLBACK: VERIFIED CLEAN",
  );

  console.log(
    "Supplier Bill remains DRAFT: VERIFIED",
  );

  console.log(
    "Supplier Ledger residue: NONE",
  );

  console.log(
    "Journal residue: NONE",
  );

  console.log(
    "Physical inventory mutation: NONE",
  );

  console.log(
    "Database mutations by 15R.10Q: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("15R.10Q: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });