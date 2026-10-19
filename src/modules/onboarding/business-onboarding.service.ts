import { prisma } from "../../db/prisma.js";

export type CreateBusinessInput = {
  legalName: string;
  tradingName?: string | null;
  slug: string;
  countryCode: string;
  baseCurrencyCode: string;
  timezone?: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  registrationNumber?: string | null;
  taxIdentification?: string | null;
  industry?: string | null;
  branchName?: string;
  branchCode?: string;
};

export type BusinessOnboardingResult = {
  tenant: {
    id: string;
    legalName: string;
    tradingName: string | null;
    slug: string;
    countryCode: string;
    baseCurrencyCode: string;
    timezone: string;
    status: string;
  };
  branch: {
    id: string;
    name: string;
    code: string;
    isHeadOffice: boolean;
  };
  membership: {
    id: string;
    status: string;
  };
  role: {
    id: string;
    name: string;
    code: string;
  };
  permissionsGranted: number;
  branchAccessLevel: string;
};

function requireValue(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function optionalValue(
  value: string | null | undefined
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function normalizeSlug(value: string): string {
  const normalized = requireValue(value, "Business slug")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new Error(
      "Business slug must contain at least one letter or number."
    );
  }

  if (normalized.length > 120) {
    throw new Error(
      "Business slug cannot exceed 120 characters."
    );
  }

  return normalized;
}

function normalizeCountryCode(value: string): string {
  const code = requireValue(value, "Country code").toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) {
    throw new Error(
      "Country code must contain exactly two letters."
    );
  }

  return code;
}

function normalizeCurrencyCode(value: string): string {
  const code = requireValue(
    value,
    "Base currency code"
  ).toUpperCase();

  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(
      "Base currency code must contain exactly three letters."
    );
  }

  return code;
}

function normalizeBranchCode(value?: string): string {
  const code = (value ?? "HO").trim().toUpperCase();

  if (!code) {
    throw new Error("Branch code is required.");
  }

  if (code.length > 40) {
    throw new Error(
      "Branch code cannot exceed 40 characters."
    );
  }

  return code;
}

/**
 * Creates the first business environment for an authenticated Finatyx user.
 *
 * Authentication happens before this service is called.
 *
 * This service is responsible for:
 * - creating the tenant
 * - creating the Head Office branch
 * - activating the creator's tenant membership
 * - creating the tenant OWNER role
 * - granting the OWNER role every platform permission
 * - assigning the OWNER role to the creator
 * - granting MANAGE access to the Head Office
 *
 * All database writes occur inside one transaction.
 */
export async function createBusinessForUser(
  finatyxUserId: string,
  input: CreateBusinessInput
): Promise<BusinessOnboardingResult> {
  const userId = requireValue(
    finatyxUserId,
    "Finatyx user ID"
  );

  const legalName = requireValue(
    input.legalName,
    "Legal business name"
  );

  const tradingName = optionalValue(input.tradingName);
  const slug = normalizeSlug(input.slug);
  const countryCode = normalizeCountryCode(
    input.countryCode
  );
  const baseCurrencyCode = normalizeCurrencyCode(
    input.baseCurrencyCode
  );

  const timezone =
    optionalValue(input.timezone) ?? "Africa/Accra";

  const branchName =
    optionalValue(input.branchName) ?? "Head Office";

  const branchCode = normalizeBranchCode(
    input.branchCode
  );

  const email = optionalValue(input.email);
  const phone = optionalValue(input.phone);
  const website = optionalValue(input.website);

  const registrationNumber = optionalValue(
    input.registrationNumber
  );

  const taxIdentification = optionalValue(
    input.taxIdentification
  );

  const industry = optionalValue(input.industry);

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    throw new Error(
      "The authenticated Finatyx user does not exist."
    );
  }

  const currency = await prisma.currency.findUnique({
    where: {
      code: baseCurrencyCode,
    },
    select: {
      code: true,
      active: true,
    },
  });

  if (!currency || !currency.active) {
    throw new Error(
      `Currency "${baseCurrencyCode}" is not an active Finatyx currency.`
    );
  }

  const existingTenant = await prisma.tenant.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
    },
  });

  if (existingTenant) {
    throw new Error(
      `The business slug "${slug}" is already in use.`
    );
  }

  const permissionCount = await prisma.permission.count();

  if (permissionCount === 0) {
    throw new Error(
      "The Finatyx permission catalogue has not been bootstrapped."
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          legalName,
          tradingName,
          slug,
          registrationNumber,
          taxIdentification,
          industry,
          countryCode,
          baseCurrencyCode,
          timezone,
          email,
          phone,
          website,
          status: "TRIAL",
        },
        select: {
          id: true,
          legalName: true,
          tradingName: true,
          slug: true,
          countryCode: true,
          baseCurrencyCode: true,
          timezone: true,
          status: true,
        },
      });

      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: branchName,
          code: branchCode,
          email,
          phone,
          countryCode,
          isHeadOffice: true,
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          code: true,
          isHeadOffice: true,
        },
      });

      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
        select: {
          id: true,
          status: true,
        },
      });

      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: "Owner",
          code: "OWNER",
          description:
            "Business owner with full tenant-level Finatyx permissions.",
          isSystemRole: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
        },
      });

      const permissions = await tx.permission.findMany({
        select: {
          id: true,
        },
      });

      if (permissions.length !== permissionCount) {
        throw new Error(
          "The permission catalogue changed during business onboarding. Please retry."
        );
      }

      if (permissions.length === 0) {
        throw new Error(
          "No Finatyx permissions are available for the OWNER role."
        );
      }

      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: ownerRole.id,
          permissionId: permission.id,
        })),
      });

      await tx.membershipRole.create({
        data: {
          tenantId: tenant.id,
          membershipId: membership.id,
          roleId: ownerRole.id,
        },
      });

      await tx.membershipBranchAccess.create({
        data: {
          tenantId: tenant.id,
          membershipId: membership.id,
          branchId: branch.id,
          accessLevel: "MANAGE",
        },
      });

      return {
        tenant,
        branch,
        membership,
        role: ownerRole,
        permissionsGranted: permissions.length,
        branchAccessLevel: "MANAGE",
      };
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
    }
  );
}