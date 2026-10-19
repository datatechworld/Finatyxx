import { readFileSync, writeFileSync } from "node:fs";

const schemaPath = "prisma/schema.prisma";

let schema = readFileSync(schemaPath, "utf8");

function replaceExactlyOnce(
  label: string,
  search: string,
  replacement: string,
): void {
  const first = schema.indexOf(search);

  if (first === -1) {
    throw new Error(
      `${label}: expected source block was not found. No schema file was written.`,
    );
  }

  const second = schema.indexOf(search, first + search.length);

  if (second !== -1) {
    throw new Error(
      `${label}: expected source block occurs more than once. No schema file was written.`,
    );
  }

  schema =
    schema.slice(0, first) +
    replacement +
    schema.slice(first + search.length);

  console.log(`PASS | ${label}`);
}

console.log("Finatyx — Accounting Architecture Schema Transformation");
console.log("=======================================================");
console.log("Target: prisma/schema.prisma\n");

/*
 * 1. Add accounting architecture enums immediately before AccountType.
 */

replaceExactlyOnce(
  "Add AccountingFramework and SystemAccountPurpose enums",
  `enum AccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}`,
  `enum AccountingFramework {
  IFRS_FOR_SMES
  FULL_IFRS
  LOCAL_GAAP
}

enum SystemAccountPurpose {
  ACCOUNTS_RECEIVABLE
  ACCOUNTS_PAYABLE
  SALES_REVENUE
  SALES_RETURNS
  SALES_DISCOUNTS
  INVENTORY
  COST_OF_GOODS_SOLD
  INPUT_TAX
  OUTPUT_TAX
  TAX_PAYABLE
  CASH
  BANK
  PAYROLL_PAYABLE
  SALARY_EXPENSE
  RETAINED_EARNINGS
  FX_GAIN
  FX_LOSS
}

enum AccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}`,
);

/*
 * 2. Add AccountingProfile and SystemAccountMapping before Account.
 */

replaceExactlyOnce(
  "Add AccountingProfile and SystemAccountMapping models",
  `model Account {
`,
  `model AccountingProfile {
  tenantId         String              @id @db.Uuid
  framework        AccountingFramework
  frameworkEdition String              @db.VarChar(40)
  effectiveFrom    DateTime            @db.Date
  createdAt        DateTime            @default(now()) @db.Timestamptz(6)
  updatedAt        DateTime            @updatedAt @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@map("accounting_profiles")
}

model SystemAccountMapping {
  id        String               @id @default(uuid()) @db.Uuid
  tenantId  String               @db.Uuid
  purpose   SystemAccountPurpose
  accountId String               @db.Uuid
  createdAt DateTime             @default(now()) @db.Timestamptz(6)
  updatedAt DateTime             @updatedAt @db.Timestamptz(6)

  tenant  Tenant  @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  account Account @relation(fields: [tenantId, accountId], references: [tenantId, id], onDelete: Restrict)

  @@unique([tenantId, purpose])
  @@unique([tenantId, id])
  @@index([tenantId, accountId])
  @@map("system_account_mappings")
}

model Account {
`,
);

/*
 * 3. Add Tenant inverse relations.
 */

replaceExactlyOnce(
  "Add Tenant accounting architecture relations",
  `  accountingSettings AccountingSettings?
  journals           JournalEntry[]
  financialAccounts  FinancialAccount[]`,
  `  accountingSettings     AccountingSettings?
  accountingProfile      AccountingProfile?
  systemAccountMappings  SystemAccountMapping[]
  journals               JournalEntry[]
  financialAccounts      FinancialAccount[]`,
);

/*
 * 4. Add Account inverse relation.
 */

replaceExactlyOnce(
  "Add Account system-account mapping relation",
  `  journalLines JournalLine[]

  receivablesSettings`,
  `  journalLines          JournalLine[]
  systemAccountMappings SystemAccountMapping[]

  receivablesSettings`,
);

/*
 * 5. Add Branch inverse journal relation.
 */

replaceExactlyOnce(
  "Add Branch journal relation",
  `  financialAccounts FinancialAccount[]
  stockMovements    StockMovement[]
  membershipAccess  MembershipBranchAccess[]`,
  `  financialAccounts FinancialAccount[]
  stockMovements    StockMovement[]
  membershipAccess  MembershipBranchAccess[]
  journalEntries    JournalEntry[]`,
);

/*
 * 6. Add Customer inverse journal relation.
 */

replaceExactlyOnce(
  "Add Customer journal-line relation",
  `  recurringInvoiceTemplates RecurringInvoiceTemplate[]

  @@unique([tenantId, customerCode])`,
  `  recurringInvoiceTemplates RecurringInvoiceTemplate[]
  journalLines              JournalLine[]

  @@unique([tenantId, customerCode])`,
);

