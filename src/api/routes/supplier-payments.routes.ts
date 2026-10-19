import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  createSupplierPayment,
  getSupplierPayment,
  listSupplierPayments,
  type CreateSupplierPaymentInput,
  type CreateSupplierPaymentAllocationInput,
} from "../../modules/purchasing/supplier-payment.service.js";
import {
  postSupplierPayment,
  SupplierPaymentPostingError,
} from "../../modules/purchasing/supplier-payment-posting.service.js";
import {
  ApiError,
  getDatabaseErrorCode,
  isApiError,
} from "../shared/api-error.js";
import { requireApiAuthorization } from "../shared/request-context.js";

type TenantParams = { tenantId: string };
type PaymentParams = { tenantId: string; supplierPaymentId: string };
type ListQuery = { branchId?: unknown };
type CreateBody = {
  branchId?: unknown;
  supplierId?: unknown;
  paymentDate?: unknown;
  currencyCode?: unknown;
  amount?: unknown;
  financialAccountId?: unknown;
  reference?: unknown;
  allocations?: unknown;
};

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "invalid_request", `${name} is required.`);
  }
  return value.trim();
}

function money(value: unknown, name: string): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ApiError(400, "invalid_request", `${name} must be a decimal.`);
  }
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) {
    throw new ApiError(400, "invalid_request", `${name} must be a non-negative decimal with at most four decimal places.`);
  }
  return text;
}

function optional(value: unknown, name: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_request", `${name} must be a string or null.`);
  }
  return value;
}

function allocations(value: unknown): CreateSupplierPaymentAllocationInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new ApiError(400, "invalid_request", "Provide between 1 and 100 supplier bill allocations.");
  }
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ApiError(400, "invalid_request", `Allocation ${index + 1} must be an object.`);
    }
    const entry = raw as { supplierBillId?: unknown; amount?: unknown };
    return {
      supplierBillId: required(entry.supplierBillId, `Allocation ${index + 1} supplier bill ID`),
      amount: money(entry.amount, `Allocation ${index + 1} amount`),
    };
  });
}

function respondError(reply: FastifyReply, error: unknown) {
  if (isApiError(error)) {
    return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  }
  if (error instanceof SupplierPaymentPostingError) {
    const status = error.message.toLowerCase().includes("not found") ? 404
      : /already|conflict|retry/i.test(error.message) ? 409 : 400;
    return reply.status(status).send({ error: "supplier_payment_posting_error", message: error.message });
  }
  const databaseCode = getDatabaseErrorCode(error);
  if (["P2002", "P2034"].includes(databaseCode ?? "")) {
    return reply.status(409).send({
      error: "supplier_payment_conflict",
      message: "A conflicting supplier payment was detected. Review the existing supplier payment before retrying.",
    });
  }
  if (error instanceof Error && /required|must|cannot|does not|at least|between|exceed|eligible|active|match|belong|supported|greater than/i.test(error.message)) {
    return reply.status(400).send({ error: "invalid_request", message: error.message });
  }
  console.error("Supplier Payment API request failed:", error);
  return reply.status(500).send({
    error: "supplier_payment_operation_failed",
    message: "The supplier payment operation could not be completed.",
  });
}

export const supplierPaymentsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: TenantParams; Querystring: ListQuery }>(
    "/tenants/:tenantId/supplier-payments",
    async (request, reply) => {
      try {
        const { tenantId } = request.params;
        const branchId = required(request.query?.branchId, "Branch ID");
        await requireApiAuthorization({
          request, tenantId, branchId,
          minimumBranchAccess: "READ",
          permissionCode: "purchasing.supplier_payments.read",
        });
        return reply.status(200).send({ data: await listSupplierPayments(tenantId, branchId) });
      } catch (error) { return respondError(reply, error); }
    },
  );

  app.get<{ Params: PaymentParams }>(
    "/tenants/:tenantId/supplier-payments/:supplierPaymentId",
    async (request, reply) => {
      try {
        const { tenantId, supplierPaymentId } = request.params;
        await requireApiAuthorization({ request, tenantId, permissionCode: "purchasing.supplier_payments.read" });
        const payment = await getSupplierPayment(tenantId, supplierPaymentId);
        if (!payment) {
          return reply.status(404).send({ error: "supplier_payment_not_found", message: "Supplier payment not found." });
        }
        await requireApiAuthorization({
          request, tenantId, branchId: payment.branchId,
          minimumBranchAccess: "READ",
          permissionCode: "purchasing.supplier_payments.read",
        });
        return reply.status(200).send({ data: payment });
      } catch (error) { return respondError(reply, error); }
    },
  );

  app.post<{ Params: TenantParams; Body: CreateBody }>(
    "/tenants/:tenantId/supplier-payments",
    async (request, reply) => {
      try {
        const { tenantId } = request.params;
        const body = request.body ?? {};
        const branchId = required(body.branchId, "Branch ID");
        await requireApiAuthorization({
          request, tenantId, branchId,
          minimumBranchAccess: "OPERATE",
          permissionCode: "purchasing.supplier_payments.create",
        });
        const input: CreateSupplierPaymentInput = {
          tenantId,
          branchId,
          supplierId: required(body.supplierId, "Supplier ID"),
          paymentDate: required(body.paymentDate, "Payment date"),
          currencyCode: required(body.currencyCode, "Currency code"),
          amount: money(body.amount, "Payment amount"),
          financialAccountId: required(body.financialAccountId, "Financial account ID"),
          allocations: allocations(body.allocations),
        };
        const reference = optional(body.reference, "Reference");
        if (reference !== undefined) input.reference = reference;
        return reply.status(201).send({ data: await createSupplierPayment(input) });
      } catch (error) { return respondError(reply, error); }
    },
  );

  app.post<{ Params: PaymentParams }>(
    "/tenants/:tenantId/supplier-payments/:supplierPaymentId/post",
    async (request, reply) => {
      try {
        const { tenantId, supplierPaymentId } = request.params;
        const auth = await requireApiAuthorization({
          request, tenantId, permissionCode: "purchasing.supplier_payments.post",
        });
        const payment = await getSupplierPayment(tenantId, supplierPaymentId);
        if (!payment) {
          return reply.status(404).send({ error: "supplier_payment_not_found", message: "Supplier payment not found." });
        }
        await requireApiAuthorization({
          request, tenantId, branchId: payment.branchId,
          minimumBranchAccess: "OPERATE",
          permissionCode: "purchasing.supplier_payments.post",
        });
        // Posting service owns its own SERIALIZABLE transaction. Do not nest.
        const posted = await postSupplierPayment({
          tenantId, supplierPaymentId, postedById: auth.userId,
        });
        return reply.status(200).send({ data: posted });
      } catch (error) { return respondError(reply, error); }
    },
  );
};
