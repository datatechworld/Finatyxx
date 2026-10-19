import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

async function main(): Promise<void> {
  console.log(
    "=== 15R.10O READ-ONLY STATE + INVENTORY BALANCE CONTRACT ===",
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

  if (bill.items.length !== 1) {
    throw new Error(
      `Expected 1 bill item, found ${bill.items.length}.`,
    );
  }

  const productId = bill.items[0]!.productId;

  if (!productId) {
    throw new Error("Bill item productId is null.");
  }

  const ledgerCount =
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

  const balances =
    await prisma.inventoryBalance.findMany({
      where: {
        tenantId: TENANT_ID,
        productId,
      },
      select: {
        tenantId: true,
        warehouseId: true,
        productId: true,
        quantityOnHand: true,
        quantityReserved: true,
        quantityAvailable: true,
        averageCost: true,
        updatedAt: true,
      },
      orderBy: [
        {
          warehouseId: "asc",
        },
        {
          productId: "asc",
        },
      ],
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
      productId,
      supplierLedgerCount: ledgerCount,
      journalCount,
    },
    { depth: null },
  );

  console.log("");
  console.log("INVENTORY BALANCE CONTRACT");

  console.dir(
    balances.map((balance) => ({
      tenantId: balance.tenantId,
      warehouseId: balance.warehouseId,
      productId: balance.productId,
      quantityOnHand:
        balance.quantityOnHand.toString(),
      quantityReserved:
        balance.quantityReserved.toString(),
      quantityAvailable:
        balance.quantityAvailable.toString(),
      averageCost:
        balance.averageCost.toString(),
      updatedAt:
        balance.updatedAt,
    })),
    { depth: null },
  );

  if (bill.status !== "DRAFT") {
    throw new Error(
      `Expected DRAFT, found ${bill.status}.`,
    );
  }

  if (bill.postedAt !== null) {
    throw new Error(
      "Supplier Bill postedAt is not null.",
    );
  }

  if (ledgerCount !== 0) {
    throw new Error(
      `Expected 0 Supplier Ledger entries, found ${ledgerCount}.`,
    );
  }

  if (journalCount !== 0) {
    throw new Error(
      `Expected 0 Journals, found ${journalCount}.`,
    );
  }

  console.log("");
  console.log(
    "15R.10O PRE-POSTING STATE: VERIFIED",
  );

  console.log(
    "InventoryBalance identity: tenantId + warehouseId + productId",
  );

  console.log(
    "Database mutations: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("15R.10O: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });