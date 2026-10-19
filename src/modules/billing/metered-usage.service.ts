import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { prisma } from "../../db/prisma.js";
import {
  resolveIntegerLimit,
} from "./entitlement.service.js";

export type MeteredFeatureCode =
  | "ai.monthly_actions"
  | "limits.monthly_documents";

export type UsagePeriod = {
  timezone: string;
  periodStart: Date;
  periodEnd: Date;
};

export type MeteredUsageSnapshot = {
  tenantId: string;
  featureCode: MeteredFeatureCode;
  timezone: string;
  periodStart: Date;
  periodEnd: Date;
  limit: number;
  usageCount: bigint;
  remaining: bigint;
};

export type MeteredUsageConsumptionResult =
  MeteredUsageSnapshot & {
    consumed: bigint;
    previousUsage: bigint;
  };

type AtomicUsageRow = {
  usageCount: bigint;
};

export class MeteredUsageLimitError extends Error {
  readonly tenantId: string;
  readonly featureCode: MeteredFeatureCode;
  readonly limit: number;
  readonly currentUsage: bigint;
  readonly requestedUsage: bigint;
  readonly periodStart: Date;
  readonly periodEnd: Date;

  constructor(input: {
    tenantId: string;
    featureCode: MeteredFeatureCode;
    limit: number;
    currentUsage: bigint;
    requestedUsage: bigint;
    periodStart: Date;
    periodEnd: Date;
  }) {
    super(
      `Finatyx usage limit reached for "${input.featureCode}". ` +
        `Current usage: ${input.currentUsage.toString()}, ` +
        `requested: ${input.requestedUsage.toString()}, ` +
        `limit: ${input.limit}.`
    );

    this.name = "MeteredUsageLimitError";
    this.tenantId = input.tenantId;
    this.featureCode = input.featureCode;
    this.limit = input.limit;
    this.currentUsage = input.currentUsage;
    this.requestedUsage = input.requestedUsage;
    this.periodStart = input.periodStart;
    this.periodEnd = input.periodEnd;
  }
}

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

function normalizeRequestedUsage(
  value: number | bigint
): bigint {
  if (typeof value === "bigint") {
    if (value <= 0n) {
      throw new Error(
        "Requested usage must be greater than zero."
      );
    }

    return value;
  }

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      "Requested usage must be a positive safe integer."
    );
  }

  return BigInt(value);
}

function calculateRemaining(
  limit: number,
  usageCount: bigint
): bigint {
  const limitBigInt = BigInt(limit);

  if (usageCount >= limitBigInt) {
    return 0n;
  }

  return limitBigInt - usageCount;
}

/**
 * Resolves the tenant-local calendar month and converts its
 * boundaries to UTC instants for PostgreSQL timestamptz storage.
 */
export function resolveMonthlyUsagePeriod(
  timezone: string,
  referenceDate = new Date()
): UsagePeriod {
  const normalizedTimezone =
    normalizeRequiredValue(
      timezone,
      "Tenant timezone"
    );

  const localReference =
    DateTime.fromJSDate(referenceDate, {
      zone: normalizedTimezone,
    });

  if (!localReference.isValid) {
    throw new Error(
      `Invalid tenant timezone "${normalizedTimezone}": ` +
        `${localReference.invalidExplanation ?? "unknown timezone error"}.`
    );
  }

  const localPeriodStart =
    localReference.startOf("month");

  const localPeriodEnd =
    localPeriodStart.plus({
      months: 1,
    });

  return {
    timezone: normalizedTimezone,
    periodStart:
      localPeriodStart.toUTC().toJSDate(),
    periodEnd:
      localPeriodEnd.toUTC().toJSDate(),
  };
}

async function resolveMeteredContext(
  tenantIdInput: string,
  featureCodeInput: MeteredFeatureCode,
  referenceDate = new Date()
): Promise<{
  tenantId: string;
  featureId: string;
  featureCode: MeteredFeatureCode;
  timezone: string;
  periodStart: Date;
  periodEnd: Date;
  limit: number;
}> {
  const tenantId =
    normalizeRequiredValue(
      tenantIdInput,
      "Tenant ID"
    );

  const [tenant, feature, limit] =
    await Promise.all([
      prisma.tenant.findUnique({
        where: {
          id: tenantId,
        },
        select: {
          timezone: true,
        },
      }),

      prisma.feature.findUnique({
        where: {
          code: featureCodeInput,
        },
        select: {
          id: true,
          valueType: true,
        },
      }),

      resolveIntegerLimit(
        tenantId,
        featureCodeInput
      ),
    ]);

  if (!tenant) {
    throw new Error(
      "The Finatyx tenant does not exist."
    );
  }

  if (!feature) {
    throw new Error(
      `Feature "${featureCodeInput}" does not exist.`
    );
  }

  if (feature.valueType !== "INTEGER") {
    throw new Error(
      `Feature "${featureCodeInput}" must use INTEGER values for metered usage.`
    );
  }

  const period =
    resolveMonthlyUsagePeriod(
      tenant.timezone,
      referenceDate
    );

  return {
    tenantId,
    featureId: feature.id,
    featureCode: featureCodeInput,
    timezone: period.timezone,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    limit,
  };
}

/**
 * Read-only usage inspection.
 *
 * This function never creates or increments a UsageCounter.
 */
