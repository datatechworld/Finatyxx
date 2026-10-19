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

export type CreateCustomerPaymentAllocationInput = {
  invoiceId: string;
  amount: string;
};

export type CreateCustomerPaymentInput = {
  tenantId: string;
  branchId: string;
  customerId: string;
  paymentDate: string;
  currencyCode: string;
  amount: string;
  financialAccountId: string;
  reference?: string | null;
  notes?: string | null;
  receivedById: string;
  allocations: CreateCustomerPaymentAllocationInput[];
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

export async function createCustomerPayment(input: CreateCustomerPaymentInput) {
  const tenantId = required(input.tenantId, "Tenant ID");
  const branchId = required(input.branchId, "Branch ID");
  const customerId = required(input.customerId, "Customer ID");
  const receivedById = required(input.receivedById, "Received by ID");
  const financialAccountId = required(input.financialAccountId, "Financial account ID");
  const currencyCode = required(input.currencyCode, "Currency code").toUpperCase();
  const paymentDate = dateOnly(input.paymentDate);
  const amount = positiveMoney(input.amount, "Payment amount");

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("Currency code must contain exactly three letters.");
  }
  if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
    throw new Error("At least one invoice allocation is required.");
  }
  if (input.allocations.length > 100) {
    throw new Error("A receipt cannot contain more than 100 invoice allocations.");
  }

  const allocations = input.allocations.map((entry, index) => ({
    invoiceId: required(entry.invoiceId, `Allocation ${index + 1} invoice ID`),
    amount: positiveMoney(entry.amount, `Allocation ${index + 1} amount`),
  }));
  const ids = allocations.map((entry) => entry.invoiceId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("An invoice cannot appear in more than one allocation.");
  }
  const allocatedTotal = allocations.reduce(
    (sum, entry) => sum.plus(entry.amount),
    ZERO,
  );
  if (!allocatedTotal.equals(amount)) {
    throw new Error("Invoice allocations must equal the full receipt amount.");
  }

  return prisma.$transaction(async (tx) => {
    const [tenant, branch, customer, account, currency, invoices] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, baseCurrencyCode: true },
      }),
      tx.branch.findUnique({
        where: { tenantId_id: { tenantId, id: branchId } },
        select: { status: true },
      }),
      tx.customer.findUnique({
        where: { tenantId_id: { tenantId, id: customerId } },
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
      tx.invoice.findMany({
        where: { tenantId, id: { in: ids } },
        select: {
          id: true,
          branchId: true,
          customerId: true,
          currencyCode: true,
          status: true,
          balanceDue: true,
        },
      }),
    ]);

    if (!tenant) throw new Error("Tenant does not exist.");
    if (!branch || branch.status !== RecordStatus.ACTIVE) {
      throw new Error("Branch must exist and be ACTIVE.");
    }
    if (!customer || customer.status !== RecordStatus.ACTIVE) {
      throw new Error("Customer must exist and be ACTIVE.");
    }
    if (!account || account.status !== RecordStatus.ACTIVE) {
      throw new Error("Financial account must exist and be ACTIVE.");
    }
    if (account.branchId !== null && account.branchId !== branchId) {
      throw new Error("Financial account must belong to the payment branch or be tenant-wide.");
    }
    if (!currency?.active) throw new Error("Currency must be active.");
    // Frozen customer receipt posting currently supports only the base-currency foundation.
    if (currencyCode !== tenant.baseCurrencyCode || account.currencyCode !== currencyCode) {
      throw new Error("Customer receipts must use the tenant base currency and a matching financial account.");
    }
    if (invoices.length !== allocations.length) {
      throw new Error("Every allocated invoice must belong to the tenant.");
    }
    const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    for (const allocation of allocations) {
      const invoice = invoiceMap.get(allocation.invoiceId);
      if (!invoice) throw new Error("Allocated invoice does not exist.");
      if (invoice.customerId !== customerId || invoice.branchId !== branchId) {
        throw new Error("Allocated invoice must belong to the receipt customer and branch.");
      }
      if (invoice.currencyCode !== currencyCode) {
        throw new Error("Allocated invoice currency must match receipt currency.");
      }
      if (!["POSTED", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) {
        throw new Error("Allocated invoice must be posted and eligible for payment.");
      }
      if (allocation.amount.greaterThan(invoice.balanceDue)) {
        throw new Error("An allocation cannot exceed the invoice outstanding balance.");
      }
    }

    const number = await allocateDocumentNumberInTransaction(
      tx, tenantId, "RECEIPT", paymentDate.exact,
    );
    return tx.payment.create({
      data: {
        tenantId,
        branchId,
        customerId,
        paymentNumber: number.documentNumber,
        paymentDate: paymentDate.date,
        currencyCode,
        exchangeRate: ONE,
        amount,
        unallocatedAmount: ZERO,
        financialAccountId,
        reference: optional(input.reference),
        notes: optional(input.notes),
        receivedById,
        status: PaymentStatus.DRAFT,
        allocations: {
          create: allocations.map((entry) => ({
            tenantId,
            invoiceId: entry.invoiceId,
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

export async function listCustomerPayments(tenantId: string, branchId: string) {
  return prisma.payment.findMany({
    where: {
      tenantId: required(tenantId, "Tenant ID"),
      branchId: required(branchId, "Branch ID"),
    },
    include: { allocations: true },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function getCustomerPayment(tenantId: string, paymentId: string) {
  return prisma.payment.findUnique({
    where: {
      tenantId_id: {
        tenantId: required(tenantId, "Tenant ID"),
        id: required(paymentId, "Payment ID"),
      },
    },
    include: { allocations: true },
  });
}
