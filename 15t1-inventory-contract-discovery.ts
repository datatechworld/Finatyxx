import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main(): Promise<void> {
  console.log("");
  console.log(
    "=== 15T.1 INVENTORY DATABASE DISCOVERY ===",
  );

  const products =
    await prisma.product.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

  console.log("");
  console.log("=== PRODUCTS ===");

  console.dir(
    products.map((product) => ({
      id: product.id,
      branchId: product.branchId,
      sku: product.sku,
      name: product.name,
      type: product.type,
      trackInventory: product.trackInventory,
      status: product.status,
      costPrice:
        product.costPrice?.toString() ?? null,
      sellingPrice:
        product.sellingPrice?.toString() ?? null,
    })),
    { depth: null },
  );

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
  console.log("=== CURRENT INVENTORY COUNTS ===");

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

  const stockMovementConstraints =
    await prisma.$queryRawUnsafe<
      Array<{
        constraint_name: string;
        definition: string;
      }>
    >(
      `
        SELECT
          c.conname::text AS constraint_name,
          pg_get_constraintdef(c.oid)::text AS definition
        FROM pg_constraint c
        JOIN pg_class t
          ON t.oid = c.conrelid
        JOIN pg_namespace n
          ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'stock_movements'
        ORDER BY c.conname
      `,
    );

  console.log("");
  console.log(
    "=== STOCK MOVEMENT CONSTRAINTS ===",
  );

  console.dir(
    stockMovementConstraints,
    { depth: null },
  );

  const inventoryBalanceConstraints =
    await prisma.$queryRawUnsafe<
      Array<{
        constraint_name: string;
        definition: string;
      }>
    >(
      `
        SELECT
          c.conname::text AS constraint_name,
          pg_get_constraintdef(c.oid)::text AS definition
        FROM pg_constraint c
        JOIN pg_class t
          ON t.oid = c.conrelid
        JOIN pg_namespace n
          ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'inventory_balances'
        ORDER BY c.conname
      `,
    );

  console.log("");
  console.log(
    "=== INVENTORY BALANCE CONSTRAINTS ===",
  );

  console.dir(
    inventoryBalanceConstraints,
    { depth: null },
  );

  const goodsReceiptConstraints =
    await prisma.$queryRawUnsafe<
      Array<{
        constraint_name: string;
        definition: string;
      }>
    >(
      `
        SELECT
          c.conname::text AS constraint_name,
          pg_get_constraintdef(c.oid)::text AS definition
        FROM pg_constraint c
        JOIN pg_class t
          ON t.oid = c.conrelid
        JOIN pg_namespace n
          ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname IN (
            'goods_receipts',
            'goods_receipt_items'
          )
        ORDER BY t.relname, c.conname
      `,
    );

  console.log("");
  console.log(
    "=== GOODS RECEIPT CONSTRAINTS ===",
  );

  console.dir(
    goodsReceiptConstraints,
    { depth: null },
  );

  console.log("");
  console.log(
    "15T.1 INVENTORY DISCOVERY: PASS",
  );

  console.log(
    "DATABASE MUTATIONS: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15T.1 INVENTORY DISCOVERY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });