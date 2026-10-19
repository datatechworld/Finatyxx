-- 15R Accounts Payable integrity hardening.
--
-- A business source must create at most one supplier subledger
-- entry per tenant. This database-level invariant closes the
-- concurrency gap that cannot be safely enforced by an
-- application-level existence check alone.

CREATE UNIQUE INDEX "supplier_ledger_entries_source_idempotency_uidx"
ON "supplier_ledger_entries" (
  "tenantId",
  "referenceType",
  "referenceId"
);