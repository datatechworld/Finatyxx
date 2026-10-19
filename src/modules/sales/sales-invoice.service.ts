import {
  InvoiceStatus,
  Prisma,
  RecordStatus,
} from "../../generated/prisma/client.js";

import { prisma } from "../../db/prisma.js";

import {
  allocateDocumentNumberInTransaction,
} from "../documents/document-number.service.js";

export type CreateSalesInvoiceItemInput = {
  productId?: string | null;
  warehouseId?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent?: string;
  taxRate?: string;
};

export type CreateSalesInvoiceInput = {
  tenantId: string;
  branchId: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  currencyCode: string;
  exchangeRate?: string;
  notes?: string | null;
  terms?: string | null;
  createdById: string;
  items: CreateSalesInvoiceItemInput[];
};

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);
const HUNDRED = new Prisma.Decimal(100);

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
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function currencyCode(value: string): string {
  const normalized =
    requireText(value, "Currency code").toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(
      "Currency code must contain exactly three letters.",
    );
  }

  return normalized;
}

function businessDate(
  value: string,
  fieldName: string,
): {
  exact: string;
  date: Date;
} {
  const normalized = requireText(value, fieldName);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized)
  ) {
    throw new Error(
      `${fieldName} must use YYYY-MM-DD format.`,
    );
  }

  const date =
    new Date(`${normalized}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error(
      `${fieldName} is not a valid calendar date.`,
    );
  }

  return {
    exact: normalized,
    date,
  };
}

function decimal(
  value: string,
  fieldName: string,
  scale: number,
): Prisma.Decimal {
  const normalized = requireText(value, fieldName);

  const pattern =
    scale === 8
      ? /^\d+(\.\d{1,8})?$/
      : /^\d+(\.\d{1,4})?$/;

  if (!pattern.test(normalized)) {
    throw new Error(
      `${fieldName} must be a non-negative decimal with at most ${scale} decimal places.`,
    );
  }

  return new Prisma.Decimal(normalized);
}

function percentage(
  value: string | undefined,
  fieldName: string,
): Prisma.Decimal {
  if (value === undefined) {
    return ZERO;
  }

  const parsed =
    decimal(value, fieldName, 4);

  if (parsed.greaterThan(HUNDRED)) {
    throw new Error(
      `${fieldName} cannot exceed 100.`,
    );
  }

  return parsed;
}

function money(
  value: Prisma.Decimal,
): Prisma.Decimal {
  return value.toDecimalPlaces(
    4,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

async function validateHeaderReferences(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    branchId: string;
    customerId: string;
    currencyCode: string;
  },
): Promise<void> {
  const [
    tenant,
    branch,
    customer,
    currency,
  ] = await Promise.all([
    tx.tenant.findUnique({
      where: {
        id: input.tenantId,
      },
      select: {
        id: true,
      },
    }),
    tx.branch.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: input.branchId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    }),
    tx.customer.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: input.customerId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    }),
    tx.currency.findUnique({
      where: {
        code: input.currencyCode,
      },
      select: {
        code: true,
        isActive: true,
      },
    }),
  ]);

  if (!tenant) {
    throw new Error(
      "Tenant does not exist.",
    );
  }

  if (!branch) {
    throw new Error(
      "Branch does not belong to this tenant.",
    );
  }

  if (branch.status !== RecordStatus.ACTIVE) {
    throw new Error(
      "Branch must be ACTIVE.",
    );
  }

  if (!customer) {
    throw new Error(
      "Customer does not belong to this tenant.",
    );
  }

  if (customer.status !== RecordStatus.ACTIVE) {
    throw new Error(
      "Customer must be ACTIVE.",
    );
  }

  if (!currency || !currency.isActive) {
    throw new Error(
      "Currency must be an active Finatyx currency.",
    );
  }
}

async function validateItemReferences(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  items: CreateSalesInvoiceItemInput[],
): Promise<void> {
  const productIds = [
    ...new Set(
      items
        .map((item) => item.productId)
        .filter(
          (id): id is string =>
            typeof id === "string" &&
            id.trim().length > 0,
        )
        .map((id) => id.trim()),
    ),
  ];

  const warehouseIds = [
    ...new Set(
      items
        .map((item) => item.warehouseId)
        .filter(
          (id): id is string =>
            typeof id === "string" &&
            id.trim().length > 0,
        )
        .map((id) => id.trim()),
    ),
  ];

  if (productIds.length > 0) {
    const products =
      await tx.product.findMany({
        where: {
          tenantId,
          id: {
            in: productIds,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

    const productMap =
      new Map(
        products.map((product) => [
          product.id,
          product.status,
        ]),
      );

    for (const productId of productIds) {
      const status = productMap.get(productId);

      if (!status) {
        throw new Error(
          `Product ${productId} does not belong to this tenant.`,
        );
      }

      if (status !== RecordStatus.ACTIVE) {
        throw new Error(
          `Product ${productId} must be ACTIVE.`,
        );
      }
    }
  }

  if (warehouseIds.length > 0) {
    const warehouses =
      await tx.warehouse.findMany({
        where: {
          tenantId,
          id: {
            in: warehouseIds,
          },
        },
        select: {
          id: true,
          branchId: true,
          status: true,
        },
      });

    const warehouseMap =
      new Map(
        warehouses.map((warehouse) => [
          warehouse.id,
          warehouse,
        ]),
      );

    for (const warehouseId of warehouseIds) {
      const warehouse =
        warehouseMap.get(warehouseId);

      if (!warehouse) {
        throw new Error(
          `Warehouse ${warehouseId} does not belong to this tenant.`,
        );
      }

      if (
        warehouse.status !==
        RecordStatus.ACTIVE
      ) {
        throw new Error(
          `Warehouse ${warehouseId} must be ACTIVE.`,
        );
      }

      if (warehouse.branchId !== branchId) {
        throw new Error(
          `Warehouse ${warehouseId} does not belong to the invoice branch.`,
        );
      }
    }
  }
}

export async function createSalesInvoice(
  input: CreateSalesInvoiceInput,
) {
  const tenantId =
    requireText(input.tenantId, "Tenant ID");

  const branchId =
    requireText(input.branchId, "Branch ID");

  const customerId =
    requireText(input.customerId, "Customer ID");

  const createdById =
    requireText(input.createdById, "Created by ID");

  const normalizedCurrency =
    currencyCode(input.currencyCode);

  const invoiceDate =
    businessDate(
      input.invoiceDate,
      "Invoice date",
    );

  const dueDate =
    businessDate(
      input.dueDate,
      "Due date",
    );

  if (dueDate.date < invoiceDate.date) {
    throw new Error(
      "Due date cannot be before invoice date.",
    );
  }

  const exchangeRate =
    input.exchangeRate === undefined
      ? ONE
      : decimal(
          input.exchangeRate,
          "Exchange rate",
          8,
        );

  if (
    exchangeRate.lessThanOrEqualTo(ZERO)
  ) {
    throw new Error(
      "Exchange rate must be greater than zero.",
    );
  }

  if (
    !Array.isArray(input.items) ||
    input.items.length === 0
  ) {
    throw new Error(
      "At least one invoice item is required.",
    );
  }

  return prisma.$transaction(
    async (tx) => {
      await validateHeaderReferences(
        tx,
        {
          tenantId,
          branchId,
          customerId,
          currencyCode:
            normalizedCurrency,
        },
      );

      await validateItemReferences(
        tx,
        tenantId,
        branchId,
        input.items,
      );

      let subtotal = ZERO;
      let discountTotal = ZERO;
      let taxTotal = ZERO;

      const preparedItems =
        input.items.map(
          (item, index) => {
            const description =
              requireText(
                item.description,
                `Item ${index + 1} description`,
              );

            const quantity =
              decimal(
                item.quantity,
                `Item ${index + 1} quantity`,
                4,
              );

            if (
              quantity.lessThanOrEqualTo(ZERO)
            ) {
              throw new Error(
                `Item ${index + 1} quantity must be greater than zero.`,
              );
            }

            const unitPrice =
              decimal(
                item.unitPrice,
                `Item ${index + 1} unit price`,
                4,
              );

            const discountPercent =
              percentage(
                item.discountPercent,
                `Item ${index + 1} discount percent`,
              );

            const taxRate =
              percentage(
                item.taxRate,
                `Item ${index + 1} tax rate`,
              );

            const lineSubtotal =
              money(
                quantity.times(unitPrice),
              );

            const discountAmount =
              money(
                lineSubtotal
                  .times(discountPercent)
                  .dividedBy(HUNDRED),
              );

            const taxableAmount =
              money(
                lineSubtotal.minus(
                  discountAmount,
                ),
              );

            const taxAmount =
              money(
                taxableAmount
                  .times(taxRate)
                  .dividedBy(HUNDRED),
              );

            const lineTotal =
              money(
                taxableAmount.plus(taxAmount),
              );

            subtotal =
              money(
                subtotal.plus(lineSubtotal),
              );

            discountTotal =
              money(
                discountTotal.plus(
                  discountAmount,
                ),
              );

            taxTotal =
              money(
                taxTotal.plus(taxAmount),
              );

            return {
              tenantId,
              productId:
                item.productId?.trim() ||
                null,
              warehouseId:
                item.warehouseId?.trim() ||
                null,
              description,
              quantity,
              unitPrice,
              discountPercent,
              discountAmount,
              taxRate,
              taxAmount,
              lineSubtotal,
              lineTotal,
              sortOrder: index,
            };
          },
        );

      const total =
        money(
          subtotal
            .minus(discountTotal)
            .plus(taxTotal),
        );

      if (
        total.lessThanOrEqualTo(ZERO)
      ) {
        throw new Error(
          "Invoice total must be greater than zero.",
        );
      }

      const allocation =
        await allocateDocumentNumberInTransaction(
          tx,
          tenantId,
          "INVOICE",
          invoiceDate.exact,
        );

      return tx.invoice.create({
        data: {
          tenantId,
          branchId,
          customerId,
          invoiceNumber:
            allocation.documentNumber,
          invoiceDate: invoiceDate.date,
          dueDate: dueDate.date,
          currencyCode:
            normalizedCurrency,
          exchangeRate,
          subtotal,
          discountTotal,
          taxTotal,
          roundingAdjustment: ZERO,
          total,
          amountPaid: ZERO,
          balanceDue: total,
          status: InvoiceStatus.DRAFT,
          notes: optionalText(input.notes),
          terms: optionalText(input.terms),
          createdById,
          items: {
            create: preparedItems,
          },
        },
        include: {
          customer: {
            select: {
              id: true,
              customerCode: true,
              name: true,
            },
          },
          items: true,
        },
      });
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel
          .Serializable,
      timeout: 30_000,
    },
  );
}

export async function listSalesInvoices(
  tenantId: string,
  branchId: string,
) {
  const normalizedTenant =
    requireText(tenantId, "Tenant ID");

  const normalizedBranch =
    requireText(branchId, "Branch ID");

  return prisma.invoice.findMany({
    where: {
      tenantId: normalizedTenant,
      branchId: normalizedBranch,
    },
    include: {
      customer: {
        select: {
          id: true,
          customerCode: true,
          name: true,
        },
      },
      items: true,
    },
    orderBy: [
      {
        invoiceDate: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
}

export async function getSalesInvoice(
  tenantId: string,
  invoiceId: string,
) {
  const normalizedTenant =
    requireText(tenantId, "Tenant ID");

  const normalizedInvoice =
    requireText(invoiceId, "Invoice ID");

  return prisma.invoice.findUnique({
    where: {
      tenantId_id: {
        tenantId: normalizedTenant,
        id: normalizedInvoice,
      },
    },
    include: {
      customer: {
        select: {
          id: true,
          customerCode: true,
          name: true,
        },
      },
      items: true,
      allocations: true,
    },
  });
}