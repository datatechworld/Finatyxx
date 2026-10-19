-- Finatyx Migration #13
-- Customer Ledger Source Idempotency
--
-- Accounting invariant:
-- A tenant may have at most one customer-ledger entry for a given
-- business source identity (referenceType, referenceId).
--
-- This protects the Accounts Receivable subledger from duplicate
-- postings caused by retries, concurrent requests, or application bugs.
--
-- Preflight completed before this migration:
--   duplicate source identities = 0

CREATE UNIQUE INDEX "customer_ledger_entries_source_uidx"
ON public.customer_ledger_entries (
  "tenantId",
  "referenceType",
  "referenceId"
);