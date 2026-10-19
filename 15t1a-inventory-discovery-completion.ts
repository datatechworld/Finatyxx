import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main(): Promise<void> {
  console.log("");
  console.log(
    "=== 15T.1A INVENTORY DATABASE COMPLETION ===",
  );

  const tenant =
    await prisma.tenant.findUnique({
      where: {
        id: TENANT_ID,
      },
      select: {
        id: true,
        legalName: true,
        status: true,
      },
    });

  console.log("");
  console.log("=== TENANT ===");
  console.dir(tenant, { depth: null });

  const branches =
    await prisma.branch.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

  console.log("");
  console.log("=== BRANCHES ===");

  console.dir(branches, {
    depth: null,
  });

  const warehouses =
    await prisma.warehouse.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

  console.log("");
  console.log("=== WAREHOUSES ===");

  console.dir(warehouses, {
    depth: null,
  });

  const suppliers =
    await prisma.supplier.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        supplierCode: true,
        name: true,
        status: true,
      },
    });

  console.log("");
  console.log("=== SUPPLIERS ===");

  console.dir(suppliers, {
    depth: null,
  });

  const products =
    await prisma.product.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        sku: true,
        name: true,
        type: true,
        defaultSalesPrice: true,
        defaultPurchasePrice: true,
        trackInventory: true,
        status: true,
      },
    });

  console.log("");
  console.log("=== INVENTORY PRODUCTS ===");

  console.dir(
    products.map((product) => ({
      ...product,
      defaultSalesPrice:
        product.defaultSalesPrice.toString(),
      defaultPurchasePrice:
        product.defaultPurchasePrice.toString(),
    })),
    { depth: null },
  );

  const warehouseConstraints =
    await prisma.$queryRawUnsafe<
      Array<{
        constraint_name: string;
        definition: string;
      }>
    >(
      `
        SELECT
          c.conname::text AS constraint_name,
          pg_get_constraintdef(c.oid)::text
            AS definition
        FROM pg_constraint c
        JOIN pg_class t
          ON t.oid = c.conrelid
        JOIN pg_namespace n
          ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'warehouses'
        ORDER BY c.conname
      `,
    );

  console.log("");
  console.log(
    "=== WAREHOUSE CONSTRAINTS ===",
  );

  console.dir(
    warehouseConstraints,
    { depth: null },
  );

  const goodsReceiptIndexes =
    await prisma.$queryRawUnsafe<
      Array<{
        index_name: string;
        definition: string;
      }>
    >(
      `
        SELECT
          indexname::text AS index_name,
          indexdef::text AS definition
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN (
            'goods_receipts',
            'goods_receipt_items',
            'stock_movements',
            'inventory_balances'
          )
        ORDER BY tablename, indexname
      `,
    );

  console.log("");
  console.log(
    "=== INVENTORY INDEXES ===",
  );

  console.dir(
    goodsReceiptIndexes,
    { depth: null },
  );

  console.log("");
  console.log(
    "15T.1A INVENTORY DISCOVERY: PASS",
  );

  console.log(
    "DATABASE MUTATIONS: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15T.1A INVENTORY DISCOVERY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });