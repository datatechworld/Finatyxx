import type {
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";

import {
  RecordStatus,
} from "../../generated/prisma/client.js";

import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "../../modules/customers/customer.service.js";

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

type CustomerParams = {
  tenantId: string;
  customerId: string;
};

type CreateCustomerBody = {
  customerCode?: unknown;
  name?: unknown;
  contactPerson?: unknown;
  email?: unknown;
  phone?: unknown;
  taxNumber?: unknown;
  paymentTermsDays?: unknown;
  creditLimit?: unknown;
  currencyCode?: unknown;
  notes?: unknown;
};

type UpdateCustomerBody =
  CreateCustomerBody & {
    status?: unknown;
  };

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

function optionalDecimalString(
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

function optionalStatus(
  value: unknown,
): RecordStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value !== RecordStatus.ACTIVE &&
    value !== RecordStatus.INACTIVE
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      "Status must be ACTIVE or INACTIVE.",
    );
  }

  return value;
}

function sendApiError(
  reply: FastifyReply,
  error: unknown,
) {
  if (isApiError(error)) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }

  const databaseCode =
    getDatabaseErrorCode(error);

  if (databaseCode === "P2002") {
    return reply.status(409).send({
      error: "customer_conflict",
      message:
        "A customer with the same unique business identifier already exists.",
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

  console.error(
    "Customer API request failed:",
    error,
  );

  return reply.status(500).send({
    error: "customer_operation_failed",
    message:
      "The customer operation could not be completed.",
  });
}

export const customersRoutes:
FastifyPluginAsync = async (app) => {
  app.get<{
    Params: TenantParams;
  }>(
    "/tenants/:tenantId/customers",
    async (request, reply) => {
      try {
        const { tenantId } = request.params;

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "crm.customers.read",
        });

        const customers =
          await listCustomers(tenantId);

        return reply.status(200).send({
          data: customers,
        });
      } catch (error) {
        return sendApiError(reply, error);
      }
    },
  );

  app.get<{
    Params: CustomerParams;
  }>(
    "/tenants/:tenantId/customers/:customerId",
    async (request, reply) => {
      try {
        const {
          tenantId,
          customerId,
        } = request.params;

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "crm.customers.read",
        });

        const customer =
          await getCustomer(
            tenantId,
            customerId,
          );

        if (!customer) {
          return reply.status(404).send({
            error: "customer_not_found",
            message: "Customer not found.",
          });
        }

        return reply.status(200).send({
          data: customer,
        });
      } catch (error) {
        return sendApiError(reply, error);
      }
    },
  );

  app.post<{
    Params: TenantParams;
    Body: CreateCustomerBody;
  }>(
    "/tenants/:tenantId/customers",
    async (request, reply) => {
      try {
        const { tenantId } = request.params;
        const body = request.body ?? {};

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "crm.customers.create",
        });

        const input:
        CreateCustomerInput = {
          tenantId,
          customerCode:
            requiredString(
              body.customerCode,
              "Customer code",
            ),
          name:
            requiredString(
              body.name,
              "Customer name",
            ),
          currencyCode:
            requiredString(
              body.currencyCode,
              "Currency code",
            ),
        };

        const contactPerson =
          optionalString(
            body.contactPerson,
            "Contact person",
          );

        if (contactPerson !== undefined) {
          input.contactPerson =
            contactPerson;
        }

        const email =
          optionalString(
            body.email,
            "Email",
          );

        if (email !== undefined) {
          input.email = email;
        }

        const phone =
          optionalString(
            body.phone,
            "Phone",
          );

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

        const paymentTermsDays =
          optionalInteger(
            body.paymentTermsDays,
            "Payment terms days",
          );

        if (paymentTermsDays !== undefined) {
          input.paymentTermsDays =
            paymentTermsDays;
        }

        const creditLimit =
          optionalDecimalString(
            body.creditLimit,
            "Credit limit",
          );

        if (creditLimit !== undefined) {
          input.creditLimit =
            creditLimit;
        }

        const notes =
          optionalString(
            body.notes,
            "Notes",
          );

        if (notes !== undefined) {
          input.notes = notes;
        }

        const customer =
          await createCustomer(input);

        return reply.status(201).send({
          data: customer,
        });
      } catch (error) {
        return sendApiError(reply, error);
      }
    },
  );

  app.patch<{
    Params: CustomerParams;
    Body: UpdateCustomerBody;
  }>(
    "/tenants/:tenantId/customers/:customerId",
    async (request, reply) => {
      try {
        const {
          tenantId,
          customerId,
        } = request.params;

        const body = request.body ?? {};

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "crm.customers.update",
        });

        const input:
        UpdateCustomerInput = {
          tenantId,
          customerId,
        };

        if (body.customerCode !== undefined) {
          input.customerCode =
            requiredString(
              body.customerCode,
              "Customer code",
            );
        }

        if (body.name !== undefined) {
          input.name =
            requiredString(
              body.name,
              "Customer name",
            );
        }

        const contactPerson =
          optionalString(
            body.contactPerson,
            "Contact person",
          );

        if (contactPerson !== undefined) {
          input.contactPerson =
            contactPerson;
        }

        const email =
          optionalString(
            body.email,
            "Email",
          );

        if (email !== undefined) {
          input.email = email;
        }

        const phone =
          optionalString(
            body.phone,
            "Phone",
          );

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

        const paymentTermsDays =
          optionalInteger(
            body.paymentTermsDays,
            "Payment terms days",
          );

        if (paymentTermsDays !== undefined) {
          input.paymentTermsDays =
            paymentTermsDays;
        }

        const creditLimit =
          optionalDecimalString(
            body.creditLimit,
            "Credit limit",
          );

        if (creditLimit !== undefined) {
          input.creditLimit =
            creditLimit;
        }

        if (body.currencyCode !== undefined) {
          input.currencyCode =
            requiredString(
              body.currencyCode,
              "Currency code",
            );
        }

        const notes =
          optionalString(
            body.notes,
            "Notes",
          );

        if (notes !== undefined) {
          input.notes = notes;
        }

        const status =
          optionalStatus(body.status);

        if (status !== undefined) {
          input.status = status;
        }

        const customer =
          await updateCustomer(input);

        if (!customer) {
          return reply.status(404).send({
            error: "customer_not_found",
            message: "Customer not found.",
          });
        }

        return reply.status(200).send({
          data: customer,
        });
      } catch (error) {
        return sendApiError(reply, error);
      }
    },
  );
};