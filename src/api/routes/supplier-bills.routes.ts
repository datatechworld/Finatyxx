import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { createSupplierBill, getSupplierBill, listSupplierBills, type CreateSupplierBillInput, type CreateSupplierBillItemInput } from "../../modules/purchasing/supplier-bill.service.js";
import { postSupplierBill, SupplierBillPostingError } from "../../modules/purchasing/supplier-bill-posting.service.js";
import { ApiError, getDatabaseErrorCode, isApiError } from "../shared/api-error.js";
import { requireApiAuthorization } from "../shared/request-context.js";

type TenantParams = { tenantId: string };
type BillParams = { tenantId: string; supplierBillId: string };
type ListQuery = { branchId?: unknown };
type BillBody = { branchId?: unknown; supplierId?: unknown; billDate?: unknown; dueDate?: unknown; currencyCode?: unknown; exchangeRate?: unknown; supplierInvoiceNumber?: unknown; items?: unknown };
function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, "invalid_request", `${field} is required.`);
  return value.trim();
}
function decimalString(value: unknown, field: string, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" && typeof value !== "number") throw new ApiError(400, "invalid_request", `${field} must be a decimal value.`);
  const text = String(value).trim();
  if (!text) throw new ApiError(400, "invalid_request", `${field} is required.`);
  return text;
}
function parseItems(value: unknown): CreateSupplierBillItemInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new ApiError(400, "invalid_request", "At least one supplier bill item is required.");
  return value.map((raw: unknown, index: number) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ApiError(400, "invalid_request", `Item ${index + 1} must be an object.`);
    const item = raw as Record<string, unknown>;
    const result: CreateSupplierBillItemInput = {
      productId: requiredString(item.productId, `Item ${index + 1} product ID`),
      description: requiredString(item.description, `Item ${index + 1} description`),
      quantity: decimalString(item.quantity, `Item ${index + 1} quantity`, true)!,
      unitCost: decimalString(item.unitCost, `Item ${index + 1} unit cost`, true)!,
    };
    const taxAmount = decimalString(item.taxAmount, `Item ${index + 1} tax amount`, false);
    if (taxAmount !== undefined) result.taxAmount = taxAmount;
    return result;
  });
}
function sendBillError(reply: FastifyReply, error: unknown) {
  if (isApiError(error)) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  if (error instanceof SupplierBillPostingError) {
    const status = error.code === "SUPPLIER_BILL_NOT_FOUND" ? 404 : error.code === "DUPLICATE_POSTING" || error.code === "TRANSACTION_WRITE_CONFLICT" ? 409 : 400;
    return reply.status(status).send({ error: error.code.toLowerCase(), message: error.message });
  }
  const code = getDatabaseErrorCode(error);
  if (code === "P2002" || code === "P2034") return reply.status(409).send({ error: "supplier_bill_conflict", message: "The supplier bill conflicts with another transaction." });
  if (error instanceof Error && /required|must|cannot|at least|greater than|valid calendar|belonging to this tenant/i.test(error.message)) {
    return reply.status(400).send({ error: "invalid_request", message: error.message });
  }
  console.error("Supplier Bill API request failed:", error);
  return reply.status(500).send({ error: "supplier_bill_operation_failed", message: "The supplier bill operation could not be completed." });
}
export const supplierBillsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: TenantParams; Querystring: ListQuery }>("/tenants/:tenantId/supplier-bills", async (request, reply) => {
    try {
      const { tenantId } = request.params;
      const branchId = requiredString(request.query?.branchId, "Branch ID");
      await requireApiAuthorization({ request, tenantId, branchId, minimumBranchAccess: "READ", permissionCode: "purchasing.supplier_bills.read" });
      return reply.status(200).send({ data: await listSupplierBills(tenantId, branchId) });
    } catch (error) { return sendBillError(reply, error); }
  });
  app.get<{ Params: BillParams }>("/tenants/:tenantId/supplier-bills/:supplierBillId", async (request, reply) => {
    try {
      const { tenantId, supplierBillId } = request.params;
      await requireApiAuthorization({ request, tenantId, permissionCode: "purchasing.supplier_bills.read" });
      const bill = await getSupplierBill(tenantId, supplierBillId);
      if (!bill) return reply.status(404).send({ error: "supplier_bill_not_found", message: "Supplier bill not found." });
      await requireApiAuthorization({ request, tenantId, branchId: bill.branchId, minimumBranchAccess: "READ", permissionCode: "purchasing.supplier_bills.read" });
      return reply.status(200).send({ data: bill });
    } catch (error) { return sendBillError(reply, error); }
  });
  app.post<{ Params: TenantParams; Body: BillBody }>("/tenants/:tenantId/supplier-bills", async (request, reply) => {
    try {
      const { tenantId } = request.params;
      const body = request.body ?? {};
      const branchId = requiredString(body.branchId, "Branch ID");
      await requireApiAuthorization({ request, tenantId, branchId, minimumBranchAccess: "OPERATE", permissionCode: "purchasing.supplier_bills.create" });
      const input: CreateSupplierBillInput = {
        tenantId, branchId,
        supplierId: requiredString(body.supplierId, "Supplier ID"),
        billDate: requiredString(body.billDate, "Bill date"),
        dueDate: requiredString(body.dueDate, "Due date"),
        currencyCode: requiredString(body.currencyCode, "Currency code"),
        items: parseItems(body.items),
      };
      const exchangeRate = decimalString(body.exchangeRate, "Exchange rate", false);
      if (exchangeRate !== undefined) input.exchangeRate = exchangeRate;
      if (body.supplierInvoiceNumber !== undefined) {
        if (body.supplierInvoiceNumber !== null && typeof body.supplierInvoiceNumber !== "string") throw new ApiError(400, "invalid_request", "Supplier invoice number must be a string or null.");
        input.supplierInvoiceNumber = body.supplierInvoiceNumber as string | null;
      }
      return reply.status(201).send({ data: await createSupplierBill(input) });
    } catch (error) { return sendBillError(reply, error); }
  });
  app.post<{ Params: BillParams }>("/tenants/:tenantId/supplier-bills/:supplierBillId/post", async (request, reply) => {
    try {
      const { tenantId, supplierBillId } = request.params;
      const authorization = await requireApiAuthorization({ request, tenantId, permissionCode: "purchasing.supplier_bills.post" });
      const bill = await getSupplierBill(tenantId, supplierBillId);
      if (!bill) return reply.status(404).send({ error: "supplier_bill_not_found", message: "Supplier bill not found." });
      await requireApiAuthorization({ request, tenantId, branchId: bill.branchId, minimumBranchAccess: "OPERATE", permissionCode: "purchasing.supplier_bills.post" });
      return reply.status(200).send({ data: await postSupplierBill({ tenantId, supplierBillId, postedById: authorization.userId }) });
    } catch (error) { return sendBillError(reply, error); }
  });
};
