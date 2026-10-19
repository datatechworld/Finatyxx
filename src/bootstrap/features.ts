export type FinatyxFeatureValueType =
  | "BOOLEAN"
  | "INTEGER"
  | "DECIMAL"
  | "TEXT";

export type FinatyxFeatureDefinition = {
  code: string;
  name: string;
  module: string;
  description: string;
  valueType: FinatyxFeatureValueType;
};

/**
 * Finatyx commercial feature catalogue.
 *
 * Features answer:
 * "Does this tenant's subscription include this capability,
 *  and what commercial limit applies?"
 *
 * They are intentionally broader than RBAC permissions.
 */
export const FINATYX_FEATURES: readonly FinatyxFeatureDefinition[] = [
  // ---------------------------------------------------------------------------
  // Core business capabilities
  // ---------------------------------------------------------------------------

  {
    code: "crm.enabled",
    name: "Customer Relationship Management",
    module: "crm",
    description:
      "Enables customer records, customer groups, and CRM functionality.",
    valueType: "BOOLEAN",
  },
  {
    code: "sales.enabled",
    name: "Sales & Invoicing",
    module: "sales",
    description:
      "Enables quotations, invoices, customer payments, delivery notes, and credit notes.",
    valueType: "BOOLEAN",
  },
  {
    code: "purchasing.enabled",
    name: "Purchasing",
    module: "purchasing",
    description:
      "Enables suppliers, purchase requests, purchase orders, goods receipts, supplier bills, and supplier payments.",
    valueType: "BOOLEAN",
  },
  {
    code: "inventory.enabled",
    name: "Inventory Management",
    module: "inventory",
    description:
      "Enables products, warehouses, stock balances, stock movements, stock counts, and price lists.",
    valueType: "BOOLEAN",
  },
  {
    code: "banking.enabled",
    name: "Banking & Treasury",
    module: "banking",
    description:
      "Enables financial accounts, banking transactions, treasury operations, and loan management.",
    valueType: "BOOLEAN",
  },
  {
    code: "accounting.enabled",
    name: "Accounting",
    module: "accounting",
    description:
      "Enables chart of accounts, fiscal periods, journals, ledgers, and accounting operations.",
    valueType: "BOOLEAN",
  },
  {
    code: "expenses.enabled",
    name: "Expense Management",
    module: "expenses",
    description:
      "Enables expense recording, approval, posting, and expense categories.",
    valueType: "BOOLEAN",
  },
  {
    code: "payroll.enabled",
    name: "Payroll",
    module: "payroll",
    description:
      "Enables employees, salary structures, payroll processing, and payslips.",
    valueType: "BOOLEAN",
  },
  {
    code: "tax.enabled",
    name: "Tax Management",
    module: "tax",
    description:
      "Enables tax rates, tax transactions, and tenant tax configuration.",
    valueType: "BOOLEAN",
  },
  {
    code: "projects.enabled",
    name: "Project Management",
    module: "projects",
    description:
      "Enables projects, project tasks, and project expense tracking.",
    valueType: "BOOLEAN",
  },
  {
    code: "approvals.enabled",
    name: "Approval Workflows",
    module: "approvals",
    description:
      "Enables configurable business approval workflows and approval requests.",
    valueType: "BOOLEAN",
  },
  {
    code: "documents.enabled",
    name: "Document Management",
    module: "documents",
    description:
      "Enables tenant document upload, storage, linking, download, and management.",
    valueType: "BOOLEAN",
  },
  {
    code: "communications.enabled",
    name: "Business Communications",
    module: "communications",
    description:
      "Enables authorized tenant notifications and communication settings.",
    valueType: "BOOLEAN",
  },

  // ---------------------------------------------------------------------------
  // Reporting
  // ---------------------------------------------------------------------------

  {
    code: "reports.standard",
    name: "Standard Reporting",
    module: "reports",
    description:
      "Enables standard operational and financial reports.",
    valueType: "BOOLEAN",
  },
  {
    code: "reports.advanced",
    name: "Advanced Reporting",
    module: "reports",
    description:
      "Enables advanced analytics and cross-module business intelligence.",
    valueType: "BOOLEAN",
  },
  {
    code: "reports.data_export",
    name: "Report Data Export",
    module: "reports",
    description:
      "Enables export of authorized report data.",
    valueType: "BOOLEAN",
  },

  // ---------------------------------------------------------------------------
  // AI / Finatyx Copilot
  // ---------------------------------------------------------------------------

  {
    code: "ai.copilot",
    name: "Finatyx Copilot",
    module: "ai",
    description:
      "Enables access to the Finatyx AI Copilot.",
    valueType: "BOOLEAN",
  },
  {
    code: "ai.tool_execution",
    name: "AI Tool Execution",
    module: "ai",
    description:
      "Allows Finatyx Copilot to execute authorized Finatyx business tools.",
    valueType: "BOOLEAN",
  },
  {
    code: "ai.monthly_actions",
    name: "Monthly AI Actions",
    module: "ai",
    description:
      "Maximum number of metered Finatyx AI actions available per billing period.",
    valueType: "INTEGER",
  },

  // ---------------------------------------------------------------------------
  // Commercial scale limits
  // ---------------------------------------------------------------------------

  {
    code: "limits.users",
    name: "User Limit",
    module: "limits",
    description:
      "Maximum number of active tenant users supported by the subscription.",
    valueType: "INTEGER",
  },
  {
    code: "limits.branches",
    name: "Branch Limit",
    module: "limits",
    description:
      "Maximum number of active business branches supported by the subscription.",
    valueType: "INTEGER",
  },
  {
    code: "limits.warehouses",
    name: "Warehouse Limit",
    module: "limits",
    description:
      "Maximum number of active warehouses supported by the subscription.",
    valueType: "INTEGER",
  },
  {
    code: "limits.monthly_documents",
    name: "Monthly Document Limit",
    module: "limits",
    description:
      "Maximum number of metered business documents supported per billing period.",
    valueType: "INTEGER",
  },
  {
    code: "limits.storage_gb",
    name: "Storage Limit",
    module: "limits",
    description:
      "Maximum tenant document storage allocation in gigabytes.",
    valueType: "INTEGER",
  },

  // ---------------------------------------------------------------------------
  // Advanced capabilities
  // ---------------------------------------------------------------------------

  {
    code: "sales.recurring_invoices",
    name: "Recurring Invoices",
    module: "sales",
    description:
      "Enables recurring invoice templates and automated recurring invoicing.",
    valueType: "BOOLEAN",
  },
  {
    code: "inventory.stock_transfers",
    name: "Stock Transfers",
    module: "inventory",
    description:
      "Enables controlled stock transfers between warehouses and branches.",
    valueType: "BOOLEAN",
  },
  {
    code: "banking.reconciliation",
    name: "Bank Reconciliation",
    module: "banking",
    description:
      "Enables bank reconciliation workflows and transaction matching.",
    valueType: "BOOLEAN",
  },
  {
    code: "customization.custom_fields",
    name: "Custom Fields",
    module: "customization",
    description:
      "Enables tenant-defined custom fields on supported Finatyx entities.",
    valueType: "BOOLEAN",
  },
  {
    code: "finance.exchange_rates",
    name: "Exchange Rate Management",
    module: "finance",
    description:
      "Enables authorized management of currency exchange rates.",
    valueType: "BOOLEAN",
  },
  {
    code: "audit.advanced",
    name: "Advanced Audit",
    module: "audit",
    description:
      "Enables advanced tenant audit and activity visibility.",
    valueType: "BOOLEAN",
  },
  {
    code: "multi_branch.enabled",
    name: "Multi-Branch Operations",
    module: "admin",
    description:
      "Enables operation of more than one business branch.",
    valueType: "BOOLEAN",
  },
] as const;
