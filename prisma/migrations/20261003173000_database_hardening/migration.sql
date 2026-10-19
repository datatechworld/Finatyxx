-- Finatyx database hardening v3
-- Target: PostgreSQL / Supabase, after 20261003172433_init
-- Purpose: database integrity, Clerk-aware tenant isolation, and safe Data API read access.
-- Generated for the frozen Finatyx Prisma v3 baseline.

-- ============================================================
-- 1. CORE DATA-INTEGRITY CONSTRAINTS
-- ============================================================

ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_one_side_only_chk
  CHECK (
    (debit > 0 AND credit = 0)
    OR
    (credit > 0 AND debit = 0)
  );

ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_positive_amount_chk CHECK (amount > 0);

ALTER TABLE public.supplier_payment_allocations
  ADD CONSTRAINT supplier_payment_allocations_positive_amount_chk CHECK (amount > 0);

ALTER TABLE public.payments
  ADD CONSTRAINT payments_amounts_chk
  CHECK (amount > 0 AND "unallocatedAmount" >= 0 AND "unallocatedAmount" <= amount);

ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_amounts_chk
  CHECK (amount > 0 AND "unallocatedAmount" >= 0 AND "unallocatedAmount" <= amount);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_totals_chk
  CHECK (
    subtotal >= 0
    AND "discountTotal" >= 0
    AND "taxTotal" >= 0
    AND total >= 0
    AND "amountPaid" >= 0
    AND "balanceDue" >= 0
    AND "amountPaid" <= total
  );

ALTER TABLE public.supplier_bills
  ADD CONSTRAINT supplier_bills_totals_chk
  CHECK (
    subtotal >= 0
    AND "taxTotal" >= 0
    AND total >= 0
    AND "amountPaid" >= 0
    AND "balanceDue" >= 0
    AND "amountPaid" <= total
  );

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_values_chk
  CHECK (quantity > 0 AND "unitCost" >= 0 AND "totalCost" >= 0);

ALTER TABLE public.quotation_items
  ADD CONSTRAINT quotation_items_values_chk
  CHECK (quantity > 0 AND "unitPrice" >= 0 AND "discountAmount" >= 0 AND "taxRate" >= 0 AND "taxAmount" >= 0 AND "lineTotal" >= 0);

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_values_chk
  CHECK (quantity > 0 AND "unitPrice" >= 0 AND "discountPercent" >= 0 AND "discountAmount" >= 0 AND "taxRate" >= 0 AND "taxAmount" >= 0 AND "lineSubtotal" >= 0 AND "lineTotal" >= 0);

ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_values_chk
  CHECK (quantity > 0 AND "unitCost" >= 0 AND "taxRate" >= 0 AND "taxAmount" >= 0 AND "lineTotal" >= 0);

ALTER TABLE public.goods_receipt_items
  ADD CONSTRAINT goods_receipt_items_values_chk CHECK ("quantityReceived" > 0 AND "unitCost" >= 0);

ALTER TABLE public.supplier_bill_items
  ADD CONSTRAINT supplier_bill_items_values_chk
  CHECK (quantity > 0 AND "unitCost" >= 0 AND "taxRate" >= 0 AND "taxAmount" >= 0 AND "lineTotal" >= 0);

ALTER TABLE public.exchange_rates
  ADD CONSTRAINT exchange_rates_positive_rate_chk CHECK (rate > 0);

ALTER TABLE public.product_unit_conversions
  ADD CONSTRAINT product_unit_conversions_positive_factor_chk CHECK (factor > 0);

ALTER TABLE public.price_list_items
  ADD CONSTRAINT price_list_items_values_chk CHECK (price >= 0 AND "minQuantity" > 0);

ALTER TABLE public.tax_rates
  ADD CONSTRAINT tax_rates_nonnegative_rate_chk CHECK (rate >= 0);

ALTER TABLE public.document_sequences
  ADD CONSTRAINT document_sequences_values_chk CHECK ("nextNumber" >= 1 AND padding BETWEEN 1 AND 20);

-- PostgreSQL 15+ treats NULL branch/year values as equal for this unique index.
-- This prevents duplicate tenant-wide or non-year-specific numbering sequences.
CREATE UNIQUE INDEX document_sequences_scope_uidx
  ON public.document_sequences ("tenantId", "branchId", "documentType", year)
  NULLS NOT DISTINCT;

-- ============================================================
-- 2. CLERK -> FINATYX USER / TENANT HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_finatyx_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.id
  FROM public.users AS u
  WHERE u."clerkId" = (SELECT auth.jwt()->>'sub')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_tenant_member(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS tm
    WHERE tm."tenantId" = target_tenant_id
      AND tm."userId" = public.current_finatyx_user_id()
      AND tm.status = 'ACTIVE'::"MembershipStatus"
  );
$$;

REVOKE ALL ON FUNCTION public.current_finatyx_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_tenant_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_finatyx_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_tenant_member(uuid) TO authenticated;

-- ============================================================
-- 3. ENABLE RLS ON EVERY APPLICATION TABLE
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','tenants','tenant_memberships','branches','departments','roles','permissions','role_permissions',
    'membership_roles','membership_branch_access','customers','customer_contacts','suppliers','product_categories',
    'units','products','warehouses','quotations','quotation_items','invoices','invoice_items','payments',
    'payment_allocations','customer_ledger_entries','stock_movements','inventory_balances','purchase_orders',
    'purchase_order_items','goods_receipts','goods_receipt_items','supplier_bills','supplier_bill_items',
    'supplier_payments','supplier_payment_allocations','financial_accounts','accounts','fiscal_years','fiscal_periods',
    'journal_entries','journal_lines','expenses','tax_rates','employees','payroll_runs','payroll_entries','projects',
    'documents','document_links','approval_workflows','approval_steps','approval_requests','approval_actions','features',
    'plans','plan_entitlements','subscriptions','subscription_payments','tenant_entitlement_overrides','usage_counters',
    'audit_logs','activity_logs','domain_events','outbox_events','ai_conversations','ai_messages','ai_tool_executions',
    'document_sequences','currencies','exchange_rates','customer_groups','customer_group_members','product_unit_conversions',
    'price_lists','price_list_items','recurring_invoice_templates','recurring_invoice_items','delivery_notes',
    'delivery_note_items','credit_notes','credit_note_items','stock_transfers','stock_transfer_items','stock_counts',
    'stock_count_items','purchase_requests','purchase_request_items','supplier_ledger_entries','expense_categories',
    'bank_transactions','bank_reconciliations','bank_reconciliation_items','loans','loan_schedules','tax_components',
    'tax_transactions','salary_structures','salary_components','employee_salary_assignments','payroll_entry_components',
    'payslips','project_tasks','project_expenses','notifications','notification_deliveries','addons','addon_entitlements',
    'subscription_addons','custom_field_definitions','custom_field_values','tenant_settings','invoice_settings',
    'inventory_settings','accounting_settings','tax_settings','payroll_settings','notification_settings','ai_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ============================================================
-- 4. TENANT-ISOLATED READ POLICIES
-- Direct browser/Data API access is intentionally READ-ONLY.
-- Mutations should go through Finatyx server-side domain services where
-- RBAC, branch scope, entitlements, approvals, posting rules and transactions
-- are enforced. Server database roles are configured separately.
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_memberships','branches','departments','roles','membership_roles','membership_branch_access','customers',
    'customer_contacts','suppliers','product_categories','units','products','warehouses','quotations','quotation_items',
    'invoices','invoice_items','payments','payment_allocations','customer_ledger_entries','stock_movements',
    'inventory_balances','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items','supplier_bills',
    'supplier_bill_items','supplier_payments','supplier_payment_allocations','financial_accounts','accounts','fiscal_years',
    'fiscal_periods','journal_entries','journal_lines','expenses','tax_rates','employees','payroll_runs','payroll_entries',
    'projects','documents','document_links','approval_workflows','approval_steps','approval_requests','approval_actions',
    'subscriptions','subscription_payments','tenant_entitlement_overrides','usage_counters','audit_logs','activity_logs',
    'domain_events','outbox_events','ai_conversations','ai_tool_executions','document_sequences','customer_groups',
    'customer_group_members','product_unit_conversions','price_lists','price_list_items','recurring_invoice_templates',
    'recurring_invoice_items','delivery_notes','delivery_note_items','credit_notes','credit_note_items','stock_transfers',
    'stock_transfer_items','stock_counts','stock_count_items','purchase_requests','purchase_request_items',
    'supplier_ledger_entries','expense_categories','bank_transactions','bank_reconciliations','bank_reconciliation_items',
    'loans','loan_schedules','tax_components','tax_transactions','salary_structures','salary_components',
    'employee_salary_assignments','payroll_entry_components','payslips','project_tasks','project_expenses','notifications',
    'custom_field_definitions','custom_field_values','tenant_settings','invoice_settings','inventory_settings',
    'accounting_settings','tax_settings','payroll_settings','notification_settings','ai_settings'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_active_tenant_member("tenantId"))',
      t || '_tenant_select', t
    );
  END LOOP;
END $$;

-- Current Finatyx identity row.
CREATE POLICY users_self_select
  ON public.users
  FOR SELECT TO authenticated
  USING (id = public.current_finatyx_user_id());

-- Tenant rows themselves are visible only to active members.
CREATE POLICY tenants_member_select
  ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_active_tenant_member(id));

-- Global catalog/configuration tables are readable by authenticated users.
CREATE POLICY permissions_authenticated_select ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY features_authenticated_select ON public.features FOR SELECT TO authenticated USING (true);
CREATE POLICY plans_authenticated_select ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_entitlements_authenticated_select ON public.plan_entitlements FOR SELECT TO authenticated USING (true);
CREATE POLICY currencies_authenticated_select ON public.currencies FOR SELECT TO authenticated USING (true);
CREATE POLICY addons_authenticated_select ON public.addons FOR SELECT TO authenticated USING (true);
CREATE POLICY addon_entitlements_authenticated_select ON public.addon_entitlements FOR SELECT TO authenticated USING (true);

-- Global exchange rates (tenantId IS NULL) plus tenant-specific rates.
CREATE POLICY exchange_rates_authenticated_select
  ON public.exchange_rates
  FOR SELECT TO authenticated
  USING ("tenantId" IS NULL OR public.is_active_tenant_member("tenantId"));

-- Tables that inherit tenant ownership through a parent table.
CREATE POLICY role_permissions_tenant_select
  ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = "role_permissions"."roleId"
        AND public.is_active_tenant_member(r."tenantId")
    )
  );

CREATE POLICY ai_messages_tenant_select
  ON public.ai_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = "ai_messages"."conversationId"
        AND public.is_active_tenant_member(c."tenantId")
    )
  );

CREATE POLICY notification_deliveries_tenant_select
  ON public.notification_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.id = "notification_deliveries"."notificationId"
        AND public.is_active_tenant_member(n."tenantId")
    )
  );

CREATE POLICY subscription_addons_tenant_select
  ON public.subscription_addons
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = "subscription_addons"."subscriptionId"
        AND public.is_active_tenant_member(s."tenantId")
    )
  );

-- ============================================================
-- 5. SECURITY NOTES ENFORCED BY DESIGN
-- ============================================================
-- No INSERT/UPDATE/DELETE policies are granted to authenticated users here.
-- This prevents a browser/Data API client from bypassing Finatyx domain rules.
-- RLS is defense-in-depth tenant isolation; Finatyx server-side authorization
-- remains responsible for permissions, branch scope, entitlements and approvals.
-- Do not expose a Supabase service_role key in the browser.
-- Do not FORCE ROW LEVEL SECURITY here: Prisma/server connections and migration
-- ownership need to be designed deliberately before FORCE RLS is introduced.
-- Journal balancing across multiple rows is intentionally NOT expressed as a
-- CHECK constraint. The posting service must verify total debits = total credits
-- inside the same database transaction before a journal is marked POSTED.
