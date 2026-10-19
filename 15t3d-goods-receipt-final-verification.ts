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

const WAREHOUSE_ID =
  "de9fd602-f105-4065-a428-daf58f686a85";

const SUPPLIER_ID =
  "45eed8b9-868f-4bc4-9a56-67e9455348d7";

const PRODUCT_ID =
  "34926c54-3bef-48b3-91ae-fe80635eefce";

const USER_ID =
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
      `15T.3D ASSERTION FAILED: ${message}`,
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
    "=== 15T.3D GOODS RECEIPT FINAL VERIFICATION ===",
  );

  /*
   * PRE-MUTATION SAFETY GATE
   */

  const tenant =
    await prisma.tenant.findUnique({
      where: { id: TENANT_ID },
      select: { status: true },
    });

  assert(
    tenant !== null &&
      (tenant.status === "TRIAL" ||
        tenant.status === "ACTIVE"),
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
      select: { status: true },
    });

  assert(
    branch !== null &&
      branch.status === "ACTIVE",
    "Branch is not ACTIVE.",
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

  assert(
    warehouse !== null,
    "MAIN warehouse missing.",
  );

  assert(
    warehouse.code === "MAIN",
    "Warehouse is not MAIN.",
  );

  assert(
    warehouse.branchId === BRANCH_ID,
    "Warehouse branch mismatch.",
  );

  assert(
    warehouse.status === "ACTIVE",
    "MAIN warehouse is not ACTIVE.",
  );

  const supplier =
    await prisma.supplier.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: SUPPLIER_ID,
        },
      },
      select: { status: true },
    });

  assert(
    supplier !== null &&
      supplier.status === "ACTIVE",
    "Supplier is not ACTIVE.",
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
    "Inventory product missing.",
  );

  assert(
    product.status === "ACTIVE",
    "Product is not ACTIVE.",
  );

  assert(
    product.type === "INVENTORY",
    "Product is not INVENTORY.",
  );

  assert(
    product.trackInventory,
    "Product does not track inventory.",
  );

  const user =
    await prisma.user.findUnique({
      where: { id: USER_ID },
      select: { id: true },
    });

  assert(
    user !== null,
    "Receiving user missing.",
  );

  const preReceiptCount =
    await prisma.goodsReceipt.count({
      where: { tenantId: TENANT_ID },
    });

  const preItemCount =
    await prisma.goodsReceiptItem.count({
      where: { tenantId: TENANT_ID },
    });

  const preMovementCount =
    await prisma.stockMovement.count({
      where: { tenantId: TENANT_ID },
    });

  const preBalanceCount =
    await prisma.inventoryBalance.count({
      where: { tenantId: TENANT_ID },
    });

  assert(
    preReceiptCount === 0,
    `Expected 0 receipts; found ${preReceiptCount}.`,
  );

  assert(
    preItemCount === 0,
    `Expected 0 receipt items; found ${preItemCount}.`,
  );

  assert(
    preMovementCount === 0,
    `Expected 0 movements; found ${preMovementCount}.`,
  );

  assert(
    preBalanceCount === 0,
    `Expected 0 balances; found ${preBalanceCount}.`,
  );

  console.log("");
  console.log("PRE-MUTATION SAFETY GATE: PASS");
  console.log("GoodsReceipt:", preReceiptCount);
  console.log("GoodsReceiptItem:", preItemCount);
  console.log("StockMovement:", preMovementCount);
  console.log("InventoryBalance:", preBalanceCount);

  /*
   * MUTATION
   *
   * IMPORTANT:
   * Receipt and item are deliberately created separately.
   * This uses Prisma scalar/unchecked create contracts and
   * avoids the relation-aware nested-create ambiguity that
   * caused preserved failed verifier 15T.3B.
   */

  console.log("");
  console.log(
    "=== DATABASE MUTATION BEGINS HERE ===",
  );

  const receiptNumber =
    `GRN-15T3D-${Date.now()}`;

  const receipt =
    await prisma.goodsReceipt.create({
      data: {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        warehouseId: WAREHOUSE_ID,
        supplierId: SUPPLIER_ID,
        receiptNumber,
        receivedDate:
          new Date("2098-06-25T00:00:00.000Z"),
        receivedById: USER_ID,
        status: "DRAFT",
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
    "Created receipt is not DRAFT.",
  );

  assert(
    receipt.tenantId === TENANT_ID,
    "Receipt tenant mismatch.",
  );

  assert(
    receipt.receivedById === USER_ID,
    "Receipt receivedById mismatch.",
  );

  const receiptItem =
    await prisma.goodsReceiptItem.create({
      data: {
        tenantId: TENANT_ID,
        goodsReceiptId: receipt.id,
        productId: PRODUCT_ID,
        quantityReceived: QUANTITY,
        unitCost: UNIT_COST,
      },
    });

  console.log(
    "Goods Receipt Item ID:",
    receiptItem.id,
  );

  assert(
    receiptItem.goodsReceiptId === receipt.id,
    "Receipt item parent mismatch.",
  );

  assert(
    decimalEquals(
      receiptItem.quantityReceived,
      "10",
    ),
    "Receipt item quantity must be 10.",
  );

  assert(
    decimalEquals(
      receiptItem.unitCost,
      "1000",
    ),
    "Receipt item unit cost must be 1000.",
  );

  console.log("");
  console.log(
    "=== EXECUTING PRODUCTION SERVICE EXACTLY ONCE ===",
  );

  const result =
    await postGoodsReceipt({
      tenantId: TENANT_ID,
      goodsReceiptId: receipt.id,
      postedById: USER_ID,
    });

  console.log(
    "Production service returned.",
  );

  assert(
    result.goodsReceipt.status === "POSTED",
    "Service did not return POSTED.",
  );

  assert(
    result.stockMovementIds.length === 1,
    "Expected exactly one Stock Movement ID.",
  );

  /*
   * POSTING VERIFICATION
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
    "Posted Goods Receipt missing.",
  );

  assert(
    finalReceipt.status === "POSTED",
    "Goods Receipt is not POSTED.",
  );

  assert(
    finalReceipt.receivedById === USER_ID,
    "Final receivedById mismatch.",
  );

  assert(
    finalReceipt.items.length === 1,
    "Expected exactly one Receipt Item.",
  );

  const movements =
    await prisma.stockMovement.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "GOODS_RECEIPT",
        referenceId: receipt.id,
      },
    });

  assert(
    movements.length === 1,
    `Expected 1 Stock Movement; found ${movements.length}.`,
  );

  const movement = movements[0];

  assert(
    movement !== undefined,
    "Stock Movement missing.",
  );

  assert(
    movement.branchId === BRANCH_ID,
    "Movement branch mismatch.",
  );

  assert(
    movement.warehouseId === WAREHOUSE_ID,
    "Movement warehouse mismatch.",
  );

  assert(
    movement.productId === PRODUCT_ID,
    "Movement product mismatch.",
  );

  assert(
    movement.movementType ===
      "PURCHASE_RECEIPT",
    "Movement type must be PURCHASE_RECEIPT.",
  );

  assert(
    movement.direction === "IN",
    "Movement direction must be IN.",
  );

  assert(
    decimalEquals(
      movement.quantity,
      "10",
    ),
    "Movement quantity must be 10.",
  );

  assert(
    decimalEquals(
      movement.unitCost,
      "1000",
    ),
    "Movement unit cost must be 1000.",
  );

  assert(
    decimalEquals(
      movement.totalCost,
      "10000",
    ),
    "Movement total cost must be 10000.",
  );

  assert(
    movement.createdById === USER_ID,
    "Movement createdById mismatch.",
  );

  const balance =
    await prisma.inventoryBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: TENANT_ID,
          warehouseId: WAREHOUSE_ID,
          productId: PRODUCT_ID,
        },
      },
    });

  assert(
    balance !== null,
    "Inventory Balance missing.",
  );

  assert(
    decimalEquals(
      balance.quantityOnHand,
      "10",
    ),
    "quantityOnHand must be 10.",
  );

  assert(
    decimalEquals(
      balance.quantityReserved,
      "0",
    ),
    "quantityReserved must remain 0.",
  );

  assert(
    decimalEquals(
      balance.quantityAvailable,
      "10",
    ),
    "quantityAvailable must be 10.",
  );

  assert(
    decimalEquals(
      balance.averageCost,
      "1000",
    ),
    "averageCost must be 1000.",
  );

  console.log("");
  console.log(
    "PRIMARY INVENTORY POSTING VERIFICATION: PASS",
  );

  /*
   * DUPLICATE PROTECTION
   */

  console.log("");
  console.log(
    "=== DUPLICATE POSTING REJECTION ===",
  );

  let duplicateRejected = false;

  try {
    await postGoodsReceipt({
      tenantId: TENANT_ID,
      goodsReceiptId: receipt.id,
      postedById: USER_ID,
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
    "Duplicate posting was not rejected.",
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
    "Duplicate attempt changed movement count.",
  );

  const finalBalance =
    await prisma.inventoryBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: TENANT_ID,
          warehouseId: WAREHOUSE_ID,
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
    "Duplicate changed quantityOnHand.",
  );

  assert(
    decimalEquals(
      finalBalance.quantityAvailable,
      "10",
    ),
    "Duplicate changed quantityAvailable.",
  );

  assert(
    decimalEquals(
      finalBalance.averageCost,
      "1000",
    ),
    "Duplicate changed averageCost.",
  );

  const finalReceiptCount =
    await prisma.goodsReceipt.count({
      where: { tenantId: TENANT_ID },
    });

  const finalItemCount =
    await prisma.goodsReceiptItem.count({
      where: { tenantId: TENANT_ID },
    });

  assert(
    finalReceiptCount === 1,
    `Expected 1 receipt; found ${finalReceiptCount}.`,
  );

  assert(
    finalItemCount === 1,
    `Expected 1 receipt item; found ${finalItemCount}.`,
  );

  console.log("");
  console.log(
    "DUPLICATE PROTECTION: PASS",
  );

  console.log("");
  console.log(
    "============================================================",
  );

  console.log(
    "15T.3D GOODS RECEIPT FINAL VERIFICATION: PASS",
  );

  console.log(
    "============================================================",
  );

  console.log("");
  console.log("Warehouse ID:", WAREHOUSE_ID);
  console.log(
    "Goods Receipt ID:",
    finalReceipt.id,
  );
  console.log(
    "Goods Receipt Number:",
    finalReceipt.receiptNumber,
  );
  console.log(
    "Goods Receipt Status:",
    finalReceipt.status,
  );
  console.log(
    "Received By:",
    finalReceipt.receivedById,
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
    "Quantity On Hand:",
    finalBalance.quantityOnHand.toString(),
  );
  console.log(
    "Quantity Reserved:",
    finalBalance.quantityReserved.toString(),
  );
  console.log(
    "Quantity Available:",
    finalBalance.quantityAvailable.toString(),
  );
  console.log(
    "Average Cost:",
    finalBalance.averageCost.toString(),
  );
  console.log(
    "Duplicate posting rejected:",
    duplicateRejected,
  );

  console.log("");
  console.log(
    "PERMANENT INVENTORY EVIDENCE: PRESERVE",
  );

  console.log(
    "DO NOT DELETE OR REPOST THIS GOODS RECEIPT.",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15T.3D GOODS RECEIPT FINAL VERIFICATION: FAIL",
    );
    console.error(error);

    console.error("");
    console.error(
      "IMPORTANT: DO NOT RERUN 15T.3D.",
    );
    console.error(
      "SEND COMPLETE OUTPUT FOR READ-ONLY STATE INSPECTION.",
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });