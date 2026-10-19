import { prisma } from "../../db/prisma.js";

export type EntitlementValue =
  | boolean
  | number
  | string
  | null;

export type EntitlementSource =
  | "TENANT_OVERRIDE"
  | "PLAN"
  | "NONE";

export type EntitlementFailureReason =
  | "TENANT_NOT_FOUND"
  | "FEATURE_NOT_FOUND"
  | "NO_SUBSCRIPTION"
  | "SUBSCRIPTION_INELIGIBLE"
  | "SUBSCRIPTION_PERIOD_EXPIRED"
  | "ENTITLEMENT_NOT_FOUND"
  | "INVALID_ENTITLEMENT_VALUE";

export type ResolvedEntitlement = {
  entitled: boolean;
  tenantId: string;
  featureCode: string;
  featureId: string | null;
  featureValueType:
    | "BOOLEAN"
    | "INTEGER"
    | "DECIMAL"
    | "TEXT"
    | null;
  value: EntitlementValue;
  source: EntitlementSource;
  reason: EntitlementFailureReason | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  planId: string | null;
  planCode: string | null;
  overrideId: string | null;
};

type StoredEntitlementValue = {
  booleanValue: boolean | null;
  integerValue: number | null;
  decimalValue: {
    toString(): string;
  } | null;
  textValue: string | null;
};

