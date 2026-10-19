-- Finatyx Migration #9: Accounting Architecture Foundation
--
-- Checkpoint 15M
-- Purpose:
--   1. Add accounting framework/profile support.
--   2. Add extensible system-account mappings.
--   3. Enforce tenant-safe General Ledger dimensions.
--   4. Apply Finatyx RLS/security posture to the two new tenant-owned tables.
--
-- IMPORTANT:
--   This migration intentionally excludes the three known Prisma drift operations:
--     - DROP INDEX "document_sequences_scope_uidx"
--     - journal_entries reversal foreign-key rename
--     - journal_entries reversal unique-index rename
--
-- Preconditions:
--   - Migrations #1 through #8 are applied.
--   - Checkpoint 15K preflight verified zero invalid/cross-tenant references for
--     JournalEntry.branchId and JournalLine customer/supplier/employee/project IDs.

-- ============================================================
-- 1. ACCOUNTING ARCHITECTURE ENUMS
-- ============================================================

CREATE TYPE "AccountingFramework" AS ENUM (
  'IFRS_FOR_SMES',
  'FULL_IFRS',
  'LOCAL_GAAP'
);

CREATE TYPE "SystemAccountPurpose" AS ENUM (
  'ACCOUNTS_RECEIVABLE',
  'ACCOUNTS_PAYABLE',
  'SALES_REVENUE',
  'SALES_RETURNS',
  'SALES_DISCOUNTS',
  'INVENTORY',
  'COST_OF_GOODS_SOLD',
  'INPUT_TAX',
  'OUTPUT_TAX',
  'TAX_PAYABLE',
  'CASH',
  'BANK',
  'PAYROLL_PAYABLE',
  'SALARY_EXPENSE',
  'RETAINED_EARNINGS',
  'FX_GAIN',
  'FX_LOSS'
);

-- ============================================================
-- 2. ACCOUNTING PROFILE
-- ============================================================

CREATE TABLE "accounting_profiles" (
  "tenantId" UUID NOT NULL,
  "framework" "AccountingFramework" NOT NULL,
  "frameworkEdition" VARCHAR(40) NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "accounting_profiles_pkey" PRIMARY KEY ("tenantId")
);

-- ============================================================
-- 3. SYSTEM ACCOUNT MAPPINGS
-- ============================================================

CREATE TABLE "system_account_mappings" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "purpose" "SystemAccountPurpose" NOT NULL,
  "accountId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "system_account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_account_mappings_tenantId_accountId_idx"
  ON "system_account_mappings"("tenantId", "accountId");

CREATE UNIQUE INDEX "system_account_mappings_tenantId_purpose_key"
  ON "system_account_mappings"("tenantId", "purpose");

CREATE UNIQUE INDEX "system_account_mappings_tenantId_id_key"
  ON "system_account_mappings"("tenantId", "id");

-- ============================================================
-- 4. JOURNAL-LINE DIMENSION INDEXES
-- ============================================================

CREATE INDEX "journal_lines_tenantId_employeeId_idx"
  ON "journal_lines"("tenantId", "employeeId");

CREATE INDEX "journal_lines_tenantId_projectId_idx"
  ON "journal_lines"("tenantId", "projectId");

-- ============================================================
-- 5. ACCOUNTING PROFILE / SYSTEM ACCOUNT FOREIGN KEYS
-- ============================================================

ALTER TABLE "accounting_profiles"
  ADD CONSTRAINT "accounting_profiles_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "tenants"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "system_account_mappings"
  ADD CONSTRAINT "system_account_mappings_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "tenants"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "system_account_mappings"
  ADD CONSTRAINT "system_account_mappings_tenantId_accountId_fkey"
  FOREIGN KEY ("tenantId", "accountId")
  REFERENCES "accounts"("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- ============================================================
-- 6. TENANT-SAFE GENERAL LEDGER DIMENSIONS
-- ============================================================

ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_tenantId_branchId_fkey"
  FOREIGN KEY ("tenantId", "branchId")
  REFERENCES "branches"("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_tenantId_customerId_fkey"
  FOREIGN KEY ("tenantId", "customerId")
  REFERENCES "customers"("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_tenantId_supplierId_fkey"
  FOREIGN KEY ("tenantId", "supplierId")
  REFERENCES "suppliers"("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_tenantId_employeeId_fkey"
  FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "employees"("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_tenantId_projectId_fkey"
  FOREIGN KEY ("tenantId", "projectId")
  REFERENCES "projects"("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- ============================================================
-- 7. RLS / DATA-API SECURITY FOR NEW TENANT TABLES
-- ============================================================
-- Matches the established Finatyx hardening model:
-- authenticated browser/Data API access has tenant-isolated SELECT policy only;
-- no INSERT/UPDATE/DELETE policies are created.

ALTER TABLE public.accounting_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounting_profiles_tenant_select
  ON public.accounting_profiles
  FOR SELECT TO authenticated
  USING (public.is_active_tenant_member("tenantId"));

CREATE POLICY system_account_mappings_tenant_select
  ON public.system_account_mappings
  FOR SELECT TO authenticated
  USING (public.is_active_tenant_member("tenantId"));

-- Preserve the currently verified browser-role posture even if default
-- privileges change later. Policies remain defense-in-depth.
REVOKE ALL ON TABLE public.accounting_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.system_account_mappings FROM anon, authenticated;

-- ============================================================
-- 8. SECURITY / DESIGN NOTES
-- ============================================================
-- No INSERT/UPDATE/DELETE RLS policies are created.
-- RLS is not forced, matching the existing Finatyx database-hardening posture.
-- Server-side Finatyx domain services remain responsible for RBAC, branch scope,
-- entitlements, approvals, posting invariants and transactional writes.
