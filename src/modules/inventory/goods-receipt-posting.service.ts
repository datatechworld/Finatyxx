import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";

const REFERENCE_TYPE = "GOODS_RECEIPT";
const MAX_SERIALIZABLE_ATTEMPTS = 3;

export interface PostGoodsReceiptInput {
  tenantId: string;
  goodsReceiptId: string;
  postedById: string;
}

export class GoodsReceiptPostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoodsReceiptPostingError";
  }
}

function isRetryableTransactionError(
  error: unknown,
): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
  ) {
    return (
      error.code === "P2034" ||
      error.code === "P2028"
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const code = String(
      (error as { code?: unknown }).code ?? "",
    );

    return code === "40001" || code === "40P01";
  }

  return false;
}

async function postGoodsReceiptInTransaction(
  tx: Prisma.TransactionClient,
  input: PostGoodsReceiptInput,
) {
  const lockedReceiptRows =
    await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `
        SELECT id::text
        FROM goods_receipts
        WHERE "tenantId" = $1::uuid
          AND id = $2::uuid
        FOR UPDATE
      `,
      input.tenantId,
      input.goodsReceiptId,
    );

  if (lockedReceiptRows.length !== 1) {
    throw new GoodsReceiptPostingError(
      "Goods Receipt not found.",
    );
  }

  const receipt =
    await tx.goodsReceipt.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: input.goodsReceiptId,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

  if (!receipt) {
    throw new GoodsReceiptPostingError(
      "Goods Receipt not found after row lock.",
    );
  }

  if (
    receipt.status !== "DRAFT" &&
    receipt.status !== "APPROVED"
  ) {
    throw new GoodsReceiptPostingError(
      `Goods Receipt must be DRAFT or APPROVED before posting; found ${receipt.status}.`,
    );
  }

  const tenant =
    await tx.tenant.findUnique({
      where: {
        id: input.tenantId,
      },
      select: {
        status: true,
      },
    });

  if (!tenant) {
    throw new GoodsReceiptPostingError(
      "Tenant not found.",
    );
  }

  if (
    tenant.status !== "TRIAL" &&
    tenant.status !== "ACTIVE"
  ) {
    throw new GoodsReceiptPostingError(
      `Tenant is not eligible for inventory posting; found ${tenant.status}.`,
    );
  }

  const branch =
    await tx.branch.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: receipt.branchId,
        },
      },
      select: {
        status: true,
      },
    });

  if (!branch) {
    throw new GoodsReceiptPostingError(
      "Goods Receipt branch not found.",
    );
  }

  if (branch.status !== "ACTIVE") {
    throw new GoodsReceiptPostingError(
      "Goods Receipt branch is not ACTIVE.",
    );
  }

  const warehouse =
    await tx.warehouse.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: receipt.warehouseId,
        },
      },
      select: {
        id: true,
        branchId: true,
        status: true,
      },
    });

  if (!warehouse) {
    throw new GoodsReceiptPostingError(
      "Goods Receipt warehouse not found.",
    );
  }

  if (warehouse.status !== "ACTIVE") {
    throw new GoodsReceiptPostingError(
      "Goods Receipt warehouse is not ACTIVE.",
    );
  }

  if (warehouse.branchId !== receipt.branchId) {
    throw new GoodsReceiptPostingError(
      "Goods Receipt warehouse does not belong to the receipt branch.",
    );
  }

  const supplier =
    await tx.supplier.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: receipt.supplierId,
        },
      },
      select: {
        status: true,
      },
    });

  if (!supplier) {
    throw new GoodsReceiptPostingError(
      "Goods Receipt supplier not found.",
    );
  }

  if (supplier.status !== "ACTIVE") {
    throw new GoodsReceiptPostingError(
      "Goods Receipt supplier is not ACTIVE.",
    );
  }

  if (receipt.items.length === 0) {
    throw new GoodsReceiptPostingError(
      "Goods Receipt must contain at least one item.",
    );
  }

  const productIds =
    receipt.items
      .map((item) => item.productId)
      .sort();

  const uniqueProductIds =
    new Set(productIds);

  if (
    uniqueProductIds.size !== productIds.length
  ) {
    throw new GoodsReceiptPostingError(
      "MVP Goods Receipt requires at most one line per product.",
    );
  }

  for (const item of receipt.items) {
    if (item.quantityReceived.lessThanOrEqualTo(0)) {
      throw new GoodsReceiptPostingError(
        "Goods Receipt quantityReceived must be greater than zero.",
      );
    }

    if (item.unitCost.lessThan(0)) {
      throw new GoodsReceiptPostingError(
        "Goods Receipt unitCost cannot be negative.",
      );
    }

    if (item.product.status !== "ACTIVE") {
      throw new GoodsReceiptPostingError(
        `Product ${item.productId} is not ACTIVE.`,
      );
    }

    if (item.product.type !== "INVENTORY") {
      throw new GoodsReceiptPostingError(
        `Product ${item.productId} is not an INVENTORY product.`,
      );
    }

    if (!item.product.trackInventory) {
      throw new GoodsReceiptPostingError(
        `Product ${item.productId} does not track inventory.`,
      );
    }
  }

  const existingMovementCount =
    await tx.stockMovement.count({
      where: {
        tenantId: input.tenantId,
        referenceType: REFERENCE_TYPE,
        referenceId: receipt.id,
      },
    });

  if (existingMovementCount !== 0) {
    throw new GoodsReceiptPostingError(
      "Goods Receipt already has stock movement evidence.",
    );
  }

  /*
   * Lock existing InventoryBalance rows in deterministic
   * product order. Missing rows are created later inside
   * this same Serializable transaction.
   */
  for (const productId of productIds) {
    await tx.$queryRawUnsafe<Array<{ productId: string }>>(
      `
        SELECT "productId"::text AS "productId"
        FROM inventory_balances
        WHERE "tenantId" = $1::uuid
          AND "warehouseId" = $2::uuid
          AND "productId" = $3::uuid
        FOR UPDATE
      `,
      input.tenantId,
      receipt.warehouseId,
      productId,
    );
  }

  const occurredAt = new Date(
    `${receipt.receivedDate
      .toISOString()
      .slice(0, 10)}T12:00:00.000Z`,
  );

  const movementIds: string[] = [];

  for (const item of receipt.items) {
    const existingBalance =
      await tx.inventoryBalance.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: input.tenantId,
            warehouseId: receipt.warehouseId,
            productId: item.productId,
          },
        },
      });

    const oldQuantity =
      existingBalance?.quantityOnHand ??
      new Prisma.Decimal("0");

    const oldAverageCost =
      existingBalance?.averageCost ??
      new Prisma.Decimal("0");

    const oldInventoryValue =
      oldQuantity.mul(oldAverageCost);

    const receiptValue =
      item.quantityReceived.mul(item.unitCost);

    const newQuantity =
      oldQuantity.plus(item.quantityReceived);

    const newInventoryValue =
      oldInventoryValue.plus(receiptValue);

    const newAverageCost =
      newQuantity.equals(0)
        ? new Prisma.Decimal("0")
        : newInventoryValue.div(newQuantity);

    const quantityReserved =
      existingBalance?.quantityReserved ??
      new Prisma.Decimal("0");

    const newQuantityAvailable =
      newQuantity.minus(quantityReserved);

    if (newQuantityAvailable.lessThan(0)) {
      throw new GoodsReceiptPostingError(
        `Inventory availability would become negative for product ${item.productId}.`,
      );
    }

    if (existingBalance) {
      await tx.inventoryBalance.update({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: input.tenantId,
            warehouseId: receipt.warehouseId,
            productId: item.productId,
          },
        },
        data: {
          quantityOnHand: newQuantity,
          quantityAvailable: newQuantityAvailable,
          averageCost: newAverageCost,
        },
      });
    } else {
      await tx.inventoryBalance.create({
        data: {
          tenantId: input.tenantId,
          warehouseId: receipt.warehouseId,
          productId: item.productId,
          quantityOnHand: newQuantity,
          quantityReserved:
            new Prisma.Decimal("0"),
          quantityAvailable: newQuantity,
          averageCost: newAverageCost,
        },
      });
    }

    const movement =
      await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          branchId: receipt.branchId,
          warehouseId: receipt.warehouseId,
          productId: item.productId,
          movementType: "PURCHASE_RECEIPT",
          direction: "IN",
          quantity: item.quantityReceived,
          unitCost: item.unitCost,
          totalCost: receiptValue,
          referenceType: REFERENCE_TYPE,
          referenceId: receipt.id,
          occurredAt,
          createdById: input.postedById,
        },
      });

    movementIds.push(movement.id);
  }

  const postedReceipt =
    await tx.goodsReceipt.update({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: receipt.id,
        },
      },
      data: {
        status: "POSTED",
      },
    });

  return {
    goodsReceipt: postedReceipt,
    stockMovementIds: movementIds,
  };
}

export async function postGoodsReceipt(
  input: PostGoodsReceiptInput,
) {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_SERIALIZABLE_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) =>
          postGoodsReceiptInTransaction(
            tx,
            input,
          ),
        {
          maxWait: 5_000,
          timeout: 15_000,
          isolationLevel:
            Prisma.TransactionIsolationLevel
              .Serializable,
        },
      );
    } catch (error) {
      lastError = error;

      if (
        error instanceof
        GoodsReceiptPostingError
      ) {
        throw error;
      }

      if (
        attempt ===
          MAX_SERIALIZABLE_ATTEMPTS ||
        !isRetryableTransactionError(error)
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}