function normalizeRequiredValue(
  value: string,
  label: string
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function extractEntitlementValue(
  valueType:
    | "BOOLEAN"
    | "INTEGER"
    | "DECIMAL"
    | "TEXT",
  stored: StoredEntitlementValue
): EntitlementValue {
  switch (valueType) {
    case "BOOLEAN":
      return stored.booleanValue;

    case "INTEGER":
      return stored.integerValue;

    case "DECIMAL":
      return stored.decimalValue?.toString() ?? null;

    case "TEXT":
      return stored.textValue;

    default: {
      const exhaustiveCheck: never = valueType;
      throw new Error(
        `Unsupported feature value type: ${exhaustiveCheck}`
      );
    }
  }
}

function isValidEntitlementValue(
  valueType:
    | "BOOLEAN"
    | "INTEGER"
    | "DECIMAL"
    | "TEXT",
  value: EntitlementValue
): boolean {
  switch (valueType) {
    case "BOOLEAN":
      return typeof value === "boolean";

    case "INTEGER":
      return (
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0
      );

    case "DECIMAL":
      return (
        typeof value === "string" &&
        value.trim().length > 0
      );

    case "TEXT":
      return typeof value === "string";

    default:
      return false;
  }
}

function calculateEntitled(
  valueType:
    | "BOOLEAN"
    | "INTEGER"
    | "DECIMAL"
    | "TEXT",
  value: EntitlementValue
): boolean {
  switch (valueType) {
    case "BOOLEAN":
      return value === true;

    case "INTEGER":
      return (
        typeof value === "number" &&
        value > 0
      );

    case "DECIMAL":
      return (
        typeof value === "string" &&
        Number(value) > 0
      );

    case "TEXT":
      return (
        typeof value === "string" &&
        value.trim().length > 0
      );

    default:
      return false;
  }
}

function failureResult(
  tenantId: string,
  featureCode: string,
  reason: EntitlementFailureReason,
  options?: {
    featureId?: string | null;
    featureValueType?:
      | "BOOLEAN"
      | "INTEGER"
      | "DECIMAL"
      | "TEXT"
      | null;
    subscriptionId?: string | null;
    subscriptionStatus?: string | null;
    planId?: string | null;
    planCode?: string | null;
  }
): ResolvedEntitlement {
  return {
    entitled: false,
    tenantId,
    featureCode,
    featureId:
      options?.featureId ?? null,
    featureValueType:
      options?.featureValueType ?? null,
    value: null,
    source: "NONE",
    reason,
    subscriptionId:
      options?.subscriptionId ?? null,
    subscriptionStatus:
      options?.subscriptionStatus ?? null,
    planId:
      options?.planId ?? null,
    planCode:
      options?.planCode ?? null,
    overrideId: null,
  };
}

export async function resolveEntitlement(
  tenantIdInput: string,
  featureCodeInput: string
): Promise<ResolvedEntitlement> {
  const tenantId = normalizeRequiredValue(
    tenantIdInput,
    "Tenant ID"
  );

  const featureCode = normalizeRequiredValue(
    featureCodeInput,
    "Feature code"
  ).toLowerCase();

  const now = new Date();

  const [tenant, feature] = await Promise.all([
    prisma.tenant.findUnique({
      where: {
        id: tenantId,
      },
      select: {
        id: true,
      },
    }),

    prisma.feature.findUnique({
      where: {
        code: featureCode,
      },
      select: {
        id: true,
        code: true,
        valueType: true,
      },
    }),
  ]);

  if (!tenant) {
    return failureResult(
      tenantId,
      featureCode,
      "TENANT_NOT_FOUND"
    );
  }

  if (!feature) {
    return failureResult(
      tenantId,
      featureCode,
      "FEATURE_NOT_FOUND"
    );
  }

  const subscription =
    await prisma.subscription.findFirst({
      where: {
        tenantId,
        status: {
          in: [
            "TRIAL",
            "ACTIVE",
            "PAST_DUE",
            "SUSPENDED",
          ],
        },
      },
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      select: {
        id: true,
        status: true,
        planId: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        trialStart: true,
        trialEnd: true,
        plan: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
      },
    });

  if (!subscription) {
    return failureResult(
      tenantId,
      featureCode,
      "NO_SUBSCRIPTION",
      {
        featureId: feature.id,
        featureValueType:
          feature.valueType,
      }
    );
  }

  const commonContext = {
    featureId: feature.id,
    featureValueType: feature.valueType,
    subscriptionId: subscription.id,
    subscriptionStatus:
      subscription.status,
    planId: subscription.plan.id,
    planCode: subscription.plan.code,
  };

  /*
   * Initial Finatyx subscription policy:
   *
   * TRIAL   -> eligible
   * ACTIVE  -> eligible
   * PAST_DUE -> denied for now
   * SUSPENDED -> denied
   *
   * CANCELLED and EXPIRED are not selected as
   * current subscriptions above.
   *
   * A billing grace-period policy can later make
   * PAST_DUE eligible without changing callers.
   */
  if (
    subscription.status !== "TRIAL" &&
    subscription.status !== "ACTIVE"
  ) {
    return failureResult(
      tenantId,
      featureCode,
      "SUBSCRIPTION_INELIGIBLE",
      commonContext
    );
  }

  if (subscription.plan.status !== "ACTIVE") {
    return failureResult(
      tenantId,
      featureCode,
      "SUBSCRIPTION_INELIGIBLE",
      commonContext
    );
  }

  if (
    now < subscription.currentPeriodStart ||
    now >= subscription.currentPeriodEnd
  ) {
    return failureResult(
      tenantId,
      featureCode,
      "SUBSCRIPTION_PERIOD_EXPIRED",
      commonContext
    );
  }

  if (subscription.status === "TRIAL") {
    if (
      !subscription.trialStart ||
      !subscription.trialEnd ||
      now < subscription.trialStart ||
      now >= subscription.trialEnd
    ) {
      return failureResult(
        tenantId,
        featureCode,
        "SUBSCRIPTION_PERIOD_EXPIRED",
        commonContext
      );
    }
  }

  const [activeOverride, planEntitlement] =
    await Promise.all([
      prisma.tenantEntitlementOverride.findFirst({
        where: {
          tenantId,
          featureId: feature.id,
          effectiveFrom: {
            lte: now,
          },
          OR: [
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                gt: now,
              },
            },
          ],
        },
        orderBy: [
          {
            effectiveFrom: "desc",
          },
          {
            id: "desc",
          },
        ],
        select: {
          id: true,
          booleanValue: true,
          integerValue: true,
          decimalValue: true,
          textValue: true,
        },
      }),

      prisma.planEntitlement.findUnique({
        where: {
          planId_featureId: {
            planId: subscription.plan.id,
            featureId: feature.id,
          },
        },
        select: {
          booleanValue: true,
          integerValue: true,
          decimalValue: true,
          textValue: true,
        },
      }),
    ]);

  if (activeOverride) {
    const value = extractEntitlementValue(
      feature.valueType,
      activeOverride
    );

    if (
      !isValidEntitlementValue(
        feature.valueType,
        value
      )
    ) {
      return {
        ...failureResult(
          tenantId,
          featureCode,
          "INVALID_ENTITLEMENT_VALUE",
          commonContext
        ),
        overrideId: activeOverride.id,
      };
    }

    return {
      entitled: calculateEntitled(
        feature.valueType,
        value
      ),
      tenantId,
      featureCode,
      featureId: feature.id,
      featureValueType:
        feature.valueType,
      value,
      source: "TENANT_OVERRIDE",
      reason: null,
      subscriptionId: subscription.id,
      subscriptionStatus:
        subscription.status,
      planId: subscription.plan.id,
      planCode: subscription.plan.code,
      overrideId: activeOverride.id,
    };
  }

  if (!planEntitlement) {
    return failureResult(
      tenantId,
      featureCode,
      "ENTITLEMENT_NOT_FOUND",
      commonContext
    );
  }

  const value = extractEntitlementValue(
    feature.valueType,
    planEntitlement
  );

  if (
    !isValidEntitlementValue(
      feature.valueType,
      value
    )
  ) {
    return failureResult(
      tenantId,
      featureCode,
      "INVALID_ENTITLEMENT_VALUE",
      commonContext
    );
  }

  return {
    entitled: calculateEntitled(
      feature.valueType,
      value
    ),
    tenantId,
    featureCode,
    featureId: feature.id,
    featureValueType:
      feature.valueType,
    value,
    source: "PLAN",
    reason: null,
    subscriptionId: subscription.id,
    subscriptionStatus:
      subscription.status,
    planId: subscription.plan.id,
    planCode: subscription.plan.code,
    overrideId: null,
  };
}

export async function requireBooleanEntitlement(
  tenantId: string,
  featureCode: string
): Promise<ResolvedEntitlement> {
  const result = await resolveEntitlement(
    tenantId,
    featureCode
  );

  if (
    result.featureValueType !== "BOOLEAN"
  ) {
    throw new Error(
      `Feature "${featureCode}" is not a BOOLEAN entitlement.`
    );
  }

  if (!result.entitled || result.value !== true) {
    throw new Error(
      `Tenant "${tenantId}" is not entitled to feature "${featureCode}".`
    );
  }

  return result;
}

export async function resolveIntegerLimit(
  tenantId: string,
  featureCode: string
): Promise<number> {
  const result = await resolveEntitlement(
    tenantId,
    featureCode
  );

  if (
    result.featureValueType !== "INTEGER"
  ) {
    throw new Error(
      `Feature "${featureCode}" is not an INTEGER entitlement.`
    );
  }

  if (
    typeof result.value !== "number" ||
    !Number.isSafeInteger(result.value) ||
    result.value < 0
  ) {
    throw new Error(
      `Feature "${featureCode}" does not have a valid integer limit for tenant "${tenantId}".`
    );
  }

  return result.value;
}
