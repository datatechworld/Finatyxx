import { prisma } from "../db/prisma.js";
import { FINATYX_CURRENCIES } from "./currencies.js";
import {
  FINATYX_FEATURES,
  type FinatyxFeatureDefinition,
} from "./features.js";
import { FINATYX_PERMISSIONS } from "./permissions.js";
import {
  FINATYX_PLAN_CATALOGUE,
  type FinatyxPlanEntitlementValue,
} from "./plans.js";

const BOOTSTRAP_BATCH_SIZE = 20;

function assertUniqueValues(
  values: readonly string[],
  label: string
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate ${label} detected: ${Array.from(duplicates).join(", ")}`
    );
  }
}

async function runInBatches<T>(
  items: readonly T[],
  batchSize: number,
  operation: (item: T) => Promise<unknown>
): Promise<void> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("Bootstrap batch size must be a positive integer.");
  }

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);

    await Promise.all(
      batch.map((item) => operation(item))
    );
  }
}

function validateCurrencies(): void {
  assertUniqueValues(
    FINATYX_CURRENCIES.map((currency) => currency.code),
    "currency codes"
  );

  for (const currency of FINATYX_CURRENCIES) {
    if (!/^[A-Z]{3}$/.test(currency.code)) {
      throw new Error(
        `Invalid currency code "${currency.code}". Currency codes must contain exactly three uppercase letters.`
      );
    }

    if (!currency.name.trim()) {
      throw new Error(
        `Currency "${currency.code}" must have a name.`
      );
    }

    if (!currency.symbol.trim()) {
      throw new Error(
        `Currency "${currency.code}" must have a symbol.`
      );
    }

    if (
      !Number.isInteger(currency.decimalPlaces) ||
      currency.decimalPlaces < 0 ||
      currency.decimalPlaces > 6
    ) {
      throw new Error(
        `Currency "${currency.code}" has an invalid decimalPlaces value.`
      );
    }
  }
}

function validatePermissions(): void {
  assertUniqueValues(
    FINATYX_PERMISSIONS.map((permission) => permission.code),
    "permission codes"
  );

  for (const permission of FINATYX_PERMISSIONS) {
    const expectedCode =
      `${permission.module}.${permission.resource}.${permission.action}`;

    if (permission.code !== expectedCode) {
      throw new Error(
        `Permission code "${permission.code}" does not match its module, resource, and action. Expected "${expectedCode}".`
      );
    }

    if (
      !permission.module.trim() ||
      !permission.resource.trim() ||
      !permission.action.trim()
    ) {
      throw new Error(
        `Permission "${permission.code}" contains an empty module, resource, or action.`
      );
    }

    if (!permission.description.trim()) {
      throw new Error(
        `Permission "${permission.code}" must have a description.`
      );
    }
  }
}

function validateFeatures(): void {
  assertUniqueValues(
    FINATYX_FEATURES.map((feature) => feature.code),
    "feature codes"
  );

  if (FINATYX_FEATURES.length !== 31) {
    throw new Error(
      `Expected exactly 31 Finatyx features, but found ${FINATYX_FEATURES.length}.`
    );
  }

  for (const feature of FINATYX_FEATURES) {
    if (!feature.code.trim()) {
      throw new Error(
        "A Finatyx feature contains an empty code."
      );
    }

    if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(feature.code)) {
      throw new Error(
        `Feature code "${feature.code}" has an invalid format.`
      );
    }

    if (!feature.name.trim()) {
      throw new Error(
        `Feature "${feature.code}" must have a name.`
      );
    }

    if (!feature.module.trim()) {
      throw new Error(
        `Feature "${feature.code}" must have a module.`
      );
    }

    if (!feature.description.trim()) {
      throw new Error(
        `Feature "${feature.code}" must have a description.`
      );
    }

    if (
      feature.valueType !== "BOOLEAN" &&
      feature.valueType !== "INTEGER" &&
      feature.valueType !== "DECIMAL" &&
      feature.valueType !== "TEXT"
    ) {
      throw new Error(
        `Feature "${feature.code}" has an unsupported value type.`
      );
    }
  }
}

function getEntitlementValueCount(
  entitlement: FinatyxPlanEntitlementValue
): number {
  let count = 0;

  if (entitlement.booleanValue !== undefined) {
    count += 1;
  }

  if (entitlement.integerValue !== undefined) {
    count += 1;
  }

  if (entitlement.decimalValue !== undefined) {
    count += 1;
  }

  if (entitlement.textValue !== undefined) {
    count += 1;
  }

  return count;
}

function validateEntitlementAgainstFeature(
  entitlement: FinatyxPlanEntitlementValue,
  feature: FinatyxFeatureDefinition,
  planCode: string
): void {
  if (getEntitlementValueCount(entitlement) !== 1) {
    throw new Error(
      `Plan "${planCode}" entitlement "${entitlement.featureCode}" must contain exactly one value.`
    );
  }

  switch (feature.valueType) {
    case "BOOLEAN":
      if (entitlement.booleanValue === undefined) {
        throw new Error(
          `Plan "${planCode}" feature "${feature.code}" requires a booleanValue.`
        );
      }
      break;

    case "INTEGER":
      if (entitlement.integerValue === undefined) {
        throw new Error(
          `Plan "${planCode}" feature "${feature.code}" requires an integerValue.`
        );
      }

      if (
        !Number.isSafeInteger(entitlement.integerValue) ||
        entitlement.integerValue < 0
      ) {
        throw new Error(
          `Plan "${planCode}" feature "${feature.code}" must contain a non-negative safe integer.`
        );
      }
      break;

    case "DECIMAL":
      if (entitlement.decimalValue === undefined) {
        throw new Error(
          `Plan "${planCode}" feature "${feature.code}" requires a decimalValue.`
        );
      }

      if (
        !entitlement.decimalValue.trim() ||
        !/^\d+(\.\d+)?$/.test(entitlement.decimalValue)
      ) {
        throw new Error(
          `Plan "${planCode}" feature "${feature.code}" contains an invalid decimal value.`
        );
      }
      break;

    case "TEXT":
      if (entitlement.textValue === undefined) {
        throw new Error(
          `Plan "${planCode}" feature "${feature.code}" requires a textValue.`
        );
      }

      if (!entitlement.textValue.trim()) {
        throw new Error(
          `Plan "${planCode}" feature "${feature.code}" contains an empty text value.`
        );
      }
      break;
  }
}

function validatePlans(): void {
  assertUniqueValues(
    FINATYX_PLAN_CATALOGUE.map(({ plan }) => plan.code),
    "plan codes"
  );

  if (FINATYX_PLAN_CATALOGUE.length !== 4) {
    throw new Error(
      `Expected exactly 4 Finatyx plans, but found ${FINATYX_PLAN_CATALOGUE.length}.`
    );
  }

  const featureByCode = new Map(
    FINATYX_FEATURES.map((feature) => [
      feature.code,
      feature,
    ])
  );

  const currencyCodes = new Set(
    FINATYX_CURRENCIES.map((currency) => currency.code)
  );

  for (const { plan, entitlements } of FINATYX_PLAN_CATALOGUE) {
    if (!plan.code.trim()) {
      throw new Error(
        "A Finatyx plan contains an empty code."
      );
    }

    if (!plan.name.trim()) {
      throw new Error(
        `Plan "${plan.code}" must have a name.`
      );
    }

    if (!plan.description.trim()) {
      throw new Error(
        `Plan "${plan.code}" must have a description.`
      );
    }

    if (!currencyCodes.has(plan.currencyCode)) {
      throw new Error(
        `Plan "${plan.code}" references unsupported currency "${plan.currencyCode}".`
      );
    }

    if (
      !Number.isInteger(plan.trialDays) ||
      plan.trialDays < 0
    ) {
      throw new Error(
        `Plan "${plan.code}" has an invalid trialDays value.`
      );
    }

    if (
      !/^\d+(\.\d+)?$/.test(plan.basePrice) ||
      Number(plan.basePrice) < 0
    ) {
      throw new Error(
        `Plan "${plan.code}" has an invalid basePrice.`
      );
    }

    assertUniqueValues(
      entitlements.map(
        (entitlement) => entitlement.featureCode
      ),
      `feature entitlements in plan "${plan.code}"`
    );

    if (entitlements.length !== FINATYX_FEATURES.length) {
      throw new Error(
        `Plan "${plan.code}" must define exactly ${FINATYX_FEATURES.length} feature entitlements, but defines ${entitlements.length}.`
      );
    }

    for (const entitlement of entitlements) {
      const feature = featureByCode.get(
        entitlement.featureCode
      );

      if (!feature) {
        throw new Error(
          `Plan "${plan.code}" references unknown feature "${entitlement.featureCode}".`
        );
      }

      validateEntitlementAgainstFeature(
        entitlement,
        feature,
        plan.code
      );
    }

    for (const feature of FINATYX_FEATURES) {
      if (
        !entitlements.some(
          (entitlement) =>
            entitlement.featureCode === feature.code
        )
      ) {
        throw new Error(
          `Plan "${plan.code}" is missing entitlement "${feature.code}".`
        );
      }
    }
  }
}

async function bootstrapFinatyx(): Promise<void> {
  console.log("Finatyx platform bootstrap starting...");

  console.log("Validating currency catalogue...");
  validateCurrencies();

  console.log("Validating permission catalogue...");
  validatePermissions();

  console.log("Validating feature catalogue...");
  validateFeatures();

  console.log("Validating subscription plan catalogue...");
  validatePlans();

  console.log(
    `Validated ${FINATYX_CURRENCIES.length} currencies, ` +
      `${FINATYX_PERMISSIONS.length} permissions, ` +
      `${FINATYX_FEATURES.length} features, and ` +
      `${FINATYX_PLAN_CATALOGUE.length} plans.`
  );

  console.log("Synchronizing currencies...");

  await runInBatches(
    FINATYX_CURRENCIES,
    BOOTSTRAP_BATCH_SIZE,
    async (currency) => {
      await prisma.currency.upsert({
        where: {
          code: currency.code,
        },
        update: {
          name: currency.name,
          symbol: currency.symbol,
          decimalPlaces: currency.decimalPlaces,
          active: currency.active,
        },
        create: {
          code: currency.code,
          name: currency.name,
          symbol: currency.symbol,
          decimalPlaces: currency.decimalPlaces,
          active: currency.active,
        },
      });
    }
  );

  console.log("Synchronizing permissions...");

  await runInBatches(
    FINATYX_PERMISSIONS,
    BOOTSTRAP_BATCH_SIZE,
    async (permission) => {
      await prisma.permission.upsert({
        where: {
          code: permission.code,
        },
        update: {
          module: permission.module,
          resource: permission.resource,
          action: permission.action,
          description: permission.description,
        },
        create: {
          code: permission.code,
          module: permission.module,
          resource: permission.resource,
          action: permission.action,
          description: permission.description,
        },
      });
    }
  );

  console.log("Synchronizing features...");

  await runInBatches(
    FINATYX_FEATURES,
    BOOTSTRAP_BATCH_SIZE,
    async (feature) => {
      await prisma.feature.upsert({
        where: {
          code: feature.code,
        },
        update: {
          name: feature.name,
          module: feature.module,
          description: feature.description,
          valueType: feature.valueType,
        },
        create: {
          code: feature.code,
          name: feature.name,
          module: feature.module,
          description: feature.description,
          valueType: feature.valueType,
        },
      });
    }
  );

  const storedFeatures = await prisma.feature.findMany({
    where: {
      code: {
        in: FINATYX_FEATURES.map(
          (feature) => feature.code
        ),
      },
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (storedFeatures.length !== FINATYX_FEATURES.length) {
    throw new Error(
      `Expected ${FINATYX_FEATURES.length} stored Finatyx features after synchronization, but found ${storedFeatures.length}.`
    );
  }

  const featureIds = new Map(
    storedFeatures.map((feature) => [
      feature.code,
      feature.id,
    ])
  );

  console.log("Synchronizing subscription plans...");

  await runInBatches(
    FINATYX_PLAN_CATALOGUE,
    BOOTSTRAP_BATCH_SIZE,
    async ({ plan }) => {
      await prisma.plan.upsert({
        where: {
          code: plan.code,
        },
        update: {
          name: plan.name,
          description: plan.description,
          billingInterval: plan.billingInterval,
          basePrice: plan.basePrice,
          currencyCode: plan.currencyCode,
          trialDays: plan.trialDays,
          status: plan.status,
        },
        create: {
          code: plan.code,
          name: plan.name,
          description: plan.description,
          billingInterval: plan.billingInterval,
          basePrice: plan.basePrice,
          currencyCode: plan.currencyCode,
          trialDays: plan.trialDays,
          status: plan.status,
        },
      });
    }
  );

  const storedPlans = await prisma.plan.findMany({
    where: {
      code: {
        in: FINATYX_PLAN_CATALOGUE.map(
          ({ plan }) => plan.code
        ),
      },
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (storedPlans.length !== FINATYX_PLAN_CATALOGUE.length) {
    throw new Error(
      `Expected ${FINATYX_PLAN_CATALOGUE.length} stored Finatyx plans after synchronization, but found ${storedPlans.length}.`
    );
  }

  const planIds = new Map(
    storedPlans.map((plan) => [
      plan.code,
      plan.id,
    ])
  );

  const entitlementDefinitions =
    FINATYX_PLAN_CATALOGUE.flatMap(
      ({ plan, entitlements }) =>
        entitlements.map((entitlement) => ({
          planCode: plan.code,
          entitlement,
        }))
    );

  console.log("Synchronizing plan entitlements...");

  await runInBatches(
    entitlementDefinitions,
    BOOTSTRAP_BATCH_SIZE,
    async ({ planCode, entitlement }) => {
      const planId = planIds.get(planCode);

      if (!planId) {
        throw new Error(
          `Plan "${planCode}" was not available while processing entitlements.`
        );
      }

      const featureId = featureIds.get(
        entitlement.featureCode
      );

      if (!featureId) {
        throw new Error(
          `Feature "${entitlement.featureCode}" was not available while processing plan "${planCode}".`
        );
      }

      await prisma.planEntitlement.upsert({
        where: {
          planId_featureId: {
            planId,
            featureId,
          },
        },
        update: {
          booleanValue:
            entitlement.booleanValue ?? null,
          integerValue:
            entitlement.integerValue ?? null,
          decimalValue:
            entitlement.decimalValue ?? null,
          textValue:
            entitlement.textValue ?? null,
        },
        create: {
          planId,
          featureId,
          booleanValue:
            entitlement.booleanValue ?? null,
          integerValue:
            entitlement.integerValue ?? null,
          decimalValue:
            entitlement.decimalValue ?? null,
          textValue:
            entitlement.textValue ?? null,
        },
      });
    }
  );

  console.log("Verifying synchronized catalogue...");

  const expectedEntitlementCount =
    FINATYX_FEATURES.length *
    FINATYX_PLAN_CATALOGUE.length;

  const [
    currencyCount,
    permissionCount,
    featureCount,
    planCount,
    planEntitlementCount,
  ] = await Promise.all([
    prisma.currency.count({
      where: {
        code: {
          in: FINATYX_CURRENCIES.map(
            (currency) => currency.code
          ),
        },
      },
    }),

    prisma.permission.count({
      where: {
        code: {
          in: FINATYX_PERMISSIONS.map(
            (permission) => permission.code
          ),
        },
      },
    }),

    prisma.feature.count({
      where: {
        code: {
          in: FINATYX_FEATURES.map(
            (feature) => feature.code
          ),
        },
      },
    }),

    prisma.plan.count({
      where: {
        code: {
          in: FINATYX_PLAN_CATALOGUE.map(
            ({ plan }) => plan.code
          ),
        },
      },
    }),

    prisma.planEntitlement.count({
      where: {
        planId: {
          in: Array.from(planIds.values()),
        },
        featureId: {
          in: Array.from(featureIds.values()),
        },
      },
    }),
  ]);

  if (currencyCount !== FINATYX_CURRENCIES.length) {
    throw new Error(
      `Currency verification failed. Expected ${FINATYX_CURRENCIES.length}, found ${currencyCount}.`
    );
  }

  if (permissionCount !== FINATYX_PERMISSIONS.length) {
    throw new Error(
      `Permission verification failed. Expected ${FINATYX_PERMISSIONS.length}, found ${permissionCount}.`
    );
  }

  if (featureCount !== FINATYX_FEATURES.length) {
    throw new Error(
      `Feature verification failed. Expected ${FINATYX_FEATURES.length}, found ${featureCount}.`
    );
  }

  if (planCount !== FINATYX_PLAN_CATALOGUE.length) {
    throw new Error(
      `Plan verification failed. Expected ${FINATYX_PLAN_CATALOGUE.length}, found ${planCount}.`
    );
  }

  if (planEntitlementCount !== expectedEntitlementCount) {
    throw new Error(
      `Plan entitlement verification failed. Expected ${expectedEntitlementCount}, found ${planEntitlementCount}.`
    );
  }

  console.log(
    "Finatyx platform bootstrap completed successfully."
  );
  console.log(
    `Currencies verified: ${currencyCount}`
  );
  console.log(
    `Permissions verified: ${permissionCount}`
  );
  console.log(
    `Features verified: ${featureCount}`
  );
  console.log(
    `Plans verified: ${planCount}`
  );
  console.log(
    `Plan entitlements verified: ${planEntitlementCount}`
  );
}

try {
  await bootstrapFinatyx();
} catch (error) {
  console.error(
    "Finatyx platform bootstrap failed."
  );

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
