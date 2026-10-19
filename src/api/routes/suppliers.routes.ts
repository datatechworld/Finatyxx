import type {
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";

import {
  createSupplier,
  getSupplier,
  listSuppliers,
  setSupplierActiveState,
  updateSupplier,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from "../../modules/suppliers/supplier.service.js";

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

type SupplierParams = {
  tenantId: string;
  supplierId: string;
};

type SupplierBody = {
  supplierCode?: unknown;
  name?: unknown;
  contactPerson?: unknown;
  email?: unknown;
  phone?: unknown;
  taxNumber?: unknown;
  paymentTermsDays?: unknown;
  currencyCode?: unknown;
  notes?: unknown;
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

function optionalInteger(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value)
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      `${fieldName} must be an integer.`,
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
      error: "supplier_conflict",
      message:
        "A supplier with the same supplier code already exists.",
    });
  }

  if (
    error instanceof Error &&
    (
      error.message.includes("required") ||
      error.message.includes("must") ||
      error.message.includes("cannot")
    )
  ) {
    return reply.status(400).send({
      error: "invalid_request",
      message: error.message,
    });
  }

  console.error("Supplier API request failed:", error);

  return reply.status(500).send({
    error: "supplier_operation_failed",
    message:
      "The supplier operation could not be completed.",
  });
}

export const suppliersRoutes:
FastifyPluginAsync = async (app) => {
  app.get<{ Params: TenantParams }>(
    "/tenants/:tenantId/suppliers",
    async (request, reply) => {
      try {
        const { tenantId } = request.params;

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "purchasing.suppliers.read",
        });

        return reply.status(200).send({
          data: await listSuppliers(tenantId),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get<{ Params: SupplierParams }>(
    "/tenants/:tenantId/suppliers/:supplierId",
    async (request, reply) => {
      try {
        const { tenantId, supplierId } =
          request.params;

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "purchasing.suppliers.read",
        });

        const supplier =
          await getSupplier(
            tenantId,
            supplierId,
          );

        if (!supplier) {
          return reply.status(404).send({
            error: "supplier_not_found",
            message: "Supplier not found.",
          });
        }

        return reply.status(200).send({
          data: supplier,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post<{
    Params: TenantParams;
    Body: SupplierBody;
  }>(
    "/tenants/:tenantId/suppliers",
    async (request, reply) => {
      try {
        const { tenantId } = request.params;
        const body = request.body ?? {};

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "purchasing.suppliers.create",
        });

        const input: CreateSupplierInput = {
          tenantId,
          supplierCode:
            requiredString(
              body.supplierCode,
              "Supplier code",
            ),
          name:
            requiredString(
              body.name,
              "Supplier name",
            ),
          currencyCode:
            requiredString(
              body.currencyCode,
              "Currency code",
            ),
        };

        const optionalFields = {
          contactPerson:
            optionalString(
              body.contactPerson,
              "Contact person",
            ),
          email:
            optionalString(body.email, "Email"),
          phone:
            optionalString(body.phone, "Phone"),
          taxNumber:
            optionalString(
              body.taxNumber,
              "Tax number",
            ),
          notes:
            optionalString(body.notes, "Notes"),
        };

        if (optionalFields.contactPerson !== undefined) {
          input.contactPerson =
            optionalFields.contactPerson;
        }

        if (optionalFields.email !== undefined) {
          input.email = optionalFields.email;
        }

        if (optionalFields.phone !== undefined) {
          input.phone = optionalFields.phone;
        }

        if (optionalFields.taxNumber !== undefined) {
          input.taxNumber = optionalFields.taxNumber;
        }

        if (optionalFields.notes !== undefined) {
          input.notes = optionalFields.notes;
        }

        const terms =
          optionalInteger(
            body.paymentTermsDays,
            "Payment terms days",
          );

        if (terms !== undefined) {
          input.paymentTermsDays = terms;
        }

        return reply.status(201).send({
          data: await createSupplier(input),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch<{
    Params: SupplierParams;
    Body: SupplierBody;
  }>(
    "/tenants/:tenantId/suppliers/:supplierId",
    async (request, reply) => {
      try {
        const { tenantId, supplierId } =
          request.params;

        const body = request.body ?? {};

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "purchasing.suppliers.update",
        });

        const input: UpdateSupplierInput = {
          tenantId,
          supplierId,
        };

        if (body.supplierCode !== undefined) {
          input.supplierCode =
            requiredString(
              body.supplierCode,
              "Supplier code",
            );
        }

        if (body.name !== undefined) {
          input.name =
            requiredString(
              body.name,
              "Supplier name",
            );
        }

        if (body.currencyCode !== undefined) {
          input.currencyCode =
            requiredString(
              body.currencyCode,
              "Currency code",
            );
        }

        const contactPerson =
          optionalString(
            body.contactPerson,
            "Contact person",
          );

        if (contactPerson !== undefined) {
          input.contactPerson = contactPerson;
        }

        const email =
          optionalString(body.email, "Email");

        if (email !== undefined) {
          input.email = email;
        }

        const phone =
          optionalString(body.phone, "Phone");

        if (phone !== undefined) {
          input.phone = phone;
        }

        const taxNumber =
          optionalString(
            body.taxNumber,
            "Tax number",
          );

        if (taxNumber !== undefined) {
          input.taxNumber = taxNumber;
        }

        const notes =
          optionalString(body.notes, "Notes");

        if (notes !== undefined) {
          input.notes = notes;
        }

        const terms =
          optionalInteger(
            body.paymentTermsDays,
            "Payment terms days",
          );

        if (terms !== undefined) {
          input.paymentTermsDays = terms;
        }

        const supplier =
          await updateSupplier(input);

        if (!supplier) {
          return reply.status(404).send({
            error: "supplier_not_found",
            message: "Supplier not found.",
          });
        }

        return reply.status(200).send({
          data: supplier,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch<{
    Params: SupplierParams;
    Body: ActiveBody;
  }>(
    "/tenants/:tenantId/suppliers/:supplierId/active-state",
    async (request, reply) => {
      try {
        const { tenantId, supplierId } =
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
            "purchasing.suppliers.archive",
        });

        const supplier =
          await setSupplierActiveState(
            tenantId,
            supplierId,
            request.body.active,
          );

        if (!supplier) {
          return reply.status(404).send({
            error: "supplier_not_found",
            message: "Supplier not found.",
          });
        }

        return reply.status(200).send({
          data: supplier,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
};