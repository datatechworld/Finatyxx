import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  GoodsReceiptPostingError,
  postGoodsReceipt,
} from "./src/modules/inventory/goods-receipt-posting.service.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const SUPPLIER_ID =
  "45eed8b9-868f-4bc4-9a56-67e9455348d7";

const PRODUCT_ID =
  "34926c54-3bef-48b3-91ae-fe80635eefce";

const POSTED_BY_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const QUANTITY =
  new Prisma.Decimal("10");

const UNIT_COST =
  new Prisma.Decimal("1000");

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `15T.3 ASSERTION FAILED: ${message}`,
    );
  }
}

function decimalEquals(
  value: Prisma.Decimal,
  expected: string,
): boolean {
  return value.equals(
    new Prisma.Decimal(expected),
  );
}

async function main(): Promise<void> {
  console.log(
    "=== 15T.3 GOODS RECEIPT BEHAVIORAL VERIFICATION ===",
  );

  /*
   * ---------------------------------------------------------
   * PRE-MUTATION SAFETY GATE
   * ---------------------------------------------------------
   */

  const serviceHashExpected =
    "94A337E70A11C9F1E36EC4A11AA7BDDD14463AC591774AF9E4EC3433A58FE93C";

  console.log("");
  console.log(
    "Expected Goods Receipt service SHA:",
    serviceHashExpected,
  );

  const tenant =
    await prisma.tenant.findUnique({
      where: {
        id: TENANT_ID,
      },
      select: {
        status: true,
      },
    });

  assert(
    tenant !== null,
    "Test tenant does not exist.",
  );

  assert(
    tenant.status === "TRIAL" ||
      tenant.status === "ACTIVE",
    "Test tenant is not TRIAL/ACTIVE.",
  );

  const branch =
    await prisma.branch.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BRANCH_ID,
        },
      },
      select: {
        status: true,
      },
    });

  assert(
    branch !== null,
    "Head Office branch does not exist.",
  );

  assert(
    branch.status === "ACTIVE",
    "Head Office branch is not ACTIVE.",
  );

  const supplier =
    await prisma.supplier.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: SUPPLIER_ID,
        },
      },
      select: {
        status: true,
      },
    });

  assert(
    supplier !== null,
    "Permanent AP supplier does not exist.",
  );

  assert(
    supplier.status === "ACTIVE",
    "Permanent AP supplier is not ACTIVE.",
  );

  const product =
    await prisma.product.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: PRODUCT_ID,
        },
      },
      select: {
        type: true,
        trackInventory: true,
        status: true,
      },
    });

  assert(
    product !== null,
    "Permanent inventory product does not exist.",
  );

  assert(
    product.status === "ACTIVE",
    "Permanent inventory product is not ACTIVE.",
  );

  assert(
    product.type === "INVENTORY",
    "Permanent product is not INVENTORY.",
  );

  assert(
    product.trackInventory,
    "Permanent product does not track inventory.",
  );

  const existingGoodsReceipts =
    await prisma.goodsReceipt.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const existingStockMovements =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  const existingInventoryBalances =
    await prisma.inventoryBalance.count({
      where: {
        tenantId: TENANT_ID,
      },
    });

  assert(
    existingGoodsReceipts === 0,
    `Expected zero Goods Receipts before 15T.3; found ${existingGoodsReceipts}.`,
  );

  assert(
    existingStockMovements === 0,
    `Expected zero Stock Movements before 15T.3; found ${existingStockMovements}.`,
  );

  assert(
    existingInventoryBalances === 0,
    `Expected zero Inventory Balances before 15T.3; found ${existingInventoryBalances}.`,
  );

  console.log("");
  console.log("PRE-MUTATION SAFETY GATE: PASS");
  console.log(
    "GoodsReceipt count:",
    existingGoodsReceipts,
  );
  console.log(
    "StockMovement count:",
    existingStockMovements,
  );
  console.log(
    "InventoryBalance count:",
    existingInventoryBalances,
  );

  /*
   * ---------------------------------------------------------
   * DATABASE MUTATION BEGINS HERE
   * ---------------------------------------------------------
   */

  console.log("");
  console.log(
    "=== DATABASE MUTATION BEGINS HERE ===",
  );

  const existingMainWarehouse =
    await prisma.warehouse.findUnique({
      where: {
        tenantId_code: {
          tenantId: TENANT_ID,
          code: "MAIN",
        },
      },
    });

  const warehouse =
    existingMainWarehouse ??
    (await prisma.warehouse.create({
      data: {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        name: "Main Warehouse",
        code: "MAIN",
        status: "ACTIVE",
      },
    }));

  assert(
    warehouse.branchId === BRANCH_ID,
    "MAIN warehouse is not attached to Head Office.",
  );

  assert(
    warehouse.status === "ACTIVE",
    "MAIN warehouse is not ACTIVE.",
  );

  console.log(
    "Warehouse ID:",
    warehouse.id,
  );

  const uniqueSuffix =
    `${Date.now()}-${Math.floor(
      Math.random() * 1_000_000,
    )}`;

  const receiptNumber =
    `GRN-15T3-${uniqueSuffix}`;

  const receipt =
    await prisma.goodsReceipt.create({
      data: {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        warehouseId: warehouse.id,
        supplierId: SUPPLIER_ID,
        receiptNumber,
        receivedDate:
          new Date("2098-06-25T00:00:00.000Z"),
        status: "DRAFT",
        createdById: POSTED_BY_ID,
        items: {
          create: {
            tenantId: TENANT_ID,
            productId: PRODUCT_ID,
            quantityReceived: QUANTITY,
            unitCost: UNIT_COST,
          },
        },
      },
      include: {
        items: true,
      },
    });

  console.log(
    "Goods Receipt ID:",
    receipt.id,
  );

  console.log(
    "Goods Receipt Number:",
    receipt.receiptNumber,
  );

  assert(
    receipt.status === "DRAFT",
    "Fixture Goods Receipt was not created DRAFT.",
  );

  assert(
    receipt.items.length === 1,
    "Fixture must contain exactly one item.",
  );

  console.log("");
  console.log(
    "=== CALLING PRODUCTION GOODS RECEIPT SERVICE ===",
  );

  const result =
    await postGoodsReceipt({
      tenantId: TENANT_ID,
      goodsReceiptId: receipt.id,
      postedById: POSTED_BY_ID,
    });

  assert(
    result.goodsReceipt.status === "POSTED",
    "Production service did not return POSTED Goods Receipt.",
  );

  assert(
    result.stockMovementIds.length === 1,
    "Expected exactly one Stock Movement ID.",
  );

  /*
   * ---------------------------------------------------------
   * READ-ONLY POSTING VERIFICATION
   * ---------------------------------------------------------
   */

  const finalReceipt =
    await prisma.goodsReceipt.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: receipt.id,
        },
      },
      include: {
        items: true,
      },
    });

  assert(
    finalReceipt !== null,
    "Posted Goods Receipt not found.",
  );

  assert(
    finalReceipt.status === "POSTED",
    "Goods Receipt status is not POSTED.",
  );

  const movements =
    await prisma.stockMovement.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "GOODS_RECEIPT",
        referenceId: receipt.id,
      },
      orderBy: {
        occurredAt: "asc",
      },
    });

  assert(
    movements.length === 1,
    `Expected one Stock Movement; found ${movements.length}.`,
  );

  const movement = movements[0];

  assert(
    movement !== undefined,
    "Stock Movement unexpectedly missing.",
  );

  assert(
    movement.branchId === BRANCH_ID,
    "Stock Movement branch mismatch.",
  );

  assert(
    movement.warehouseId === warehouse.id,
    "Stock Movement warehouse mismatch.",
  );

  assert(
    movement.productId === PRODUCT_ID,
    "Stock Movement product mismatch.",
  );

  assert(
    movement.movementType ===
      "PURCHASE_RECEIPT",
    "Stock Movement type mismatch.",
  );

  assert(
    movement.direction === "IN",
    "Stock Movement direction mismatch.",
  );

  assert(
    decimalEquals(
      movement.quantity,
      "10",
    ),
    "Stock Movement quantity must be 10.",
  );

  assert(
    decimalEquals(
      movement.unitCost,
      "1000",
    ),
    "Stock Movement unit cost must be 1000.",
  );

  assert(
    decimalEquals(
      movement.totalCost,
      "10000",
    ),
    "Stock Movement total cost must be 10000.",
  );

  const balance =
    await prisma.inventoryBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: TENANT_ID,
          warehouseId: warehouse.id,
          productId: PRODUCT_ID,
        },
      },
    });

  assert(
    balance !== null,
    "Inventory Balance was not created.",
  );

  assert(
    decimalEquals(
      balance.quantityOnHand,
      "10",
    ),
    "quantityOnHand must equal 10.",
  );

  assert(
    decimalEquals(
      balance.quantityReserved,
      "0",
    ),
    "quantityReserved must remain zero.",
  );

  assert(
    decimalEquals(
      balance.quantityAvailable,
      "10",
    ),
    "quantityAvailable must equal 10.",
  );

  assert(
    decimalEquals(
      balance.averageCost,
      "1000",
    ),
    "averageCost must equal 1000.",
  );

  console.log("");
  console.log(
    "=== DUPLICATE POSTING REJECTION ===",
  );

  let duplicateRejected = false;

  try {
    await postGoodsReceipt({
      tenantId: TENANT_ID,
      goodsReceiptId: receipt.id,
      postedById: POSTED_BY_ID,
    });
  } catch (error) {
    if (
      error instanceof
      GoodsReceiptPostingError
    ) {
      duplicateRejected = true;

      console.log(
        "Duplicate rejected:",
        error.message,
      );
    } else {
      throw error;
    }
  }

  assert(
    duplicateRejected,
    "Second posting attempt was not rejected.",
  );

  const finalMovementCount =
    await prisma.stockMovement.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "GOODS_RECEIPT",
        referenceId: receipt.id,
      },
    });

  assert(
    finalMovementCount === 1,
    "Duplicate attempt changed Stock Movement count.",
  );

  const finalBalance =
    await prisma.inventoryBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: TENANT_ID,
          warehouseId: warehouse.id,
          productId: PRODUCT_ID,
        },
      },
    });

  assert(
    finalBalance !== null,
    "Final Inventory Balance missing.",
  );

  assert(
    decimalEquals(
      finalBalance.quantityOnHand,
      "10",
    ),
    "Duplicate attempt changed quantityOnHand.",
  );

  assert(
    decimalEquals(
      finalBalance.quantityAvailable,
      "10",
    ),
    "Duplicate attempt changed quantityAvailable.",
  );

  assert(
    decimalEquals(
      finalBalance.averageCost,
      "1000",
    ),
    "Duplicate attempt changed averageCost.",
  );

  console.log("");
  console.log(
    "============================================================",
  );
  console.log(
    "15T.3 GOODS RECEIPT BEHAVIORAL VERIFICATION: PASS",
  );
  console.log(
    "============================================================",
  );

  console.log("");
  console.log(
    "Warehouse ID:",
    warehouse.id,
  );
  console.log(
    "Goods Receipt ID:",
    receipt.id,
  );
  console.log(
    "Goods Receipt Number:",
    receipt.receiptNumber,
  );
  console.log(
    "Goods Receipt Status:",
    finalReceipt.status,
  );
  console.log(
    "Stock Movement ID:",
    movement.id,
  );
  console.log(
    "Movement:",
    `${movement.direction} ${movement.quantity.toString()} @ ${movement.unitCost.toString()}`,
  );
  console.log(
    "Movement Total Cost:",
    movement.totalCost.toString(),
  );
  console.log(
    "Inventory Quantity On Hand:",
    finalBalance.quantityOnHand.toString(),
  );
  console.log(
    "Inventory Quantity Reserved:",
    finalBalance.quantityReserved.toString(),
  );
  console.log(
    "Inventory Quantity Available:",
    finalBalance.quantityAvailable.toString(),
  );
  console.log(
    "Inventory Average Cost:",
    finalBalance.averageCost.toString(),
  );
  console.log(
    "Duplicate posting rejected:",
    duplicateRejected,
  );

  console.log("");
  console.log(
    "PERMANENT TEST EVIDENCE: PRESERVE",
  );
  console.log(
    "DO NOT DELETE OR REPOST THIS GOODS RECEIPT.",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15T.3 GOODS RECEIPT BEHAVIORAL VERIFICATION: FAIL",
    );
    console.error(error);

    console.error("");
    console.error(
      "IMPORTANT: DO NOT RERUN 15T.3.",
    );
    console.error(
      "SEND THE COMPLETE OUTPUT FOR READ-ONLY STATE INSPECTION.",
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });