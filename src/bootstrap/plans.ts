export type FinatyxPlanCode =
  | "STARTER"
  | "GROWTH"
  | "PRO"
  | "ENTERPRISE";

export type FinatyxPlanDefinition = {
  code: FinatyxPlanCode;
  name: string;
  description: string;
  billingInterval: "MONTHLY" | "QUARTERLY" | "YEARLY";
  basePrice: string;
  currencyCode: string;
  trialDays: number;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "ARCHIVED";
};

export type FinatyxPlanEntitlementValue =
  | {
      featureCode: string;
      booleanValue: boolean;
      integerValue?: never;
      decimalValue?: never;
      textValue?: never;
    }
  | {
      featureCode: string;
      booleanValue?: never;
      integerValue: number;
      decimalValue?: never;
      textValue?: never;
    }
  | {
      featureCode: string;
      booleanValue?: never;
      integerValue?: never;
      decimalValue: string;
      textValue?: never;
    }
  | {
      featureCode: string;
      booleanValue?: never;
      integerValue?: never;
      decimalValue?: never;
      textValue: string;
    };

export type FinatyxPlanCatalogueEntry = {
  plan: FinatyxPlanDefinition;
  entitlements: readonly FinatyxPlanEntitlementValue[];
};

const booleanFeature = (
  featureCode: string,
  enabled: boolean
): FinatyxPlanEntitlementValue => ({
  featureCode,
  booleanValue: enabled,
});

const integerFeature = (
  featureCode: string,
  limit: number
): FinatyxPlanEntitlementValue => ({
  featureCode,
  integerValue: limit,
});

/**
 * Finatyx subscription plan catalogue.
 *
 * Important:
 * - Plans are cumulative from Starter -> Growth -> Pro -> Enterprise.
 * - Pricing is intentionally set to 0 during the technical bootstrap.
 * - Commercial pricing can be introduced later without changing feature codes.
 * - Every plan receives an explicit entitlement for every platform feature.
 *   This makes plan behavior deterministic and avoids accidental inheritance.
 */

const STARTER_ENTITLEMENTS: readonly FinatyxPlanEntitlementValue[] = [
  booleanFeature("crm.enabled", true),
  booleanFeature("sales.enabled", true),
  booleanFeature("purchasing.enabled", false),
  booleanFeature("inventory.enabled", false),
  booleanFeature("banking.enabled", false),
  booleanFeature("accounting.enabled", false),
  booleanFeature("expenses.enabled", true),
  booleanFeature("payroll.enabled", false),
  booleanFeature("tax.enabled", false),
  booleanFeature("projects.enabled", false),
  booleanFeature("approvals.enabled", false),
  booleanFeature("documents.enabled", true),
  booleanFeature("communications.enabled", true),

  booleanFeature("reports.standard", true),
  booleanFeature("reports.advanced", false),
  booleanFeature("reports.data_export", false),

  booleanFeature("ai.copilot", true),
  booleanFeature("ai.tool_execution", false),
  integerFeature("ai.monthly_actions", 25),

  integerFeature("limits.users", 3),
  integerFeature("limits.branches", 1),
  integerFeature("limits.warehouses", 1),
  integerFeature("limits.monthly_documents", 250),
  integerFeature("limits.storage_gb", 2),

  booleanFeature("sales.recurring_invoices", false),
  booleanFeature("inventory.stock_transfers", false),
  booleanFeature("banking.reconciliation", false),
  booleanFeature("customization.custom_fields", false),
  booleanFeature("finance.exchange_rates", false),
  booleanFeature("audit.advanced", false),
  booleanFeature("multi_branch.enabled", false),
];

const GROWTH_ENTITLEMENTS: readonly FinatyxPlanEntitlementValue[] = [
  booleanFeature("crm.enabled", true),
  booleanFeature("sales.enabled", true),
  booleanFeature("purchasing.enabled", true),
  booleanFeature("inventory.enabled", true),
  booleanFeature("banking.enabled", true),
  booleanFeature("accounting.enabled", true),
  booleanFeature("expenses.enabled", true),
  booleanFeature("payroll.enabled", false),
  booleanFeature("tax.enabled", true),
  booleanFeature("projects.enabled", false),
  booleanFeature("approvals.enabled", false),
  booleanFeature("documents.enabled", true),
  booleanFeature("communications.enabled", true),

  booleanFeature("reports.standard", true),
  booleanFeature("reports.advanced", false),
  booleanFeature("reports.data_export", true),

  booleanFeature("ai.copilot", true),
  booleanFeature("ai.tool_execution", false),
  integerFeature("ai.monthly_actions", 250),

  integerFeature("limits.users", 10),
  integerFeature("limits.branches", 1),
  integerFeature("limits.warehouses", 3),
  integerFeature("limits.monthly_documents", 2000),
  integerFeature("limits.storage_gb", 10),

  booleanFeature("sales.recurring_invoices", true),
  booleanFeature("inventory.stock_transfers", false),
  booleanFeature("banking.reconciliation", true),
  booleanFeature("customization.custom_fields", false),
  booleanFeature("finance.exchange_rates", false),
  booleanFeature("audit.advanced", false),
  booleanFeature("multi_branch.enabled", false),
];

const PRO_ENTITLEMENTS: readonly FinatyxPlanEntitlementValue[] = [
  booleanFeature("crm.enabled", true),
  booleanFeature("sales.enabled", true),
  booleanFeature("purchasing.enabled", true),
  booleanFeature("inventory.enabled", true),
  booleanFeature("banking.enabled", true),
  booleanFeature("accounting.enabled", true),
  booleanFeature("expenses.enabled", true),
  booleanFeature("payroll.enabled", true),
  booleanFeature("tax.enabled", true),
  booleanFeature("projects.enabled", true),
  booleanFeature("approvals.enabled", true),
  booleanFeature("documents.enabled", true),
  booleanFeature("communications.enabled", true),

  booleanFeature("reports.standard", true),
  booleanFeature("reports.advanced", true),
  booleanFeature("reports.data_export", true),

  booleanFeature("ai.copilot", true),
  booleanFeature("ai.tool_execution", true),
  integerFeature("ai.monthly_actions", 2000),

  integerFeature("limits.users", 30),
  integerFeature("limits.branches", 5),
  integerFeature("limits.warehouses", 10),
  integerFeature("limits.monthly_documents", 10000),
  integerFeature("limits.storage_gb", 50),

  booleanFeature("sales.recurring_invoices", true),
  booleanFeature("inventory.stock_transfers", true),
  booleanFeature("banking.reconciliation", true),
  booleanFeature("customization.custom_fields", true),
  booleanFeature("finance.exchange_rates", true),
  booleanFeature("audit.advanced", true),
  booleanFeature("multi_branch.enabled", true),
];

const ENTERPRISE_ENTITLEMENTS: readonly FinatyxPlanEntitlementValue[] = [
  booleanFeature("crm.enabled", true),
  booleanFeature("sales.enabled", true),
  booleanFeature("purchasing.enabled", true),
  booleanFeature("inventory.enabled", true),
  booleanFeature("banking.enabled", true),
  booleanFeature("accounting.enabled", true),
  booleanFeature("expenses.enabled", true),
  booleanFeature("payroll.enabled", true),
  booleanFeature("tax.enabled", true),
  booleanFeature("projects.enabled", true),
  booleanFeature("approvals.enabled", true),
  booleanFeature("documents.enabled", true),
  booleanFeature("communications.enabled", true),

  booleanFeature("reports.standard", true),
  booleanFeature("reports.advanced", true),
  booleanFeature("reports.data_export", true),

  booleanFeature("ai.copilot", true),
  booleanFeature("ai.tool_execution", true),
  integerFeature("ai.monthly_actions", 20000),

  integerFeature("limits.users", 100),
  integerFeature("limits.branches", 25),
  integerFeature("limits.warehouses", 50),
  integerFeature("limits.monthly_documents", 100000),
  integerFeature("limits.storage_gb", 250),

  booleanFeature("sales.recurring_invoices", true),
  booleanFeature("inventory.stock_transfers", true),
  booleanFeature("banking.reconciliation", true),
  booleanFeature("customization.custom_fields", true),
  booleanFeature("finance.exchange_rates", true),
  booleanFeature("audit.advanced", true),
  booleanFeature("multi_branch.enabled", true),
];

export const FINATYX_PLAN_CATALOGUE: readonly FinatyxPlanCatalogueEntry[] = [
  {
    plan: {
      code: "STARTER",
      name: "Starter",
      description:
        "Essential Finatyx capabilities for small businesses beginning their digital operations.",
      billingInterval: "MONTHLY",
      basePrice: "0.0000",
      currencyCode: "USD",
      trialDays: 14,
      status: "ACTIVE",
    },
    entitlements: STARTER_ENTITLEMENTS,
  },
  {
    plan: {
      code: "GROWTH",
      name: "Growth",
      description:
        "Expanded operational capabilities for growing SMEs managing purchasing, inventory, banking, accounting, and tax.",
      billingInterval: "MONTHLY",
      basePrice: "0.0000",
      currencyCode: "USD",
      trialDays: 14,
      status: "ACTIVE",
    },
    entitlements: GROWTH_ENTITLEMENTS,
  },
  {
    plan: {
      code: "PRO",
      name: "Pro",
      description:
        "Advanced Finatyx operations for established SMEs requiring payroll, projects, approvals, advanced reporting, automation, and multi-branch capabilities.",
      billingInterval: "MONTHLY",
      basePrice: "0.0000",
      currencyCode: "USD",
      trialDays: 14,
      status: "ACTIVE",
    },
    entitlements: PRO_ENTITLEMENTS,
  },
  {
    plan: {
      code: "ENTERPRISE",
      name: "Enterprise",
      description:
        "Comprehensive Finatyx capabilities and higher operating limits for larger and multi-branch organizations.",
      billingInterval: "MONTHLY",
      basePrice: "0.0000",
      currencyCode: "USD",
      trialDays: 14,
      status: "ACTIVE",
    },
    entitlements: ENTERPRISE_ENTITLEMENTS,
  },
] as const;
