import { prisma } from "../db/prisma.js";
import {
  resolveEntitlement,
  type EntitlementSource,
  type EntitlementValue,
} from "../modules/billing/entitlement.service.js";

export type BranchAccessRequirement =
  | "READ"
  | "OPERATE"
  | "MANAGE";

export type OperationalTenantStatus =
  | "TRIAL"
  | "ACTIVE";

export type AuthorizationFailureReason =
  | "USER_NOT_FOUND"
  | "TENANT_NOT_FOUND"
  | "TENANT_INACTIVE"
  | "MEMBERSHIP_NOT_FOUND"
  | "MEMBERSHIP_INACTIVE"
  | "PERMISSION_DENIED"
  | "BRANCH_NOT_FOUND"
  | "BRANCH_INACTIVE"
  | "BRANCH_ACCESS_DENIED"
  | "ENTITLEMENT_DENIED";

export type AuthorizationEntitlementContext = {
  featureCode: string;
  value: EntitlementValue;
  source: EntitlementSource;
  planCode: string | null;
  subscriptionStatus: string | null;
};

export type AuthorizationContext = {
  userId: string;
  tenantId: string;
  tenantStatus: OperationalTenantStatus;
  membershipId: string;
  permissionCode: string | null;
  branchId: string | null;
  branchAccessLevel: BranchAccessRequirement | null;
  roleCodes: string[];
  entitlement: AuthorizationEntitlementContext | null;
};

export type AuthorizationResult =
  | {
      allowed: true;
      context: AuthorizationContext;
    }
  | {
      allowed: false;
      reason: AuthorizationFailureReason;
      message: string;
    };

export type AuthorizeInput = {
  userId: string;
  tenantId: string;
  permissionCode?: string;
  branchId?: string;
  minimumBranchAccess?: BranchAccessRequirement;

  /**
   * Optional commercial capability required by this operation.
   *
   * Examples:
   *   sales.enabled
   *   payroll.enabled
   *   inventory.enabled
   *
   * The domain/API caller explicitly supplies this requirement.
   * Authorization does not infer subscription features from
   * permission names.
   */
  requiredFeatureCode?: string;
};

export class AuthorizationError extends Error {
  readonly reason: AuthorizationFailureReason;
  readonly statusCode: number;

  constructor(
    reason: AuthorizationFailureReason,
    message: string,
    statusCode = 403
  ) {
    super(message);

    this.name = "AuthorizationError";
    this.reason = reason;
    this.statusCode = statusCode;
  }
}

const branchAccessRank: Record<
  BranchAccessRequirement,
  number
> = {
  READ: 1,
  OPERATE: 2,
  MANAGE: 3,
};

const operationalTenantStatuses =
  new Set<OperationalTenantStatus>([
    "TRIAL",
    "ACTIVE",
  ]);

