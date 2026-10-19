import {
  Prisma,
  RecordStatus,
} from "../../generated/prisma/client.js";

import { prisma } from "../../db/prisma.js";

export type CreateCustomerInput = {
  tenantId: string;
  customerCode: string;
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  paymentTermsDays?: number;
  creditLimit?: string;
  currencyCode: string;
  notes?: string | null;
};

export type UpdateCustomerInput = {
  tenantId: string;
  customerId: string;
  customerCode?: string;
  name?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  paymentTermsDays?: number;
  creditLimit?: string;
  currencyCode?: string;
  notes?: string | null;
  status?: RecordStatus;
};

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

function normalizeOptionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function normalizeCurrencyCode(
  value: string,
): string {
  const normalized =
    requireText(value, "Currency code").toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(
      "Currency code must contain exactly three letters.",
    );
  }

  return normalized;
}

function normalizePaymentTermsDays(
  value: number | undefined,
): number {
  if (value === undefined) {
    return 0;
  }

  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > 3650
  ) {
    throw new Error(
      "Payment terms days must be an integer between 0 and 3650.",
    );
  }

  return value;
}

function normalizeCreditLimit(
  value: string | undefined,
): Prisma.Decimal {
  const decimal =
    new Prisma.Decimal(value ?? "0");

  if (decimal.isNegative()) {
    throw new Error(
      "Credit limit cannot be negative.",
    );
  }

  return decimal.toDecimalPlaces(
    4,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

export async function createCustomer(
  input: CreateCustomerInput,
) {
  const tenantId =
    requireText(input.tenantId, "Tenant ID");

  const customerCode =
    requireText(
      input.customerCode,
      "Customer code",
    );

  const name =
    requireText(input.name, "Customer name");

  const currencyCode =
    normalizeCurrencyCode(input.currencyCode);

  const paymentTermsDays =
    normalizePaymentTermsDays(
      input.paymentTermsDays,
    );

  const creditLimit =
    normalizeCreditLimit(input.creditLimit);

  return prisma.customer.create({
    data: {
      tenantId,
      customerCode,
      name,
      contactPerson:
        normalizeOptionalText(
          input.contactPerson,
        ) ?? null,
      email:
        normalizeOptionalText(input.email) ?? null,
      phone:
        normalizeOptionalText(input.phone) ?? null,
      taxNumber:
        normalizeOptionalText(
          input.taxNumber,
        ) ?? null,
      paymentTermsDays,
      creditLimit,
      currencyCode,
      notes:
        normalizeOptionalText(input.notes) ?? null,
      status: RecordStatus.ACTIVE,
    },
  });
}

export async function listCustomers(
  tenantIdInput: string,
) {
  const tenantId =
    requireText(tenantIdInput, "Tenant ID");

  return prisma.customer.findMany({
    where: {
      tenantId,
    },
    orderBy: [
      {
        name: "asc",
      },
      {
        customerCode: "asc",
      },
    ],
  });
}

export async function getCustomer(
  tenantIdInput: string,
  customerIdInput: string,
) {
  const tenantId =
    requireText(tenantIdInput, "Tenant ID");

  const customerId =
    requireText(
      customerIdInput,
      "Customer ID",
    );

  return prisma.customer.findFirst({
    where: {
      tenantId,
      id: customerId,
    },
  });
}

export async function updateCustomer(
  input: UpdateCustomerInput,
) {
  const tenantId =
    requireText(input.tenantId, "Tenant ID");

  const customerId =
    requireText(
      input.customerId,
      "Customer ID",
    );

  const existing =
    await prisma.customer.findFirst({
      where: {
        tenantId,
        id: customerId,
      },
      select: {
        id: true,
      },
    });

  if (!existing) {
    return null;
  }

  const data: Prisma.CustomerUpdateInput = {};

  if (input.customerCode !== undefined) {
    data.customerCode =
      requireText(
        input.customerCode,
        "Customer code",
      );
  }

  if (input.name !== undefined) {
    data.name =
      requireText(
        input.name,
        "Customer name",
      );
  }

  if (input.contactPerson !== undefined) {
    data.contactPerson =
      normalizeOptionalText(
        input.contactPerson,
      ) ?? null;
  }

  if (input.email !== undefined) {
    data.email =
      normalizeOptionalText(input.email) ?? null;
  }

  if (input.phone !== undefined) {
    data.phone =
      normalizeOptionalText(input.phone) ?? null;
  }

  if (input.taxNumber !== undefined) {
    data.taxNumber =
      normalizeOptionalText(
        input.taxNumber,
      ) ?? null;
  }

  if (input.paymentTermsDays !== undefined) {
    data.paymentTermsDays =
      normalizePaymentTermsDays(
        input.paymentTermsDays,
      );
  }

  if (input.creditLimit !== undefined) {
    data.creditLimit =
      normalizeCreditLimit(input.creditLimit);
  }

  if (input.currencyCode !== undefined) {
    data.currencyCode =
      normalizeCurrencyCode(
        input.currencyCode,
      );
  }

  if (input.notes !== undefined) {
    data.notes =
      normalizeOptionalText(input.notes) ?? null;
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  return prisma.customer.update({
    where: {
      tenantId_id: {
        tenantId,
        id: customerId,
      },
    },
    data,
  });
}