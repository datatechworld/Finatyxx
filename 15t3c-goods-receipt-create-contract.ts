import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const WAREHOUSE_ID =
  "de9fd602-f105-4065-a428-daf58f686a85";

async function main(): Promise<void> {
  console.log(
    "=== 15T.3C GOODS RECEIPT CREATE CONTRACT DISCOVERY ===",
  );

  /*
   * READ ONLY.
   *
   * We deliberately inspect generated Prisma model source
   * outside this TypeScript program in PowerShell below.
   * This DB section only reconfirms that failed 15T.3B did
   * not create financial/inventory evidence.
   */

  const warehouse =
    await prisma.warehouse.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: WAREHOUSE_ID,
        },
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        code: true,
        status: true,
      },
    });

  const receipts =
    await prisma.goodsReceipt.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        receiptNumber: true,
        status: true,
      },
    });

  const items =
    await prisma.goodsReceiptItem.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const movements =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const balances =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  console.log("");
  console.log("Warehouse:");
  console.dir(warehouse, { depth: null });

  console.log("");
  console.log("Goods Receipts:");
  console.dir(receipts, { depth: null });

  console.log("");
  console.log("GoodsReceiptItem count:", items);
  console.log("StockMovement count:", movements);
  console.log("InventoryBalance count:", balances);

  if (!warehouse) {
    throw new Error(
      "MAIN warehouse is missing.",
    );
  }

  if (receipts.length !== 0) {
    throw new Error(
      `Unexpected Goods Receipts exist: ${receipts.length}.`,
    );
  }

  if (items !== 0) {
    throw new Error(
      `Unexpected Goods Receipt Items exist: ${items}.`,
    );
  }

  if (movements !== 0) {
    throw new Error(
      `Unexpected Stock Movements exist: ${movements}.`,
    );
  }

  if (balances !== 0) {
    throw new Error(
      `Unexpected Inventory Balances exist: ${balances}.`,
    );
  }

  console.log("");
  console.log(
    "POST-15T.3B DATABASE STATE: CLEAN",
  );

  console.log(
    "Failed 15T.3B created no Goods Receipt.",
  );

  console.log(
    "Production Goods Receipt posting remains unexecuted.",
  );

  console.log("");
  console.log(
    "DATABASE MUTATIONS: NONE",
  );
}

main()
  .catch((error) => {
    console.error(
      "15T.3C READ-ONLY DISCOVERY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });