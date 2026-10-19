import {
  Prisma,
  ProductType,
  RecordStatus,
} from "../../generated/prisma/client.js";

import { prisma } from "../../db/prisma.js";

export type CreateProductInput = {
  tenantId: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  type: ProductType;
  categoryId?: string | null;
  baseUnitId?: string | null;
  defaultSalesPrice?: string;
  defaultPurchasePrice?: string;
  trackInventory?: boolean;
  trackSerialNumbers?: boolean;
  reorderLevel?: string;
};

export type UpdateProductInput = {
  tenantId: string;
  productId: string;
  sku?: string;
  barcode?: string | null;
  name?: string;
  description?: string | null;
  type?: ProductType;
  categoryId?: string | null;
  baseUnitId?: string | null;
  defaultSalesPrice?: string;
  defaultPurchasePrice?: string;
  trackInventory?: boolean;
  trackSerialNumbers?: boolean;
  reorderLevel?: string;
};

function requireText(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function optionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value.trim() || null;
}

function decimal(
  value: string | undefined,
  fieldName: string,
): Prisma.Decimal {
  const result =
    new Prisma.Decimal(value ?? "0");

  if (result.isNegative()) {
    throw new Error(
      `${fieldName} cannot be negative.`,
    );
  }

  return result.toDecimalPlaces(
    4,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

function normalizeInventoryFlags(
  type: ProductType,
  trackInventory: boolean | undefined,
  trackSerialNumbers: boolean | undefined,
) {
  if (type !== ProductType.INVENTORY) {
    if (trackInventory === true) {
      throw new Error(
        "Only INVENTORY products can track inventory.",
      );
    }

    if (trackSerialNumbers === true) {
      throw new Error(
        "Only INVENTORY products can track serial numbers.",
      );
    }

    return {
      trackInventory: false,
      trackSerialNumbers: false,
    };
  }

  const inventory =
    trackInventory ?? true;

  const serials =
    trackSerialNumbers ?? false;

  if (serials && !inventory) {
    throw new Error(
      "Serial number tracking requires inventory tracking.",
    );
  }

  return {
    trackInventory: inventory,
    trackSerialNumbers: serials,
  };
}

async function validateCategory(
  tenantId: string,
  categoryId: string | null | undefined,
) {
  if (!categoryId) {
    return;
  }

  const category =
    await prisma.productCategory.findFirst({
      where: {
        tenantId,
        id: categoryId,
      },
      select: { id: true },
    });

  if (!category) {
    throw new Error(
      "Product category does not belong to this tenant.",
    );
  }
}

async function validateUnit(
  tenantId: string,
  unitId: string | null | undefined,
) {
  if (!unitId) {
    return;
  }

  const unit =
    await prisma.unit.findFirst({
      where: {
        tenantId,
        id: unitId,
      },
      select: { id: true },
    });

  if (!unit) {
    throw new Error(
      "Base unit does not belong to this tenant.",
    );
  }
}

export async function createProduct(
  input: CreateProductInput,
) {
  const tenantId =
    requireText(input.tenantId, "Tenant ID");

  await validateCategory(
    tenantId,
    input.categoryId,
  );

  await validateUnit(
    tenantId,
    input.baseUnitId,
  );

  const flags =
    normalizeInventoryFlags(
      input.type,
      input.trackInventory,
      input.trackSerialNumbers,
    );

  const data: Prisma.ProductUncheckedCreateInput = {
    tenantId,
    sku: requireText(input.sku, "SKU"),
    barcode: optionalText(input.barcode) ?? null,
    name: requireText(input.name, "Product name"),
    description:
      optionalText(input.description) ?? null,
    type: input.type,
    categoryId: input.categoryId ?? null,
    baseUnitId: input.baseUnitId ?? null,
    defaultSalesPrice:
      decimal(
        input.defaultSalesPrice,
        "Default sales price",
      ),
    defaultPurchasePrice:
      decimal(
        input.defaultPurchasePrice,
        "Default purchase price",
      ),
    trackInventory: flags.trackInventory,
    trackSerialNumbers:
      flags.trackSerialNumbers,
    reorderLevel:
      decimal(
        input.reorderLevel,
        "Reorder level",
      ),
    status: RecordStatus.ACTIVE,
  };

  return prisma.product.create({ data });
}

export async function listProducts(
  tenantIdInput: string,
) {
  const tenantId =
    requireText(tenantIdInput, "Tenant ID");

  return prisma.product.findMany({
    where: { tenantId },
    include: {
      category: true,
      baseUnit: true,
    },
    orderBy: [
      { name: "asc" },
      { sku: "asc" },
    ],
  });
}

export async function getProduct(
  tenantIdInput: string,
  productIdInput: string,
) {
  return prisma.product.findFirst({
    where: {
      tenantId:
        requireText(tenantIdInput, "Tenant ID"),
      id:
        requireText(productIdInput, "Product ID"),
    },
    include: {
      category: true,
      baseUnit: true,
    },
  });
}

export async function updateProduct(
  input: UpdateProductInput,
) {
  const tenantId =
    requireText(input.tenantId, "Tenant ID");

  const productId =
    requireText(input.productId, "Product ID");

  const existing =
    await prisma.product.findFirst({
      where: {
        tenantId,
        id: productId,
      },
    });

  if (!existing) {
    return null;
  }

  if (input.categoryId !== undefined) {
    await validateCategory(
      tenantId,
      input.categoryId,
    );
  }

  if (input.baseUnitId !== undefined) {
    await validateUnit(
      tenantId,
      input.baseUnitId,
    );
  }

  const finalType =
    input.type ?? existing.type;

  const finalTrackInventory =
    input.trackInventory ??
    existing.trackInventory;

  const finalTrackSerialNumbers =
    input.trackSerialNumbers ??
    existing.trackSerialNumbers;

  const flags =
    normalizeInventoryFlags(
      finalType,
      finalTrackInventory,
      finalTrackSerialNumbers,
    );

  const data: Prisma.ProductUncheckedUpdateInput = {
    type: finalType,
    trackInventory: flags.trackInventory,
    trackSerialNumbers:
      flags.trackSerialNumbers,
  };

  if (input.sku !== undefined) {
    data.sku =
      requireText(input.sku, "SKU");
  }

  if (input.barcode !== undefined) {
    data.barcode =
      optionalText(input.barcode) ?? null;
  }

  if (input.name !== undefined) {
    data.name =
      requireText(input.name, "Product name");
  }

  if (input.description !== undefined) {
    data.description =
      optionalText(input.description) ?? null;
  }

  if (input.categoryId !== undefined) {
    data.categoryId = input.categoryId;
  }

  if (input.baseUnitId !== undefined) {
    data.baseUnitId = input.baseUnitId;
  }

  if (input.defaultSalesPrice !== undefined) {
    data.defaultSalesPrice =
      decimal(
        input.defaultSalesPrice,
        "Default sales price",
      );
  }

  if (input.defaultPurchasePrice !== undefined) {
    data.defaultPurchasePrice =
      decimal(
        input.defaultPurchasePrice,
        "Default purchase price",
      );
  }

  if (input.reorderLevel !== undefined) {
    data.reorderLevel =
      decimal(
        input.reorderLevel,
        "Reorder level",
      );
  }

  return prisma.product.update({
    where: {
      tenantId_id: {
        tenantId,
        id: productId,
      },
    },
    data,
    include: {
      category: true,
      baseUnit: true,
    },
  });
}

export async function setProductActiveState(
  tenantIdInput: string,
  productIdInput: string,
  active: boolean,
) {
  const tenantId =
    requireText(tenantIdInput, "Tenant ID");

  const productId =
    requireText(productIdInput, "Product ID");

  const existing =
    await prisma.product.findFirst({
      where: {
        tenantId,
        id: productId,
      },
      select: { id: true },
    });

  if (!existing) {
    return null;
  }

  return prisma.product.update({
    where: {
      tenantId_id: {
        tenantId,
        id: productId,
      },
    },
    data: {
      status: active
        ? RecordStatus.ACTIVE
        : RecordStatus.INACTIVE,
    },
  });
}