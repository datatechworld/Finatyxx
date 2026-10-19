import type {
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";

import {
  ProductType,
} from "../../generated/prisma/client.js";

import {
  createProduct,
  getProduct,
  listProducts,
  setProductActiveState,
  updateProduct,
  type CreateProductInput,
  type UpdateProductInput,
} from "../../modules/products/product.service.js";

import {
  ApiError,
  getDatabaseErrorCode,
  isApiError,
} from "../shared/api-error.js";

import {
  requireApiAuthorization,
} from "../shared/request-context.js";

type TenantParams = {
  tenantId: string;
};

type ProductParams = {
  tenantId: string;
  productId: string;
};

type ProductBody = {
  sku?: unknown;
  barcode?: unknown;
  name?: unknown;
  description?: unknown;
  type?: unknown;
  categoryId?: unknown;
  baseUnitId?: unknown;
  defaultSalesPrice?: unknown;
  defaultPurchasePrice?: unknown;
  trackInventory?: unknown;
  trackSerialNumbers?: unknown;
  reorderLevel?: unknown;
};

type ActiveBody = {
  active?: unknown;
};

function requiredString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      `${fieldName} is required.`,
    );
  }

  return value;
}

function optionalString(
  value: unknown,
  fieldName: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiError(
      400,
      "invalid_request",
      `${fieldName} must be a string or null.`,
    );
  }

  return value;
}

function optionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new ApiError(
      400,
      "invalid_request",
      `${fieldName} must be a boolean.`,
    );
  }

  return value;
}

function decimalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      `${fieldName} must be a decimal value.`,
    );
  }

  const normalized = String(value).trim();

  if (
    !normalized ||
    !/^\d+(\.\d{1,4})?$/.test(normalized)
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      `${fieldName} must be a non-negative decimal with at most four decimal places.`,
    );
  }

  return normalized;
}

function productType(
  value: unknown,
  required: boolean,
): ProductType | undefined {
  if (value === undefined && !required) {
    return undefined;
  }

  if (
    value !== ProductType.INVENTORY &&
    value !== ProductType.NON_INVENTORY &&
    value !== ProductType.SERVICE
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      "Product type must be INVENTORY, NON_INVENTORY, or SERVICE.",
    );
  }

  return value;
}

function sendError(
  reply: FastifyReply,
  error: unknown,
) {
  if (isApiError(error)) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }

  if (getDatabaseErrorCode(error) === "P2002") {
    return reply.status(409).send({
      error: "product_conflict",
      message:
        "A product with the same SKU already exists.",
    });
  }

  if (
    error instanceof Error &&
    (
      error.message.includes("required") ||
      error.message.includes("must") ||
      error.message.includes("cannot") ||
      error.message.includes("does not belong") ||
      error.message.includes("Only") ||
      error.message.includes("requires")
    )
  ) {
    return reply.status(400).send({
      error: "invalid_request",
      message: error.message,
    });
  }

  console.error("Product API request failed:", error);

  return reply.status(500).send({
    error: "product_operation_failed",
    message:
      "The product operation could not be completed.",
  });
}

