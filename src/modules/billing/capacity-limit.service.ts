import { prisma } from "../../db/prisma.js";
import {
  resolveIntegerLimit,
} from "./entitlement.service.js";

export type CapacityFeatureCode =
  | "limits.users"
  | "limits.branches"
  | "limits.warehouses";

export type CapacityCheckResult = {
  tenantId: string;
  featureCode: CapacityFeatureCode;
  limit: number;
  currentUsage: number;
  requestedAdditional: number;
  projectedUsage: number;
  remainingBeforeRequest: number;
  remainingAfterRequest: number;
  allowed: boolean;
};

export class CapacityLimitError extends Error {
  readonly tenantId: string;
  readonly featureCode: CapacityFeatureCode;
  readonly limit: number;
  readonly currentUsage: number;
  readonly requestedAdditional: number;

  constructor(
    result: CapacityCheckResult
  ) {
    super(
      `Finatyx capacity limit reached for "${result.featureCode}". ` +
        `Current usage: ${result.currentUsage}, ` +
        `requested additional: ${result.requestedAdditional}, ` +
        `limit: ${result.limit}.`
    );

    this.name = "CapacityLimitError";
    this.tenantId = result.tenantId;
    this.featureCode = result.featureCode;
    this.limit = result.limit;
    this.currentUsage = result.currentUsage;
    this.requestedAdditional =
      result.requestedAdditional;
  }
}

function normalizeRequiredValue(
  value: string,
  label: string
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      `${label} is required.`
    );
  }

  return normalized;
}

function validateRequestedAdditional(
  value: number
): number {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      "Requested additional capacity must be a positive safe integer."
    );
  }

  return value;
}

async function countCurrentCapacityUsage(
  tenantId: string,
  featureCode: CapacityFeatureCode
): Promise<number> {
  switch (featureCode) {
    case "limits.users":
      return prisma.tenantMembership.count({
        where: {
          tenantId,
          status: "ACTIVE",
        },
      });

    case "limits.branches":
      return prisma.branch.count({
        where: {
          tenantId,
          status: "ACTIVE",
        },
      });

    case "limits.warehouses":
      return prisma.warehouse.count({
        where: {
          tenantId,
          status: "ACTIVE",
        },
      });

    default: {
      const exhaustiveCheck: never =
        featureCode;

      throw new Error(
        `Unsupported capacity feature: ${exhaustiveCheck}`
      );
    }
  }
}

/**
 * Evaluates whether a tenant can consume additional capacity.
 *
 * Capacity features represent current-state resources, not
 * period-based usage. Therefore this service counts authoritative
 * active database records rather than using UsageCounter.
 */
export async function checkCapacityLimit(
  tenantIdInput: string,
  featureCode: CapacityFeatureCode,
  requestedAdditionalInput = 1
): Promise<CapacityCheckResult> {
  const tenantId = normalizeRequiredValue(
    tenantIdInput,
    "Tenant ID"
  );

  const requestedAdditional =
    validateRequestedAdditional(
      requestedAdditionalInput
    );

  const [limit, currentUsage] =
    await Promise.all([
      resolveIntegerLimit(
        tenantId,
        featureCode
      ),

      countCurrentCapacityUsage(
        tenantId,
        featureCode
      ),
    ]);

  const projectedUsage =
    currentUsage + requestedAdditional;

  const remainingBeforeRequest =
    Math.max(
      limit - currentUsage,
      0
    );

  const remainingAfterRequest =
    Math.max(
      limit - projectedUsage,
      0
    );

  return {
    tenantId,
    featureCode,
    limit,
    currentUsage,
    requestedAdditional,
    projectedUsage,
    remainingBeforeRequest,
    remainingAfterRequest,
    allowed:
      projectedUsage <= limit,
  };
}

/**
 * Same evaluation as checkCapacityLimit(), but throws when the
 * requested additional capacity would exceed the subscription
 * limit.
 *
 * Creation/reactivation services can call this immediately before
 * performing the protected operation.
 */
export async function requireCapacity(
  tenantId: string,
  featureCode: CapacityFeatureCode,
  requestedAdditional = 1
): Promise<CapacityCheckResult> {
  const result =
    await checkCapacityLimit(
      tenantId,
      featureCode,
      requestedAdditional
    );

  if (!result.allowed) {
    throw new CapacityLimitError(
      result
    );
  }

  return result;
}
