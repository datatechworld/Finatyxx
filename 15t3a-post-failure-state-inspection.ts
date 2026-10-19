import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const PRODUCT_ID =
  "34926c54-3bef-48b3-91ae-fe80635eefce";

const WAREHOUSE_ID =
  "de9fd602-f105-4065-a428-daf58f686a85";

async function main(): Promise<void> {
  console.log("");
  console.log(
    "=== 15T.3A POST-FAILURE STATE INSPECTION ===",
  );

  const warehouse =
    await prisma.warehouse.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: WAREHOUSE_ID,
        },
      },
    });

  console.log("");
  console.log("=== WAREHOUSE ===");
  console.dir(warehouse, { depth: null });

  const goodsReceipts =
    await prisma.goodsReceipt.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        receiptNumber: true,
        branchId: true,
        warehouseId: true,
        supplierId: true,
        receivedDate: true,
        receivedById: true,
        status: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

  console.log("");
  console.log("=== GOODS RECEIPTS ===");
  console.dir(goodsReceipts, { depth: null });

  const goodsReceiptItems =
    await prisma.goodsReceiptItem.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      orderBy: {
        id: "asc",
      },
    });

  console.log("");
  console.log("=== GOODS RECEIPT ITEMS ===");
  console.dir(goodsReceiptItems, { depth: null });

  const stockMovements =
    await prisma.stockMovement.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      orderBy: {
        occurredAt: "asc",
      },
    });

  console.log("");
  console.log("=== STOCK MOVEMENTS ===");
  console.dir(stockMovements, { depth: null });

  const inventoryBalances =
    await prisma.inventoryBalance.findMany({
      where: {
        tenantId: TENANT_ID,
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
  console.log("=== INVENTORY BALANCES ===");
  console.dir(inventoryBalances, {
    depth: null,
  });

  const warehouseCount =
    await prisma.warehouse.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const goodsReceiptCount =
    await prisma.goodsReceipt.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const goodsReceiptItemCount =
    await prisma.goodsReceiptItem.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const stockMovementCount =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const inventoryBalanceCount =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  console.log("");
  console.log("=== COUNTS ===");

  console.log(
    "Warehouse:",
    warehouseCount,
  );

  console.log(
    "GoodsReceipt:",
    goodsReceiptCount,
  );

  console.log(
    "GoodsReceiptItem:",
    goodsReceiptItemCount,
  );

  console.log(
    "StockMovement:",
    stockMovementCount,
  );

  console.log(
    "InventoryBalance:",
    inventoryBalanceCount,
  );

  if (!warehouse) {
    throw new Error(
      "Expected 15T.3 MAIN warehouse is missing.",
    );
  }

  if (
    warehouse.branchId !== BRANCH_ID ||
    warehouse.code !== "MAIN" ||
    warehouse.status !== "ACTIVE"
  ) {
    throw new Error(
      "15T.3 MAIN warehouse is not in the expected state.",
    );
  }

  if (goodsReceiptCount !== 0) {
    throw new Error(
      `Unexpected GoodsReceipt rows exist: ${goodsReceiptCount}.`,
    );
  }

  if (goodsReceiptItemCount !== 0) {
    throw new Error(
      `Unexpected GoodsReceiptItem rows exist: ${goodsReceiptItemCount}.`,
    );
  }

  if (stockMovementCount !== 0) {
    throw new Error(
      `Unexpected StockMovement rows exist: ${stockMovementCount}.`,
    );
  }

  if (inventoryBalanceCount !== 0) {
    throw new Error(
      `Unexpected InventoryBalance rows exist: ${inventoryBalanceCount}.`,
    );
  }

  const productBalance =
    await prisma.inventoryBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: TENANT_ID,
          warehouseId: WAREHOUSE_ID,
          productId: PRODUCT_ID,
        },
      },
    });

  if (productBalance !== null) {
    throw new Error(
      "Unexpected InventoryBalance exists for the test product.",
    );
  }

  console.log("");
  console.log(
    "15T.3A POST-FAILURE STATE INSPECTION: PASS",
  );

  console.log("");
  console.log(
    "CONFIRMED MUTATION FROM FAILED 15T.3:",
  );
  console.log(
    "MAIN Warehouse only:",
    warehouse.id,
  );

  console.log("");
  console.log(
    "Goods Receipt created: NO",
  );
  console.log(
    "Goods Receipt Item created: NO",
  );
  console.log(
    "Stock Movement created: NO",
  );
  console.log(
    "Inventory Balance created: NO",
  );
  console.log(
    "Production posting service reached: NO",
  );

  console.log("");
  console.log(
    "DATABASE MUTATIONS BY 15T.3A: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15T.3A STATE INSPECTION: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });