import {
  PaymentStatus,
  Prisma,
  RecordStatus,
} from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import {
  allocateDocumentNumberInTransaction,
} from "../documents/document-number.service.js";

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

export type CreateSupplierPaymentAllocationInput = {
  supplierBillId: string;
  amount: string;
};

export type CreateSupplierPaymentInput = {
  tenantId: string;
  branchId: string;
  supplierId: string;
  paymentDate: string;
  currencyCode: string;
  amount: string;
  financialAccountId: string;
  reference?: string | null;
  allocations: CreateSupplierPaymentAllocationInput[];
};

function required(value: string, field: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${field} is required.`);
  return result;
}

function optional(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function dateOnly(value: string): { exact: string; date: Date } {
  const exact = required(value, "Payment date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exact)) {
    throw new Error("Payment date must use YYYY-MM-DD format.");
  }
  const date = new Date(`${exact}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== exact) {
    throw new Error("Payment date is not a valid calendar date.");
  }
  return { exact, date };
}

function positiveMoney(value: string, field: string): Prisma.Decimal {
  const normalized = required(value, field);
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) {
    throw new Error(`${field} must be a decimal with at most four decimal places.`);
  }
  const parsed = new Prisma.Decimal(normalized);
  if (parsed.lessThanOrEqualTo(ZERO) || parsed.greaterThan("9999999999999999.9999")) {
    throw new Error(`${field} must be greater than zero and within the supported range.`);
  }
  return parsed;
}

export async function createSupplierPayment(input: CreateSupplierPaymentInput) {
  const tenantId = required(input.tenantId, "Tenant ID");
  const branchId = required(input.branchId, "Branch ID");
  const supplierId = required(input.supplierId, "Supplier ID");
  const financialAccountId = required(input.financialAccountId, "Financial account ID");
  const currencyCode = required(input.currencyCode, "Currency code").toUpperCase();
  const paymentDate = dateOnly(input.paymentDate);
  const amount = positiveMoney(input.amount, "Payment amount");

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("Currency code must contain exactly three letters.");
  }
  if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
    throw new Error("At least one supplier bill allocation is required.");
  }
  if (input.allocations.length > 100) {
    throw new Error("A supplier payment cannot contain more than 100 supplier bill allocations.");
  }

  const allocations = input.allocations.map((entry, index) => ({
    supplierBillId: required(entry.supplierBillId, `Allocation ${index + 1} supplier bill ID`),
    amount: positiveMoney(entry.amount, `Allocation ${index + 1} amount`),
  }));
  const ids = allocations.map((entry) => entry.supplierBillId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("A supplier bill cannot appear in more than one allocation.");
  }
  const allocatedTotal = allocations.reduce(
    (sum, entry) => sum.plus(entry.amount),
    ZERO,
  );
  if (!allocatedTotal.equals(amount)) {
    throw new Error("Supplier Bill allocations must equal the full supplier payment amount.");
  }

  return prisma.$transaction(async (tx) => {
    const [tenant, branch, supplier, account, currency, supplierBills] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, baseCurrencyCode: true, status: true },
      }),
      tx.branch.findUnique({
        where: { tenantId_id: { tenantId, id: branchId } },
        select: { status: true },
      }),
      tx.supplier.findUnique({
        where: { tenantId_id: { tenantId, id: supplierId } },
        select: { status: true },
      }),
      tx.financialAccount.findUnique({
        where: { tenantId_id: { tenantId, id: financialAccountId } },
        select: { status: true, branchId: true, currencyCode: true },
      }),
      tx.currency.findUnique({
        where: { code: currencyCode },
        select: { active: true },
      }),
      tx.supplierBill.findMany({
        where: { tenantId, id: { in: ids } },
        select: {
          id: true,
          branchId: true,
          supplierId: true,
          currencyCode: true,
          status: true,
          postedAt: true,
          exchangeRate: true,
          balanceDue: true,
        },
      }),
    ]);

    if (!tenant) throw new Error("Tenant does not exist.");
    if (tenant.status !== "TRIAL" && tenant.status !== "ACTIVE") throw new Error("Tenant must be financially active.");
    if (!branch || branch.status !== RecordStatus.ACTIVE) {
      throw new Error("Branch must exist and be ACTIVE.");
    }
    if (!supplier || supplier.status !== RecordStatus.ACTIVE) {
      throw new Error("Supplier must exist and be ACTIVE.");
    }
    if (!account || account.status !== RecordStatus.ACTIVE) {
      throw new Error("Financial account must exist and be ACTIVE.");
    }
    if (account.branchId !== null && account.branchId !== branchId) {
      throw new Error("Financial account must belong to the payment branch or be tenant-wide.");
    }
    if (!currency?.active) throw new Error("Currency must be active.");
    if (currencyCode !== "GHS") throw new Error("MVP supplier payments support GHS only.");
    // Frozen supplier payment posting currently supports only the base-currency foundation.
    if (currencyCode !== tenant.baseCurrencyCode || account.currencyCode !== currencyCode) {
      throw new Error("Supplier payments must use the tenant base currency and a matching financial account.");
    }
    if (supplierBills.length !== allocations.length) {
      throw new Error("Every allocated supplier bill must belong to the tenant.");
    }
    const supplierBillMap = new Map(supplierBills.map((supplierBill) => [supplierBill.id, supplierBill]));
    for (const allocation of allocations) {
      const supplierBill = supplierBillMap.get(allocation.supplierBillId);
      if (!supplierBill) throw new Error("Allocated supplier bill does not exist.");
      if (supplierBill.supplierId !== supplierId || supplierBill.branchId !== branchId) {
        throw new Error("Allocated supplier bill must belong to the supplier and branch.");
      }
      if (supplierBill.currencyCode !== currencyCode) {
        throw new Error("Allocated supplier bill currency must match supplier payment currency.");
      }
      if (!["POSTED", "PARTIALLY_PAID"].includes(supplierBill.status) || supplierBill.postedAt === null || !supplierBill.exchangeRate.equals(ONE)) {
        throw new Error("Allocated supplier bill must be posted and eligible for payment.");
      }
      if (supplierBill.balanceDue.lessThanOrEqualTo(ZERO) || allocation.amount.greaterThan(supplierBill.balanceDue)) {
        throw new Error("An allocation cannot exceed the supplier bill outstanding balance.");
      }
    }

    const number = await allocateDocumentNumberInTransaction(
      tx, tenantId, "SUPPLIER_PAYMENT", paymentDate.exact,
    );
    return tx.supplierPayment.create({
      data: {
        tenantId,
        branchId,
        supplierId,
        paymentNumber: number.documentNumber,
        paymentDate: paymentDate.date,
        currencyCode,
        exchangeRate: ONE,
        amount,
        unallocatedAmount: ZERO,
        financialAccountId,
        reference: optional(input.reference),
        status: PaymentStatus.DRAFT,
        allocations: {
          create: allocations.map((entry) => ({
            tenantId,
            supplierBillId: entry.supplierBillId,
            amount: entry.amount,
          })),
        },
      },
      include: { allocations: true },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });
}

export async function listSupplierPayments(tenantId: string, branchId: string) {
  return prisma.supplierPayment.findMany({
    where: {
      tenantId: required(tenantId, "Tenant ID"),
      branchId: required(branchId, "Branch ID"),
    },
    include: { allocations: true },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function getSupplierPayment(tenantId: string, paymentId: string) {
  return prisma.supplierPayment.findUnique({
    where: {
      tenantId_id: {
        tenantId: required(tenantId, "Tenant ID"),
        id: required(paymentId, "Payment ID"),
      },
    },
    include: { allocations: true },
  });
}
