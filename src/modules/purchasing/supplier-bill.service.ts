import { DocumentStatus, Prisma, ProductType, RecordStatus, TenantStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { allocateDocumentNumberInTransaction } from "../documents/document-number.service.js";

export type CreateSupplierBillItemInput = {
  productId: string;
  description: string;
  quantity: string;
  unitCost: string;
  taxAmount?: string;
};

export type CreateSupplierBillInput = {
  tenantId: string;
  branchId: string;
  supplierId: string;
  billDate: string;
  dueDate: string;
  currencyCode: string;
  exchangeRate?: string;
  supplierInvoiceNumber?: string | null;
  items: CreateSupplierBillItemInput[];
};

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);
function required(value: string, field: string): string {
  const text = value.trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}
function dateOnly(value: string, field: string): { text: string; date: Date } {
  const text = required(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} must use YYYY-MM-DD format.`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error(`${field} must be a valid calendar date.`);
  }
  return { text, date };
}
function decimal(value: string, field: string, scale: 4 | 8): Prisma.Decimal {
  const text = required(value, field);
  const pattern = scale === 4 ? /^\d+(\.\d{1,4})?$/ : /^\d+(\.\d{1,8})?$/;
  if (!pattern.test(text)) throw new Error(`${field} must be a non-negative decimal with at most ${scale} decimal places.`);
  return new Prisma.Decimal(text);
}
function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}
export async function createSupplierBill(input: CreateSupplierBillInput) {
  const tenantId = required(input.tenantId, "Tenant ID");
  const branchId = required(input.branchId, "Branch ID");
  const supplierId = required(input.supplierId, "Supplier ID");
  const billDate = dateOnly(input.billDate, "Bill date");
  const dueDate = dateOnly(input.dueDate, "Due date");
  if (dueDate.date < billDate.date) throw new Error("Due date cannot be before bill date.");
  const currencyCode = required(input.currencyCode, "Currency code").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Currency code must contain three letters.");
  const exchangeRate = input.exchangeRate === undefined ? ONE : decimal(input.exchangeRate, "Exchange rate", 8);
  if (!exchangeRate.eq(ONE)) throw new Error("MVP Supplier Bills must use exchange rate 1.");
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("At least one supplier bill item is required.");
  const supplierInvoiceNumber = input.supplierInvoiceNumber?.trim() || null;
  if (supplierInvoiceNumber && supplierInvoiceNumber.length > 120) throw new Error("Supplier invoice number must not exceed 120 characters.");
  const prepared = input.items.map((item, index) => {
    const productId = required(item.productId, `Item ${index + 1} product ID`);
    const description = required(item.description, `Item ${index + 1} description`);
    const quantity = decimal(item.quantity, `Item ${index + 1} quantity`, 4);
    const unitCost = decimal(item.unitCost, `Item ${index + 1} unit cost`, 4);
    const taxAmount = decimal(item.taxAmount ?? "0", `Item ${index + 1} tax amount`, 4);
    if (quantity.lte(ZERO)) throw new Error(`Item ${index + 1} quantity must be greater than zero.`);
    const net = money(quantity.times(unitCost));
    const lineTotal = money(net.plus(taxAmount));
    return { tenantId, productId, description, quantity, unitCost, taxRate: ZERO, taxAmount, lineTotal, net };
  });
  let subtotal = ZERO;
  let taxTotal = ZERO;
  for (const item of prepared) {
    subtotal = money(subtotal.plus(item.net));
    taxTotal = money(taxTotal.plus(item.taxAmount));
  }
  const total = money(subtotal.plus(taxTotal));
  if (total.lte(ZERO)) throw new Error("Supplier bill total must be greater than zero.");
  return prisma.$transaction(async (tx) => {
    const [tenant, branch, supplier, currency] = await Promise.all([
      tx.tenant.findUnique({ where: { id: tenantId }, select: { baseCurrencyCode: true, status: true } }),
      tx.branch.findUnique({ where: { tenantId_id: { tenantId, id: branchId } }, select: { status: true } }),
      tx.supplier.findUnique({ where: { tenantId_id: { tenantId, id: supplierId } }, select: { status: true } }),
      tx.currency.findUnique({ where: { code: currencyCode }, select: { active: true } }),
    ]);
    if (!tenant || (tenant.status !== TenantStatus.ACTIVE && tenant.status !== TenantStatus.TRIAL)) throw new Error("Tenant must be operational.");
    if (!branch || branch.status !== RecordStatus.ACTIVE) throw new Error("Branch must exist and be ACTIVE.");
    if (!supplier || supplier.status !== RecordStatus.ACTIVE) throw new Error("Supplier must exist and be ACTIVE.");
    if (tenant.baseCurrencyCode !== currencyCode || !currency?.active) throw new Error("Currency must be the tenant active base currency.");
    const productIds = [...new Set(prepared.map((item) => item.productId))];
    const products = await tx.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, status: true, type: true, trackInventory: true } });
    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const productId of productIds) {
      const product = productMap.get(productId);
      if (!product || product.status !== RecordStatus.ACTIVE || product.type !== ProductType.INVENTORY || !product.trackInventory) {
        throw new Error(`Product ${productId} must be an ACTIVE inventory-tracked product belonging to this tenant.`);
      }
    }
    const allocation = await allocateDocumentNumberInTransaction(tx, tenantId, "SUPPLIER_BILL", billDate.text);
    return tx.supplierBill.create({
      data: {
        tenantId, branchId, supplierId, billNumber: allocation.documentNumber,
        supplierInvoiceNumber, billDate: billDate.date, dueDate: dueDate.date,
        currencyCode, exchangeRate, subtotal, taxTotal, total,
        amountPaid: ZERO, balanceDue: total, status: DocumentStatus.DRAFT,
        items: { create: prepared.map(({ net: _net, ...item }) => item) },
      },
      include: { supplier: { select: { id: true, supplierCode: true, name: true } }, items: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
export async function listSupplierBills(tenantId: string, branchId: string) {
  return prisma.supplierBill.findMany({
    where: { tenantId: required(tenantId, "Tenant ID"), branchId: required(branchId, "Branch ID") },
    include: { supplier: { select: { id: true, supplierCode: true, name: true } }, items: true },
    orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
  });
}
export async function getSupplierBill(tenantId: string, supplierBillId: string) {
  return prisma.supplierBill.findUnique({
    where: { tenantId_id: { tenantId: required(tenantId, "Tenant ID"), id: required(supplierBillId, "Supplier bill ID") } },
    include: { supplier: { select: { id: true, supplierCode: true, name: true } }, items: true, allocations: true },
  });
}
