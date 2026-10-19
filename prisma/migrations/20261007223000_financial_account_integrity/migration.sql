-- 15Q.11 Customer Payment / Receipt Foundation
-- Financial-account accounting integrity.
--
-- Enforce tenant-safe references:
--   FinancialAccount.ledgerAccountId -> Account
--   Payment.financialAccountId       -> FinancialAccount
--
-- Both references remain nullable so DRAFT/setup records may exist
-- before their posting configuration is complete. Posting services
-- must require valid financial-account and ledger-account linkage.

ALTER TABLE public.financial_accounts
ADD CONSTRAINT "financial_accounts_tenantId_ledgerAccountId_fkey"
FOREIGN KEY ("tenantId", "ledgerAccountId")
REFERENCES public.accounts ("tenantId", id)
ON UPDATE CASCADE
ON DELETE RESTRICT;

ALTER TABLE public.payments
ADD CONSTRAINT "payments_tenantId_financialAccountId_fkey"
FOREIGN KEY ("tenantId", "financialAccountId")
REFERENCES public.financial_accounts ("tenantId", id)
ON UPDATE CASCADE
ON DELETE RESTRICT;