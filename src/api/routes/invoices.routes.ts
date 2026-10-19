import type {
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";

import {
  createSalesInvoice,
  getSalesInvoice,
  listSalesInvoices,
  type CreateSalesInvoiceInput,
  type CreateSalesInvoiceItemInput,
} from "../../modules/sales/sales-invoice.service.js";

import {
  postSalesInvoice,
  SalesInvoicePostingError,
} from "../../modules/sales/sales-invoice-posting.service.js";

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

type InvoiceParams = {
  tenantId: string;
  invoiceId: string;
};

type InvoiceListQuery = {
  branchId?: unknown;
};

type InvoiceItemBody = {
  productId?: unknown;
  warehouseId?: unknown;
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  discountPercent?: unknown;
  taxRate?: unknown;
};

type CreateInvoiceBody = {
  branchId?: unknown;
  customerId?: unknown;
  invoiceDate?: unknown;
  dueDate?: unknown;
  currencyCode?: unknown;
  exchangeRate?: unknown;
  notes?: unknown;
  terms?: unknown;
  items?: unknown;
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

  return value.trim();
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

function decimalString(
  value: unknown,
  fieldName: string,
  required: boolean,
): string | undefined {
  if (value === undefined && !required) {
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

  const normalized =
    String(value).trim();

  if (!normalized) {
    throw new ApiError(
      400,
      "invalid_request",
      `${fieldName} is required.`,
    );
  }

  return normalized;
}

function parseItems(
  value: unknown,
): CreateSalesInvoiceItemInput[] {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      "At least one invoice item is required.",
    );
  }

  return value.map(
    (raw, index) => {
      if (
        typeof raw !== "object" ||
        raw === null
      ) {
        throw new ApiError(
          400,
          "invalid_request",
          `Invoice item ${index + 1} must be an object.`,
        );
      }

      const item =
        raw as InvoiceItemBody;

      const quantity =
        decimalString(
          item.quantity,
          `Item ${index + 1} quantity`,
          true,
        );

      const unitPrice =
        decimalString(
          item.unitPrice,
          `Item ${index + 1} unit price`,
          true,
        );

      if (
        quantity === undefined ||
        unitPrice === undefined
      ) {
        throw new ApiError(
          400,
          "invalid_request",
          `Invoice item ${index + 1} is incomplete.`,
        );
      }

      const result:
      CreateSalesInvoiceItemInput = {
        description:
          requiredString(
            item.description,
            `Item ${index + 1} description`,
          ),
        quantity,
        unitPrice,
      };

      const productId =
        optionalString(
          item.productId,
          `Item ${index + 1} product ID`,
        );

      if (productId !== undefined) {
        result.productId = productId;
      }

      const warehouseId =
        optionalString(
          item.warehouseId,
          `Item ${index + 1} warehouse ID`,
        );

      if (warehouseId !== undefined) {
        result.warehouseId =
          warehouseId;
      }

      const discountPercent =
        decimalString(
          item.discountPercent,
          `Item ${index + 1} discount percent`,
          false,
        );

      if (discountPercent !== undefined) {
        result.discountPercent =
          discountPercent;
      }

      const taxRate =
        decimalString(
          item.taxRate,
          `Item ${index + 1} tax rate`,
          false,
        );

      if (taxRate !== undefined) {
        result.taxRate = taxRate;
      }

      return result;
    },
  );
}

function sendInvoiceError(
  reply: FastifyReply,
  error: unknown,
) {
  if (isApiError(error)) {
    return reply
      .status(error.statusCode)
      .send({
        error: error.code,
        message: error.message,
      });
  }

  if (
    error instanceof
    SalesInvoicePostingError
  ) {
    if (
      error.code ===
      "INVOICE_NOT_FOUND"
    ) {
      return reply.status(404).send({
        error:
          "invoice_not_found",
        message: error.message,
      });
    }

    if (
      error.code ===
        "DUPLICATE_POSTING" ||
      error.code ===
        "TRANSACTION_WRITE_CONFLICT"
    ) {
      return reply.status(409).send({
        error:
          error.code.toLowerCase(),
        message: error.message,
      });
    }

    return reply.status(400).send({
      error:
        error.code.toLowerCase(),
      message: error.message,
    });
  }

  const databaseCode =
    getDatabaseErrorCode(error);

  if (databaseCode === "P2002") {
    return reply.status(409).send({
      error: "invoice_conflict",
      message:
        "The invoice conflicts with an existing record.",
    });
  }

  if (
    error instanceof Error &&
    (
      error.message.includes("required") ||
      error.message.includes("must") ||
      error.message.includes("cannot") ||
      error.message.includes("does not belong") ||
      error.message.includes("does not exist") ||
      error.message.includes("At least") ||
      error.message.includes("greater than")
    )
  ) {
    return reply.status(400).send({
      error: "invalid_request",
      message: error.message,
    });
  }

  console.error(
    "Sales Invoice API request failed:",
    error,
  );

  return reply.status(500).send({
    error:
      "sales_invoice_operation_failed",
    message:
      "The sales invoice operation could not be completed.",
  });
}

export const invoicesRoutes:
FastifyPluginAsync = async (app) => {
  app.get<{
    Params: TenantParams;
    Querystring: InvoiceListQuery;
  }>(
    "/tenants/:tenantId/invoices",
    async (request, reply) => {
      try {
        const { tenantId } =
          request.params;

        const branchId =
          requiredString(
            request.query?.branchId,
            "Branch ID",
          );

        await requireApiAuthorization({
          request,
          tenantId,
          branchId,
          minimumBranchAccess: "READ",
          permissionCode:
            "sales.invoices.read",
        });

        return reply.status(200).send({
          data:
            await listSalesInvoices(
              tenantId,
              branchId,
            ),
        });
      } catch (error) {
        return sendInvoiceError(
          reply,
          error,
        );
      }
    },
  );

  app.get<{
    Params: InvoiceParams;
  }>(
    "/tenants/:tenantId/invoices/:invoiceId",
    async (request, reply) => {
      try {
        const {
          tenantId,
          invoiceId,
        } = request.params;

        await requireApiAuthorization({
          request,
          tenantId,
          permissionCode:
            "sales.invoices.read",
        });

        const invoice =
          await getSalesInvoice(
            tenantId,
            invoiceId,
          );

        if (!invoice) {
          return reply.status(404).send({
            error: "invoice_not_found",
            message:
              "Sales invoice not found.",
          });
        }

        await requireApiAuthorization({
          request,
          tenantId,
          branchId: invoice.branchId,
          minimumBranchAccess: "READ",
          permissionCode:
            "sales.invoices.read",
        });

        return reply.status(200).send({
          data: invoice,
        });
      } catch (error) {
        return sendInvoiceError(
          reply,
          error,
        );
      }
    },
  );

  app.post<{
    Params: TenantParams;
    Body: CreateInvoiceBody;
  }>(
    "/tenants/:tenantId/invoices",
    async (request, reply) => {
      try {
        const { tenantId } =
          request.params;

        const body =
          request.body ?? {};

        const branchId =
          requiredString(
            body.branchId,
            "Branch ID",
          );

        const authorization =
          await requireApiAuthorization({
            request,
            tenantId,
            branchId,
            minimumBranchAccess:
              "OPERATE",
            permissionCode:
              "sales.invoices.create",
          });

        const input:
        CreateSalesInvoiceInput = {
          tenantId,
          branchId,
          customerId:
            requiredString(
              body.customerId,
              "Customer ID",
            ),
          invoiceDate:
            requiredString(
              body.invoiceDate,
              "Invoice date",
            ),
          dueDate:
            requiredString(
              body.dueDate,
              "Due date",
            ),
          currencyCode:
            requiredString(
              body.currencyCode,
              "Currency code",
            ),
          createdById:
            authorization.userId,
          items:
            parseItems(body.items),
        };

        const exchangeRate =
          decimalString(
            body.exchangeRate,
            "Exchange rate",
            false,
          );

        if (exchangeRate !== undefined) {
          input.exchangeRate =
            exchangeRate;
        }

        const notes =
          optionalString(
            body.notes,
            "Notes",
          );

        if (notes !== undefined) {
          input.notes = notes;
        }

        const terms =
          optionalString(
            body.terms,
            "Terms",
          );

        if (terms !== undefined) {
          input.terms = terms;
        }

        const invoice =
          await createSalesInvoice(input);

        return reply.status(201).send({
          data: invoice,
        });
      } catch (error) {
        return sendInvoiceError(
          reply,
          error,
        );
      }
    },
  );

  app.post<{
    Params: InvoiceParams;
  }>(
    "/tenants/:tenantId/invoices/:invoiceId/post",
    async (request, reply) => {
      try {
        const {
          tenantId,
          invoiceId,
        } = request.params;

        const initialAuthorization =
          await requireApiAuthorization({
            request,
            tenantId,
            permissionCode:
              "sales.invoices.post",
          });

        const invoice =
          await getSalesInvoice(
            tenantId,
            invoiceId,
          );

        if (!invoice) {
          return reply.status(404).send({
            error: "invoice_not_found",
            message:
              "Sales invoice not found.",
          });
        }

        await requireApiAuthorization({
          request,
          tenantId,
          branchId: invoice.branchId,
          minimumBranchAccess:
            "OPERATE",
          permissionCode:
            "sales.invoices.post",
        });

        const posted =
          await postSalesInvoice({
            tenantId,
            invoiceId,
            postedById:
              initialAuthorization.userId,
          });

        return reply.status(200).send({
          data: posted,
        });
      } catch (error) {
        return sendInvoiceError(
          reply,
          error,
        );
      }
    },
  );
};