export async function getMeteredUsage(
  tenantId: string,
  featureCode: MeteredFeatureCode,
  referenceDate = new Date()
): Promise<MeteredUsageSnapshot> {
  const context =
    await resolveMeteredContext(
      tenantId,
      featureCode,
      referenceDate
    );

  const counter =
    await prisma.usageCounter.findUnique({
      where: {
        tenantId_featureId_periodStart_periodEnd:
          {
            tenantId: context.tenantId,
            featureId: context.featureId,
            periodStart:
              context.periodStart,
            periodEnd:
              context.periodEnd,
          },
      },
      select: {
        usageCount: true,
      },
    });

  const usageCount =
    counter?.usageCount ?? 0n;

  return {
    tenantId: context.tenantId,
    featureCode:
      context.featureCode,
    timezone: context.timezone,
    periodStart:
      context.periodStart,
    periodEnd:
      context.periodEnd,
    limit: context.limit,
    usageCount,
    remaining: calculateRemaining(
      context.limit,
      usageCount
    ),
  };
}

/**
 * Atomically consumes metered usage.
 *
 * Concurrency enforcement is performed by one PostgreSQL statement.
 *
 * On first use, INSERT creates the counter with the requested amount.
 *
 * On conflict, PostgreSQL locks the existing unique counter row and
 * increments it only when:
 *
 *   existing usage + requested usage <= subscription limit
 *
 * If the WHERE condition fails, RETURNING produces no row and the
 * quota request is denied without changing the counter.
 *
 * This avoids long-lived Prisma interactive transactions and prevents
 * concurrent requests from overspending the quota.
 */
export async function consumeMeteredUsage(
  tenantId: string,
  featureCode: MeteredFeatureCode,
  requestedUsageInput: number | bigint = 1,
  referenceDate = new Date()
): Promise<MeteredUsageConsumptionResult> {
  const requestedUsage =
    normalizeRequestedUsage(
      requestedUsageInput
    );

  const context =
    await resolveMeteredContext(
      tenantId,
      featureCode,
      referenceDate
    );

  const limitBigInt =
    BigInt(context.limit);

  /*
   * A request larger than the entire subscription limit can never
   * succeed. Reject it before touching UsageCounter.
   */
  if (requestedUsage > limitBigInt) {
    const current =
      await getMeteredUsage(
        context.tenantId,
        context.featureCode,
        referenceDate
      );

    throw new MeteredUsageLimitError({
      tenantId:
        context.tenantId,
      featureCode:
        context.featureCode,
      limit:
        context.limit,
      currentUsage:
        current.usageCount,
      requestedUsage,
      periodStart:
        context.periodStart,
      periodEnd:
        context.periodEnd,
    });
  }

  const counterId =
    randomUUID();

  /*
   * PostgreSQL's ON CONFLICT handling serializes competing updates
   * against the unique monthly counter row.
   *
   * The conditional WHERE clause is the quota boundary itself.
   * Therefore the read/check/write decision occurs atomically inside
   * PostgreSQL rather than in application code.
   */
  const rows =
    await prisma.$queryRaw<AtomicUsageRow[]>`
      INSERT INTO public.usage_counters (
        "id",
        "tenantId",
        "featureId",
        "periodStart",
        "periodEnd",
        "usageCount",
        "updatedAt"
      )
      VALUES (
        ${counterId}::uuid,
        ${context.tenantId}::uuid,
        ${context.featureId}::uuid,
        ${context.periodStart},
        ${context.periodEnd},
        ${requestedUsage},
        NOW()
      )
      ON CONFLICT (
        "tenantId",
        "featureId",
        "periodStart",
        "periodEnd"
      )
      DO UPDATE
      SET
        "usageCount" =
          public.usage_counters."usageCount"
          + EXCLUDED."usageCount",
        "updatedAt" = NOW()
      WHERE
        public.usage_counters."usageCount"
          + EXCLUDED."usageCount"
          <= ${limitBigInt}
      RETURNING
        "usageCount"
    `;

  const updatedRow =
    rows[0];

  /*
   * No RETURNING row means PostgreSQL found the existing counter but
   * refused the UPDATE because it would exceed the subscription limit.
   */
  if (!updatedRow) {
    const currentCounter =
      await prisma.usageCounter.findUnique({
        where: {
          tenantId_featureId_periodStart_periodEnd:
            {
              tenantId:
                context.tenantId,
              featureId:
                context.featureId,
              periodStart:
                context.periodStart,
              periodEnd:
                context.periodEnd,
            },
        },
        select: {
          usageCount: true,
        },
      });

    throw new MeteredUsageLimitError({
      tenantId:
        context.tenantId,
      featureCode:
        context.featureCode,
      limit:
        context.limit,
      currentUsage:
        currentCounter?.usageCount ?? 0n,
      requestedUsage,
      periodStart:
        context.periodStart,
      periodEnd:
        context.periodEnd,
    });
  }

  const usageCount =
    updatedRow.usageCount;

  const previousUsage =
    usageCount - requestedUsage;

  return {
    tenantId:
      context.tenantId,
    featureCode:
      context.featureCode,
    timezone:
      context.timezone,
    periodStart:
      context.periodStart,
    periodEnd:
      context.periodEnd,
    limit:
      context.limit,
    usageCount,
    remaining:
      calculateRemaining(
        context.limit,
        usageCount
      ),
    consumed:
      requestedUsage,
    previousUsage,
  };
}
