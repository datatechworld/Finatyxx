import { prisma } from "../../db/prisma.js";

export type CreateTrialSubscriptionInput = {
  tenantId: string;
  planCode: string;
};

export type FinatyxSubscriptionSummary = {
  id: string;
  tenantId: string;
  planId: string;
  planCode: string;
  planName: string;
  status: string;
  billingInterval: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function addUtcDays(
  date: Date,
  days: number
): Date {
  const result = new Date(date);

  result.setUTCDate(
    result.getUTCDate() + days
  );

  return result;
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

/**
 * Creates the initial trial subscription for a Finatyx tenant.
 *
 * This service intentionally does not accept:
 * - subscription status
 * - billing interval
 * - trial duration
 * - plan ID
 * - pricing
 *
 * Those values are resolved from the authoritative Finatyx
 * subscription catalogue rather than trusted from a client.
 */
export async function createInitialTrialSubscription(
  input: CreateTrialSubscriptionInput
): Promise<FinatyxSubscriptionSummary> {
  const tenantId = normalizeRequiredValue(
    input.tenantId,
    "Tenant ID"
  );

  const planCode = normalizeRequiredValue(
    input.planCode,
    "Plan code"
  ).toUpperCase();

  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: {
          id: tenantId,
        },
        select: {
          id: true,
        },
      });

      if (!tenant) {
        throw new Error(
          `Tenant "${tenantId}" does not exist.`
        );
      }

      const plan = await tx.plan.findUnique({
        where: {
          code: planCode,
        },
        select: {
          id: true,
          code: true,
          name: true,
          billingInterval: true,
          trialDays: true,
          status: true,
        },
      });

      if (!plan) {
        throw new Error(
          `Subscription plan "${planCode}" does not exist.`
        );
      }

      if (plan.status !== "ACTIVE") {
        throw new Error(
          `Subscription plan "${planCode}" is not active.`
        );
      }

      if (
        !Number.isInteger(plan.trialDays) ||
        plan.trialDays <= 0
      ) {
        throw new Error(
          `Subscription plan "${planCode}" does not have a valid trial period.`
        );
      }

      const existingCurrentSubscription =
        await tx.subscription.findFirst({
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
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            status: true,
          },
        });

      if (existingCurrentSubscription) {
        throw new Error(
          `Tenant "${tenantId}" already has a current subscription with status "${existingCurrentSubscription.status}".`
        );
      }

      const trialStart = now;
      const trialEnd = addUtcDays(
        trialStart,
        plan.trialDays
      );

      const subscription =
        await tx.subscription.create({
          data: {
            status: "TRIAL",
            billingInterval:
              plan.billingInterval,
            currentPeriodStart:
              trialStart,
            currentPeriodEnd:
              trialEnd,
            trialStart,
            trialEnd,
            cancelAtPeriodEnd: false,

            tenant: {
              connect: {
                id: tenantId,
              },
            },

            plan: {
              connect: {
                id: plan.id,
              },
            },
          },
          select: {
            id: true,
            tenantId: true,
            planId: true,
            status: true,
            billingInterval: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            trialStart: true,
            trialEnd: true,
            cancelAtPeriodEnd: true,
            createdAt: true,
            updatedAt: true,

            plan: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        });

      return {
        id: subscription.id,
        tenantId: subscription.tenantId,
        planId: subscription.planId,
        planCode: subscription.plan.code,
        planName: subscription.plan.name,
        status: subscription.status,
        billingInterval:
          subscription.billingInterval,
        currentPeriodStart:
          subscription.currentPeriodStart,
        currentPeriodEnd:
          subscription.currentPeriodEnd,
        trialStart: subscription.trialStart,
        trialEnd: subscription.trialEnd,
        cancelAtPeriodEnd:
          subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
      };
    },
    {
      maxWait: 10_000,
      timeout: 15_000,
    }
  );
}
