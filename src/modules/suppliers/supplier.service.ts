import {
  Prisma,
  RecordStatus,
} from "../../generated/prisma/client.js";

import { prisma } from "../../db/prisma.js";

export type CreateSupplierInput = {
  tenantId: string;
  supplierCode: string;
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  paymentTermsDays?: number;
  currencyCode: string;
  notes?: string | null;
};

export type UpdateSupplierInput = {
  tenantId: string;
  supplierId: string;
  supplierCode?: string;
  name?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  paymentTermsDays?: number;
  currencyCode?: string;
  notes?: string | null;
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

function optionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value.trim() || null;
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

function paymentTerms(
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

export async function createSupplier(
  input: CreateSupplierInput,
) {
  const data: Prisma.SupplierUncheckedCreateInput = {
    tenantId: requireText(input.tenantId, "Tenant ID"),
    supplierCode:
      requireText(input.supplierCode, "Supplier code"),
    name: requireText(input.name, "Supplier name"),
    contactPerson:
      optionalText(input.contactPerson) ?? null,
    email: optionalText(input.email) ?? null,
    phone: optionalText(input.phone) ?? null,
    taxNumber: optionalText(input.taxNumber) ?? null,
    paymentTermsDays:
      paymentTerms(input.paymentTermsDays),
    currencyCode: currencyCode(input.currencyCode),
    notes: optionalText(input.notes) ?? null,
    status: RecordStatus.ACTIVE,
  };

  return prisma.supplier.create({ data });
}

export async function listSuppliers(
  tenantIdInput: string,
) {
  const tenantId =
    requireText(tenantIdInput, "Tenant ID");

  return prisma.supplier.findMany({
    where: { tenantId },
    orderBy: [
      { name: "asc" },
      { supplierCode: "asc" },
    ],
  });
}

export async function getSupplier(
  tenantIdInput: string,
  supplierIdInput: string,
) {
  return prisma.supplier.findFirst({
    where: {
      tenantId:
        requireText(tenantIdInput, "Tenant ID"),
      id:
        requireText(supplierIdInput, "Supplier ID"),
    },
  });
}

export async function updateSupplier(
  input: UpdateSupplierInput,
) {
  const tenantId =
    requireText(input.tenantId, "Tenant ID");

  const supplierId =
    requireText(input.supplierId, "Supplier ID");

  const existing =
    await prisma.supplier.findFirst({
      where: {
        tenantId,
        id: supplierId,
      },
      select: { id: true },
    });

  if (!existing) {
    return null;
  }

  const data: Prisma.SupplierUncheckedUpdateInput = {};

  if (input.supplierCode !== undefined) {
    data.supplierCode =
      requireText(
        input.supplierCode,
        "Supplier code",
      );
  }

  if (input.name !== undefined) {
    data.name =
      requireText(input.name, "Supplier name");
  }

  if (input.contactPerson !== undefined) {
    data.contactPerson =
      optionalText(input.contactPerson) ?? null;
  }

  if (input.email !== undefined) {
    data.email =
      optionalText(input.email) ?? null;
  }

  if (input.phone !== undefined) {
    data.phone =
      optionalText(input.phone) ?? null;
  }

  if (input.taxNumber !== undefined) {
    data.taxNumber =
      optionalText(input.taxNumber) ?? null;
  }

  if (input.paymentTermsDays !== undefined) {
    data.paymentTermsDays =
      paymentTerms(input.paymentTermsDays);
  }

  if (input.currencyCode !== undefined) {
    data.currencyCode =
      currencyCode(input.currencyCode);
  }

  if (input.notes !== undefined) {
    data.notes =
      optionalText(input.notes) ?? null;
  }

  return prisma.supplier.update({
    where: {
      tenantId_id: {
        tenantId,
        id: supplierId,
      },
    },
    data,
  });
}

export async function setSupplierActiveState(
  tenantIdInput: string,
  supplierIdInput: string,
  active: boolean,
) {
  const tenantId =
    requireText(tenantIdInput, "Tenant ID");

  const supplierId =
    requireText(supplierIdInput, "Supplier ID");

  const existing =
    await prisma.supplier.findFirst({
      where: {
        tenantId,
        id: supplierId,
      },
      select: { id: true },
    });

  if (!existing) {
    return null;
  }

  return prisma.supplier.update({
    where: {
      tenantId_id: {
        tenantId,
        id: supplierId,
      },
    },
    data: {
      status: active
        ? RecordStatus.ACTIVE
        : RecordStatus.INACTIVE,
    },
  });
}