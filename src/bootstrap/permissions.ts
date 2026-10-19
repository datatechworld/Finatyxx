export type FinatyxPermissionDefinition = {
  code: string;
  module: string;
  resource: string;
  action: string;
  description: string;
};

function permission(
  module: string,
  resource: string,
  action: string,
  description: string
): FinatyxPermissionDefinition {
  return {
    code: `${module}.${resource}.${action}`,
    module,
    resource,
    action,
    description,
  };
}

/**
 * Finatyx platform permission catalogue.
 *
 * Principles:
 *
 * 1. Permissions describe business capabilities, not database tables.
 * 2. Sensitive workflow transitions have dedicated permissions.
 * 3. Creating a transaction does not automatically grant approval,
 *    posting, reversal, reconciliation, or payment authority.
 * 4. Permissions are global platform reference data.
 * 5. Roles remain tenant-specific and receive permissions through
 *    RolePermission.
 */
export const FINATYX_PERMISSIONS: readonly FinatyxPermissionDefinition[] = [
  // ---------------------------------------------------------------------------
  // Administration
  // ---------------------------------------------------------------------------

  permission("admin", "business", "read", "View business profile and configuration."),
  permission("admin", "business", "update", "Update business profile and configuration."),

  permission("admin", "members", "read", "View business members."),
  permission("admin", "members", "invite", "Invite users to the business."),
  permission("admin", "members", "update", "Update business memberships."),
  permission("admin", "members", "remove", "Remove users from the business."),

  permission("admin", "roles", "read", "View roles and their assigned permissions."),
  permission("admin", "roles", "create", "Create tenant roles."),
  permission("admin", "roles", "update", "Update tenant roles."),
  permission("admin", "roles", "delete", "Delete eligible tenant roles."),
  permission("admin", "roles", "assign", "Assign roles to business members."),

  permission("admin", "branches", "read", "View branches."),
  permission("admin", "branches", "create", "Create branches."),
  permission("admin", "branches", "update", "Update branches."),
  permission("admin", "branches", "archive", "Archive or deactivate branches."),
  permission("admin", "branches", "assign", "Manage member branch access."),

  permission("admin", "departments", "read", "View departments."),
  permission("admin", "departments", "create", "Create departments."),
  permission("admin", "departments", "update", "Update departments."),
  permission("admin", "departments", "archive", "Archive or deactivate departments."),

  permission("admin", "settings", "read", "View tenant settings."),
  permission("admin", "settings", "manage", "Manage tenant settings."),

  permission("admin", "document_sequences", "read", "View document numbering sequences."),
  permission("admin", "document_sequences", "manage", "Manage document numbering sequences."),

  // ---------------------------------------------------------------------------
  // CRM
  // ---------------------------------------------------------------------------

  permission("crm", "customers", "read", "View customers."),
  permission("crm", "customers", "create", "Create customers."),
  permission("crm", "customers", "update", "Update customers."),
  permission("crm", "customers", "archive", "Archive or deactivate customers."),
  permission("crm", "customers", "export", "Export customer information."),

  permission("crm", "customer_groups", "read", "View customer groups."),
  permission("crm", "customer_groups", "manage", "Create and maintain customer groups."),

  // ---------------------------------------------------------------------------
  // Sales
  // ---------------------------------------------------------------------------

  permission("sales", "quotations", "read", "View quotations."),
  permission("sales", "quotations", "create", "Create quotations."),
  permission("sales", "quotations", "update", "Update draft quotations."),
  permission("sales", "quotations", "send", "Send quotations to customers."),
  permission("sales", "quotations", "convert", "Convert accepted quotations into downstream sales documents."),
  permission("sales", "quotations", "cancel", "Cancel quotations."),

  permission("sales", "invoices", "read", "View sales invoices."),
  permission("sales", "invoices", "create", "Create sales invoices."),
  permission("sales", "invoices", "update", "Update draft sales invoices."),
  permission("sales", "invoices", "submit", "Submit sales invoices for approval."),
  permission("sales", "invoices", "approve", "Approve sales invoices."),
  permission("sales", "invoices", "post", "Post sales invoices to the accounting ledger."),
  permission("sales", "invoices", "send", "Send sales invoices to customers."),
  permission("sales", "invoices", "cancel", "Cancel eligible sales invoices."),
  permission("sales", "invoices", "void", "Void eligible sales invoices."),

  permission("sales", "payments", "read", "View customer payments."),
  permission("sales", "payments", "create", "Record customer payments."),
  permission("sales", "payments", "post", "Post customer payments."),
  permission("sales", "payments", "allocate", "Allocate customer payments to invoices."),
  permission("sales", "payments", "reverse", "Reverse posted customer payments."),
  permission("sales", "payments", "cancel", "Cancel eligible customer payments."),

  permission("sales", "recurring_invoices", "read", "View recurring invoice templates."),
  permission("sales", "recurring_invoices", "manage", "Create and maintain recurring invoice templates."),

  permission("sales", "delivery_notes", "read", "View delivery notes."),
  permission("sales", "delivery_notes", "create", "Create delivery notes."),
  permission("sales", "delivery_notes", "update", "Update eligible delivery notes."),
  permission("sales", "delivery_notes", "post", "Post or complete delivery notes."),
  permission("sales", "delivery_notes", "cancel", "Cancel eligible delivery notes."),

  permission("sales", "credit_notes", "read", "View credit notes."),
  permission("sales", "credit_notes", "create", "Create credit notes."),
  permission("sales", "credit_notes", "update", "Update draft credit notes."),
  permission("sales", "credit_notes", "submit", "Submit credit notes for approval."),
  permission("sales", "credit_notes", "approve", "Approve credit notes."),
  permission("sales", "credit_notes", "post", "Post credit notes."),
  permission("sales", "credit_notes", "cancel", "Cancel eligible credit notes."),
  permission("sales", "credit_notes", "void", "Void eligible credit notes."),

  // ---------------------------------------------------------------------------
  // Purchasing
  // ---------------------------------------------------------------------------

  permission("purchasing", "suppliers", "read", "View suppliers."),
  permission("purchasing", "suppliers", "create", "Create suppliers."),
  permission("purchasing", "suppliers", "update", "Update suppliers."),
  permission("purchasing", "suppliers", "archive", "Archive or deactivate suppliers."),
  permission("purchasing", "suppliers", "export", "Export supplier information."),

  permission("purchasing", "purchase_requests", "read", "View purchase requests."),
  permission("purchasing", "purchase_requests", "create", "Create purchase requests."),
  permission("purchasing", "purchase_requests", "update", "Update draft purchase requests."),
  permission("purchasing", "purchase_requests", "submit", "Submit purchase requests for approval."),
  permission("purchasing", "purchase_requests", "approve", "Approve purchase requests."),
  permission("purchasing", "purchase_requests", "cancel", "Cancel eligible purchase requests."),

  permission("purchasing", "purchase_orders", "read", "View purchase orders."),
  permission("purchasing", "purchase_orders", "create", "Create purchase orders."),
  permission("purchasing", "purchase_orders", "update", "Update draft purchase orders."),
  permission("purchasing", "purchase_orders", "submit", "Submit purchase orders for approval."),
  permission("purchasing", "purchase_orders", "approve", "Approve purchase orders."),
  permission("purchasing", "purchase_orders", "issue", "Issue approved purchase orders to suppliers."),
  permission("purchasing", "purchase_orders", "close", "Close eligible purchase orders."),
  permission("purchasing", "purchase_orders", "cancel", "Cancel eligible purchase orders."),

  permission("purchasing", "goods_receipts", "read", "View goods receipts."),
  permission("purchasing", "goods_receipts", "create", "Record receipt of purchased goods."),
  permission("purchasing", "goods_receipts", "update", "Update eligible goods receipts."),
  permission("purchasing", "goods_receipts", "post", "Post goods receipts to inventory."),
  permission("purchasing", "goods_receipts", "cancel", "Cancel eligible goods receipts."),

  permission("purchasing", "supplier_bills", "read", "View supplier bills."),
  permission("purchasing", "supplier_bills", "create", "Create supplier bills."),
  permission("purchasing", "supplier_bills", "update", "Update draft supplier bills."),
  permission("purchasing", "supplier_bills", "submit", "Submit supplier bills for approval."),
  permission("purchasing", "supplier_bills", "approve", "Approve supplier bills."),
  permission("purchasing", "supplier_bills", "post", "Post supplier bills to accounting."),
  permission("purchasing", "supplier_bills", "cancel", "Cancel eligible supplier bills."),
  permission("purchasing", "supplier_bills", "void", "Void eligible supplier bills."),

  permission("purchasing", "supplier_payments", "read", "View supplier payments."),
  permission("purchasing", "supplier_payments", "create", "Record supplier payments."),
  permission("purchasing", "supplier_payments", "post", "Post supplier payments."),
  permission("purchasing", "supplier_payments", "allocate", "Allocate supplier payments to bills."),
  permission("purchasing", "supplier_payments", "reverse", "Reverse posted supplier payments."),
  permission("purchasing", "supplier_payments", "cancel", "Cancel eligible supplier payments."),

  // ---------------------------------------------------------------------------
  // Inventory
  // ---------------------------------------------------------------------------

  permission("inventory", "products", "read", "View products and services."),
  permission("inventory", "products", "create", "Create products and services."),
  permission("inventory", "products", "update", "Update products and services."),
  permission("inventory", "products", "archive", "Archive or deactivate products and services."),

  permission("inventory", "categories", "read", "View product categories."),
  permission("inventory", "categories", "manage", "Create and maintain product categories."),

  permission("inventory", "units", "read", "View units of measure."),
  permission("inventory", "units", "manage", "Create and maintain units and conversions."),

  permission("inventory", "warehouses", "read", "View warehouses."),
  permission("inventory", "warehouses", "create", "Create warehouses."),
  permission("inventory", "warehouses", "update", "Update warehouses."),
  permission("inventory", "warehouses", "archive", "Archive or deactivate warehouses."),

  permission("inventory", "stock", "read", "View stock balances and stock movements."),
  permission("inventory", "stock", "adjust", "Perform authorized stock adjustments."),

  permission("inventory", "transfers", "read", "View stock transfers."),
  permission("inventory", "transfers", "create", "Create stock transfers."),
  permission("inventory", "transfers", "update", "Update draft stock transfers."),
  permission("inventory", "transfers", "submit", "Submit stock transfers for approval."),
  permission("inventory", "transfers", "approve", "Approve stock transfers."),
  permission("inventory", "transfers", "dispatch", "Dispatch approved stock transfers."),
  permission("inventory", "transfers", "receive", "Receive stock transfers."),
  permission("inventory", "transfers", "cancel", "Cancel eligible stock transfers."),

  permission("inventory", "stock_counts", "read", "View stock counts."),
  permission("inventory", "stock_counts", "create", "Create stock counts."),
  permission("inventory", "stock_counts", "update", "Enter and update stock count results."),
  permission("inventory", "stock_counts", "post", "Post approved stock count adjustments."),
  permission("inventory", "stock_counts", "cancel", "Cancel eligible stock counts."),

  permission("inventory", "price_lists", "read", "View price lists."),
  permission("inventory", "price_lists", "manage", "Create and maintain price lists."),

  // ---------------------------------------------------------------------------
  // Banking & Treasury
  // ---------------------------------------------------------------------------

  permission("banking", "accounts", "read", "View cash, bank, mobile money, and other financial accounts."),
  permission("banking", "accounts", "create", "Create financial accounts."),
  permission("banking", "accounts", "update", "Update financial accounts."),
  permission("banking", "accounts", "archive", "Archive eligible financial accounts."),

  permission("banking", "transactions", "read", "View imported and recorded bank transactions."),
  permission("banking", "transactions", "import", "Import bank transactions."),
  permission("banking", "transactions", "match", "Match bank transactions to Finatyx transactions."),
  permission("banking", "transactions", "exclude", "Exclude eligible bank transactions from reconciliation."),

  permission("banking", "reconciliations", "read", "View bank reconciliations."),
  permission("banking", "reconciliations", "create", "Create bank reconciliations."),
  permission("banking", "reconciliations", "update", "Update open bank reconciliations."),
  permission("banking", "reconciliations", "reconcile", "Complete bank reconciliation activities."),

  permission("banking", "loans", "read", "View loans and repayment schedules."),
  permission("banking", "loans", "create", "Create loan records."),
  permission("banking", "loans", "update", "Update eligible loan records."),
  permission("banking", "loans", "manage", "Manage loan lifecycle and repayment schedules."),

  // ---------------------------------------------------------------------------
  // Accounting
  // ---------------------------------------------------------------------------

  permission("accounting", "chart_of_accounts", "read", "View the chart of accounts."),
  permission("accounting", "chart_of_accounts", "create", "Create ledger accounts."),
  permission("accounting", "chart_of_accounts", "update", "Update eligible ledger accounts."),
  permission("accounting", "chart_of_accounts", "archive", "Archive eligible ledger accounts."),

  permission("accounting", "fiscal_years", "read", "View fiscal years and periods."),
  permission("accounting", "fiscal_years", "manage", "Create and maintain fiscal years."),

  permission("accounting", "fiscal_periods", "read", "View fiscal periods."),
  permission("accounting", "fiscal_periods", "lock", "Lock fiscal periods."),
  permission("accounting", "fiscal_periods", "unlock", "Reopen eligible fiscal periods."),
  permission("accounting", "fiscal_periods", "close", "Close fiscal periods."),

  permission("accounting", "journals", "read", "View journal entries."),
  permission("accounting", "journals", "create", "Create journal entries."),
  permission("accounting", "journals", "update", "Update draft journal entries."),
  permission("accounting", "journals", "post", "Post balanced journal entries."),
  permission("accounting", "journals", "reverse", "Reverse posted journal entries."),
  permission("accounting", "journals", "void", "Void eligible journal entries."),

  permission("accounting", "ledgers", "read", "View general and subledger activity."),

  // ---------------------------------------------------------------------------
  // Expenses
  // ---------------------------------------------------------------------------

  permission("expenses", "categories", "read", "View expense categories."),
  permission("expenses", "categories", "manage", "Create and maintain expense categories."),

  permission("expenses", "expenses", "read", "View expenses."),
  permission("expenses", "expenses", "create", "Create expenses."),
  permission("expenses", "expenses", "update", "Update draft expenses."),
  permission("expenses", "expenses", "submit", "Submit expenses for approval."),
  permission("expenses", "expenses", "approve", "Approve expenses."),
  permission("expenses", "expenses", "post", "Post approved expenses."),
  permission("expenses", "expenses", "reject", "Reject submitted expenses."),
  permission("expenses", "expenses", "reverse", "Reverse posted expenses."),
  permission("expenses", "expenses", "cancel", "Cancel eligible expenses."),

  // ---------------------------------------------------------------------------
  // Payroll & Employees
  // ---------------------------------------------------------------------------

  permission("payroll", "employees", "read", "View employee records."),
  permission("payroll", "employees", "create", "Create employee records."),
  permission("payroll", "employees", "update", "Update employee records."),
  permission("payroll", "employees", "archive", "Archive or deactivate employee records."),

  permission("payroll", "salary_structures", "read", "View salary structures and components."),
  permission("payroll", "salary_structures", "manage", "Manage salary structures, components, and assignments."),

  permission("payroll", "runs", "read", "View payroll runs."),
  permission("payroll", "runs", "create", "Create payroll runs."),
  permission("payroll", "runs", "process", "Calculate and process payroll."),
  permission("payroll", "runs", "submit", "Submit payroll for approval."),
  permission("payroll", "runs", "approve", "Approve payroll runs."),
  permission("payroll", "runs", "post", "Post approved payroll to accounting."),
  permission("payroll", "runs", "mark_paid", "Mark approved payroll as paid."),
  permission("payroll", "runs", "cancel", "Cancel eligible payroll runs."),

  permission("payroll", "payslips", "read", "View payslips."),
  permission("payroll", "payslips", "generate", "Generate employee payslips."),
  permission("payroll", "payslips", "send", "Distribute employee payslips."),

  // ---------------------------------------------------------------------------
  // Tax
  // ---------------------------------------------------------------------------

  permission("tax", "rates", "read", "View tax rates and tax components."),
  permission("tax", "rates", "manage", "Create and maintain tax rates and components."),

  permission("tax", "transactions", "read", "View tax transactions."),
  permission("tax", "transactions", "manage", "Manage authorized tax transactions."),

  permission("tax", "settings", "read", "View tax configuration."),
  permission("tax", "settings", "manage", "Manage tenant tax configuration."),

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  permission("projects", "projects", "read", "View projects."),
  permission("projects", "projects", "create", "Create projects."),
  permission("projects", "projects", "update", "Update projects."),
  permission("projects", "projects", "archive", "Archive eligible projects."),

  permission("projects", "tasks", "read", "View project tasks."),
  permission("projects", "tasks", "manage", "Create and maintain project tasks."),

  permission("projects", "expenses", "read", "View project expenses."),
  permission("projects", "expenses", "manage", "Record and maintain project expenses."),

  // ---------------------------------------------------------------------------
  // Approval Workflows
  // ---------------------------------------------------------------------------

  permission("approvals", "workflows", "read", "View approval workflows."),
  permission("approvals", "workflows", "manage", "Create and maintain approval workflows."),

  permission("approvals", "requests", "read", "View approval requests."),
  permission("approvals", "requests", "approve", "Approve assigned approval requests."),
  permission("approvals", "requests", "reject", "Reject assigned approval requests."),
  permission("approvals", "requests", "comment", "Comment on approval requests."),
  permission("approvals", "requests", "cancel", "Cancel eligible approval requests."),

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  permission("documents", "documents", "read", "View tenant documents."),
  permission("documents", "documents", "upload", "Upload documents."),
  permission("documents", "documents", "update", "Update document metadata and links."),
  permission("documents", "documents", "delete", "Delete eligible documents."),
  permission("documents", "documents", "download", "Download documents."),

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

  permission("ai", "assistant", "use", "Use the Finatyx AI Copilot."),
  permission("ai", "conversations", "read", "View permitted AI conversation history."),
  permission("ai", "conversations", "delete", "Delete eligible AI conversations."),
  permission("ai", "tools", "execute", "Allow AI to execute authorized Finatyx tools."),
  permission("ai", "tool_executions", "read", "View AI tool execution history."),
  permission("ai", "settings", "read", "View AI configuration."),
  permission("ai", "settings", "manage", "Manage tenant AI configuration."),

  // ---------------------------------------------------------------------------
  // Communications
  // ---------------------------------------------------------------------------

  permission("communications", "notifications", "read", "View notifications."),
  permission("communications", "notifications", "send", "Send authorized notifications."),
  permission("communications", "settings", "read", "View notification settings."),
  permission("communications", "settings", "manage", "Manage notification settings."),

  // ---------------------------------------------------------------------------
  // Reporting
  // ---------------------------------------------------------------------------

  permission("reports", "sales", "read", "View sales reports."),
  permission("reports", "purchasing", "read", "View purchasing reports."),
  permission("reports", "inventory", "read", "View inventory reports."),
  permission("reports", "accounting", "read", "View accounting and financial reports."),
  permission("reports", "banking", "read", "View banking and treasury reports."),
  permission("reports", "expenses", "read", "View expense reports."),
  permission("reports", "payroll", "read", "View payroll reports."),
  permission("reports", "tax", "read", "View tax reports."),
  permission("reports", "projects", "read", "View project reports."),
  permission("reports", "business", "read", "View cross-module business intelligence reports."),
  permission("reports", "data", "export", "Export authorized report data."),

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  permission("audit", "audit_log", "read", "View tenant audit logs."),
  permission("audit", "activity_log", "read", "View tenant activity logs."),

  // ---------------------------------------------------------------------------
  // Billing, Plans & Entitlements
  // ---------------------------------------------------------------------------

  permission("billing", "subscription", "read", "View the tenant subscription."),
  permission("billing", "subscription", "manage", "Manage the tenant subscription."),
  permission("billing", "payments", "read", "View subscription payment history."),
  permission("billing", "addons", "read", "View available and subscribed add-ons."),
  permission("billing", "addons", "manage", "Manage tenant add-on subscriptions."),
  permission("billing", "usage", "read", "View tenant feature usage."),

  // ---------------------------------------------------------------------------
  // Customization
  // ---------------------------------------------------------------------------

  permission("customization", "custom_fields", "read", "View custom field definitions."),
  permission("customization", "custom_fields", "manage", "Create and maintain custom field definitions."),

  // ---------------------------------------------------------------------------
  // Currency & Exchange Rates
  // ---------------------------------------------------------------------------

  permission("finance", "currencies", "read", "View supported currencies."),
  permission("finance", "exchange_rates", "read", "View exchange rates."),
  permission("finance", "exchange_rates", "manage", "Create and maintain authorized exchange rates."),
] as const;