export const productsRoutes:
FastifyPluginAsync = async (app) => {
  app.get<{ Params: TenantParams }>(
    "/tenants/:tenantId/products",
    async (request, reply) => {
      try {
        const { tenantId } = request.params;

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "inventory.products.read",
        });

        return reply.status(200).send({
          data: await listProducts(tenantId),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get<{ Params: ProductParams }>(
    "/tenants/:tenantId/products/:productId",
    async (request, reply) => {
      try {
        const { tenantId, productId } =
          request.params;

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "inventory.products.read",
        });

        const product =
          await getProduct(
            tenantId,
            productId,
          );

        if (!product) {
          return reply.status(404).send({
            error: "product_not_found",
            message: "Product not found.",
          });
        }

        return reply.status(200).send({
          data: product,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post<{
    Params: TenantParams;
    Body: ProductBody;
  }>(
    "/tenants/:tenantId/products",
    async (request, reply) => {
      try {
        const { tenantId } = request.params;
        const body = request.body ?? {};

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "inventory.products.create",
        });

        const parsedType =
          productType(body.type, true);

        if (!parsedType) {
          throw new ApiError(
            400,
            "invalid_request",
            "Product type is required.",
          );
        }

        const input: CreateProductInput = {
          tenantId,
          sku:
            requiredString(
              body.sku,
              "SKU",
            ),
          name:
            requiredString(
              body.name,
              "Product name",
            ),
          type: parsedType,
        };

        const barcode =
          optionalString(
            body.barcode,
            "Barcode",
          );

        if (barcode !== undefined) {
          input.barcode = barcode;
        }

        const description =
          optionalString(
            body.description,
            "Description",
          );

        if (description !== undefined) {
          input.description = description;
        }

        const categoryId =
          optionalString(
            body.categoryId,
            "Category ID",
          );

        if (categoryId !== undefined) {
          input.categoryId = categoryId;
        }

        const baseUnitId =
          optionalString(
            body.baseUnitId,
            "Base unit ID",
          );

        if (baseUnitId !== undefined) {
          input.baseUnitId = baseUnitId;
        }

        const salesPrice =
          decimalString(
            body.defaultSalesPrice,
            "Default sales price",
          );

        if (salesPrice !== undefined) {
          input.defaultSalesPrice = salesPrice;
        }

        const purchasePrice =
          decimalString(
            body.defaultPurchasePrice,
            "Default purchase price",
          );

        if (purchasePrice !== undefined) {
          input.defaultPurchasePrice =
            purchasePrice;
        }

        const reorderLevel =
          decimalString(
            body.reorderLevel,
            "Reorder level",
          );

        if (reorderLevel !== undefined) {
          input.reorderLevel = reorderLevel;
        }

        const trackInventory =
          optionalBoolean(
            body.trackInventory,
            "trackInventory",
          );

        if (trackInventory !== undefined) {
          input.trackInventory =
            trackInventory;
        }

        const trackSerialNumbers =
          optionalBoolean(
            body.trackSerialNumbers,
            "trackSerialNumbers",
          );

        if (trackSerialNumbers !== undefined) {
          input.trackSerialNumbers =
            trackSerialNumbers;
        }

        return reply.status(201).send({
          data: await createProduct(input),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch<{
    Params: ProductParams;
    Body: ProductBody;
  }>(
    "/tenants/:tenantId/products/:productId",
    async (request, reply) => {
      try {
        const { tenantId, productId } =
          request.params;

        const body = request.body ?? {};

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "inventory.products.update",
        });

        const input: UpdateProductInput = {
          tenantId,
          productId,
        };

        if (body.sku !== undefined) {
          input.sku =
            requiredString(body.sku, "SKU");
        }

        if (body.name !== undefined) {
          input.name =
            requiredString(
              body.name,
              "Product name",
            );
        }

        const parsedType =
          productType(body.type, false);

        if (parsedType !== undefined) {
          input.type = parsedType;
        }

        const barcode =
          optionalString(
            body.barcode,
            "Barcode",
          );

        if (barcode !== undefined) {
          input.barcode = barcode;
        }

        const description =
          optionalString(
            body.description,
            "Description",
          );

        if (description !== undefined) {
          input.description = description;
        }

        const categoryId =
          optionalString(
            body.categoryId,
            "Category ID",
          );

        if (categoryId !== undefined) {
          input.categoryId = categoryId;
        }

        const baseUnitId =
          optionalString(
            body.baseUnitId,
            "Base unit ID",
          );

        if (baseUnitId !== undefined) {
          input.baseUnitId = baseUnitId;
        }

        const salesPrice =
          decimalString(
            body.defaultSalesPrice,
            "Default sales price",
          );

        if (salesPrice !== undefined) {
          input.defaultSalesPrice = salesPrice;
        }

        const purchasePrice =
          decimalString(
            body.defaultPurchasePrice,
            "Default purchase price",
          );

        if (purchasePrice !== undefined) {
          input.defaultPurchasePrice =
            purchasePrice;
        }

        const reorderLevel =
          decimalString(
            body.reorderLevel,
            "Reorder level",
          );

        if (reorderLevel !== undefined) {
          input.reorderLevel = reorderLevel;
        }

        const trackInventory =
          optionalBoolean(
            body.trackInventory,
            "trackInventory",
          );

        if (trackInventory !== undefined) {
          input.trackInventory =
            trackInventory;
        }

        const trackSerialNumbers =
          optionalBoolean(
            body.trackSerialNumbers,
            "trackSerialNumbers",
          );

        if (trackSerialNumbers !== undefined) {
          input.trackSerialNumbers =
            trackSerialNumbers;
        }

        const product =
          await updateProduct(input);

        if (!product) {
          return reply.status(404).send({
            error: "product_not_found",
            message: "Product not found.",
          });
        }

        return reply.status(200).send({
          data: product,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch<{
    Params: ProductParams;
    Body: ActiveBody;
  }>(
    "/tenants/:tenantId/products/:productId/active-state",
    async (request, reply) => {
      try {
        const { tenantId, productId } =
          request.params;

        if (
          typeof request.body?.active !==
          "boolean"
        ) {
          throw new ApiError(
            400,
            "invalid_request",
            "active must be a boolean.",
          );
        }

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "inventory.products.archive",
        });

        const product =
          await setProductActiveState(
            tenantId,
            productId,
            request.body.active,
          );

        if (!product) {
          return reply.status(404).send({
            error: "product_not_found",
            message: "Product not found.",
          });
        }

        return reply.status(200).send({
          data: product,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
};