function requireValue(
  value: string,
  fieldName: string
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function isOperationalTenantStatus(
  status: string
): status is OperationalTenantStatus {
  return operationalTenantStatuses.has(
    status as OperationalTenantStatus
  );
}

function hasSufficientBranchAccess(
  actual: BranchAccessRequirement,
  required: BranchAccessRequirement
): boolean {
  return (
    branchAccessRank[actual] >=
    branchAccessRank[required]
  );
}

/**
 * Evaluates whether a Finatyx user may perform a normal business
 * operation inside a tenant.
 *
 * Authorization is deny-by-default.
 *
 * Current authorization layers:
 *
 * 1. Internal Finatyx user exists.
 * 2. Tenant exists.
 * 3. Tenant is operational:
 *    - TRIAL is allowed
 *    - ACTIVE is allowed
 *    - SUSPENDED is denied
 *    - CANCELLED is denied
 *    - CLOSED is denied
 * 4. User has a tenant membership.
 * 5. Membership is ACTIVE.
 * 6. Membership has the requested permission.
 * 7. When branch-scoped:
 *    - branch belongs to the same tenant
 *    - branch is ACTIVE
 *    - membership has sufficient branch access
 * 8. When a subscription feature is required:
 *    - tenant has an eligible subscription
 *    - subscription period is valid
 *    - plan is active
 *    - effective entitlement resolves
 *    - effective entitlement permits the capability
 *
 * OWNER and other roles never bypass tenant lifecycle status,
 * subscription entitlements, or branch access requirements.
 *
 * Capacity limits, metered usage and approval requirements are
 * enforced by the domain operation when applicable.
 */
export async function authorize(
  input: AuthorizeInput
): Promise<AuthorizationResult> {
  const userId = requireValue(
    input.userId,
    "Finatyx user ID"
  );

  const tenantId = requireValue(
    input.tenantId,
    "Tenant ID"
  );

  const permissionCode =
    input.permissionCode?.trim() || null;

  const branchId =
    input.branchId?.trim() || null;

  const requiredFeatureCode =
    input.requiredFeatureCode
      ?.trim()
      .toLowerCase() || null;

  const minimumBranchAccess =
    input.minimumBranchAccess ?? "READ";

  /*
   * User and tenant existence are independent prerequisites.
   * Fetch them together because neither check depends on the other.
   */
  const [user, tenant] =
    await Promise.all([
      prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
        },
      }),

      prisma.tenant.findUnique({
        where: {
          id: tenantId,
        },
        select: {
          id: true,
          status: true,
        },
      }),
    ]);

  if (!user) {
    return {
      allowed: false,
      reason: "USER_NOT_FOUND",
      message:
        "The authenticated Finatyx user does not exist.",
    };
  }

  if (!tenant) {
    return {
      allowed: false,
      reason: "TENANT_NOT_FOUND",
      message:
        "The requested Finatyx business does not exist.",
    };
  }

  if (
    !isOperationalTenantStatus(
      tenant.status
    )
  ) {
    return {
      allowed: false,
      reason: "TENANT_INACTIVE",
      message:
        "The Finatyx business is not currently permitted to perform normal business operations.",
    };
  }

  /*
   * At this point TypeScript knows that the tenant has one of the
   * operational lifecycle states: TRIAL or ACTIVE.
   */
  const tenantStatus =
    tenant.status;

  const membership =
    await prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      select: {
        id: true,
        status: true,
        roles: {
          select: {
            role: {
              select: {
                code: true,
                permissions: permissionCode
                  ? {
                      where: {
                        permission: {
                          code: permissionCode,
                        },
                      },
                      select: {
                        permissionId: true,
                      },
                    }
                  : false,
              },
            },
          },
        },
        branchAccess: branchId
          ? {
              where: {
                branchId,
              },
              select: {
                branchId: true,
                accessLevel: true,
              },
            }
          : false,
      },
    });

  if (!membership) {
    return {
      allowed: false,
      reason: "MEMBERSHIP_NOT_FOUND",
      message:
        "The user is not a member of this Finatyx business.",
    };
  }

  if (membership.status !== "ACTIVE") {
    return {
      allowed: false,
      reason: "MEMBERSHIP_INACTIVE",
      message:
        "The user's Finatyx business membership is not active.",
    };
  }

  const roleCodes =
    membership.roles.map(
      (membershipRole) =>
        membershipRole.role.code
    );

  if (permissionCode) {
    const hasPermission =
      membership.roles.some(
        (membershipRole) =>
          membershipRole.role.permissions
            .length > 0
      );

    if (!hasPermission) {
      return {
        allowed: false,
        reason: "PERMISSION_DENIED",
        message:
          "The user does not have the required permission.",
      };
    }
  }

  let resolvedBranchAccess:
    | BranchAccessRequirement
    | null = null;

  if (branchId) {
    const branch =
      await prisma.branch.findUnique({
        where: {
          tenantId_id: {
            tenantId,
            id: branchId,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

    if (!branch) {
      return {
        allowed: false,
        reason: "BRANCH_NOT_FOUND",
        message:
          "The requested branch does not exist in this Finatyx business.",
      };
    }

    if (branch.status !== "ACTIVE") {
      return {
        allowed: false,
        reason: "BRANCH_INACTIVE",
        message:
          "The requested Finatyx branch is not active.",
      };
    }

    const branchAccess =
      membership.branchAccess[0];

    if (!branchAccess) {
      return {
        allowed: false,
        reason: "BRANCH_ACCESS_DENIED",
        message:
          "The user does not have access to this Finatyx branch.",
      };
    }

    resolvedBranchAccess =
      branchAccess.accessLevel;

    if (
      !hasSufficientBranchAccess(
        resolvedBranchAccess,
        minimumBranchAccess
      )
    ) {
      return {
        allowed: false,
        reason: "BRANCH_ACCESS_DENIED",
        message:
          "The user's branch access level is insufficient for this operation.",
      };
    }
  }

  let entitlementContext:
    | AuthorizationEntitlementContext
    | null = null;

  if (requiredFeatureCode) {
    const entitlement =
      await resolveEntitlement(
        tenantId,
        requiredFeatureCode
      );

    if (!entitlement.entitled) {
      return {
        allowed: false,
        reason: "ENTITLEMENT_DENIED",
        message:
          "The Finatyx business subscription does not include the required capability.",
      };
    }

    entitlementContext = {
      featureCode:
        entitlement.featureCode,
      value:
        entitlement.value,
      source:
        entitlement.source,
      planCode:
        entitlement.planCode,
      subscriptionStatus:
        entitlement.subscriptionStatus,
    };
  }

  return {
    allowed: true,
    context: {
      userId,
      tenantId,
      tenantStatus,
      membershipId:
        membership.id,
      permissionCode,
      branchId,
      branchAccessLevel:
        resolvedBranchAccess,
      roleCodes,
      entitlement:
        entitlementContext,
    },
  };
}

/**
 * Same authorization evaluation as authorize(), but throws when
 * access is denied.
 *
 * Domain services and protected API routes can use this helper when
 * execution must stop immediately on authorization failure.
 */
export async function requireAuthorization(
  input: AuthorizeInput
): Promise<AuthorizationContext> {
  const result =
    await authorize(input);

  if (!result.allowed) {
    throw new AuthorizationError(
      result.reason,
      result.message
    );
  }

  return result.context;
}