/*
 * 7. Add Supplier inverse journal relation.
 */

replaceExactlyOnce(
  "Add Supplier journal-line relation",
  `  purchaseRequests PurchaseRequest[]
  ledgerEntries    SupplierLedgerEntry[]

  @@unique([tenantId, supplierCode])`,
  `  purchaseRequests PurchaseRequest[]
  ledgerEntries    SupplierLedgerEntry[]
  journalLines     JournalLine[]

  @@unique([tenantId, supplierCode])`,
);

/*
 * 8. Add Employee inverse journal relation.
 */

replaceExactlyOnce(
  "Add Employee journal-line relation",
  `  payrollComponents PayrollEntryComponent[]
  payslips          Payslip[]

  @@unique([tenantId, employeeNumber])`,
  `  payrollComponents PayrollEntryComponent[]
  payslips          Payslip[]
  journalLines      JournalLine[]

  @@unique([tenantId, employeeNumber])`,
);

/*
 * 9. Add Project inverse journal relation.
 */

replaceExactlyOnce(
  "Add Project journal-line relation",
  `  tasks         ProjectTask[]
  expenses      ProjectExpense[]

  @@unique([tenantId, projectCode])`,
  `  tasks         ProjectTask[]
  expenses      ProjectExpense[]
  journalLines  JournalLine[]

  @@unique([tenantId, projectCode])`,
);

/*
 * 10. Add JournalEntry -> Branch tenant-safe relation.
 */

replaceExactlyOnce(
  "Add JournalEntry branch relation",
  `  tenant     Tenant        @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  lines      JournalLine[]
  reversalOf JournalEntry? @relation("JournalEntryReversal", fields: [tenantId, reversalOfId], references: [tenantId, id], onDelete: Restrict)`,
  `  tenant     Tenant        @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  branch     Branch?       @relation(fields: [tenantId, branchId], references: [tenantId, id], onDelete: Restrict)
  lines      JournalLine[]
  reversalOf JournalEntry? @relation("JournalEntryReversal", fields: [tenantId, reversalOfId], references: [tenantId, id], onDelete: Restrict)`,
);

/*
 * 11. Add JournalLine tenant-safe dimension relations.
 */

replaceExactlyOnce(
  "Add JournalLine dimension relations",
  `  journal        JournalEntry @relation(fields: [tenantId, journalEntryId], references: [tenantId, id], onDelete: Restrict)
  account        Account      @relation(fields: [tenantId, accountId], references: [tenantId, id], onDelete: Restrict)

  @@index([tenantId, accountId])
  @@index([tenantId, journalEntryId])
  @@index([tenantId, customerId])
  @@index([tenantId, supplierId])`,
  `  journal        JournalEntry @relation(fields: [tenantId, journalEntryId], references: [tenantId, id], onDelete: Restrict)
  account        Account      @relation(fields: [tenantId, accountId], references: [tenantId, id], onDelete: Restrict)
  customer       Customer?    @relation(fields: [tenantId, customerId], references: [tenantId, id], onDelete: Restrict)
  supplier       Supplier?    @relation(fields: [tenantId, supplierId], references: [tenantId, id], onDelete: Restrict)
  employee       Employee?    @relation(fields: [tenantId, employeeId], references: [tenantId, id], onDelete: Restrict)
  project        Project?     @relation(fields: [tenantId, projectId], references: [tenantId, id], onDelete: Restrict)

  @@index([tenantId, accountId])
  @@index([tenantId, journalEntryId])
  @@index([tenantId, customerId])
  @@index([tenantId, supplierId])
  @@index([tenantId, employeeId])
  @@index([tenantId, projectId])`,
);

/*
 * Final sanity checks before writing.
 */

const requiredMarkers = [
  "enum AccountingFramework",
  "enum SystemAccountPurpose",
  "model AccountingProfile",
  "model SystemAccountMapping",
  "accountingProfile      AccountingProfile?",
  "systemAccountMappings  SystemAccountMapping[]",
  "branch     Branch?       @relation(fields: [tenantId, branchId]",,
  "customer       Customer?    @relation(fields: [tenantId, customerId]",
  "supplier       Supplier?    @relation(fields: [tenantId, supplierId]",
  "employee       Employee?    @relation(fields: [tenantId, employeeId]",
  "project        Project?     @relation(fields: [tenantId, projectId]",
];

for (const marker of requiredMarkers) {
  if (!schema.includes(marker)) {
    throw new Error(
      `Final validation failed: missing marker "${marker}". No schema file was written.`,
    );
  }
}

writeFileSync(schemaPath, schema, {
  encoding: "utf8",
});

console.log("");
console.log("SCHEMA TRANSFORMATION COMPLETE.");
console.log("prisma/schema.prisma was written as UTF-8 without BOM.");
console.log("No database migration has been created or deployed.");