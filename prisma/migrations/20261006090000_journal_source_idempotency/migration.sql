-- Migration #10: Journal Source Idempotency
--
-- Prevents the same tenant-scoped business source from producing more
-- than one journal entry when sourceId is present.
--
-- Manual journals may legitimately have sourceId = NULL, so the
-- uniqueness rule applies only to source-backed journal entries.
--
-- This is the database-level concurrency barrier for posting idempotency.
-- The posting service will also perform an application-level lookup so
-- callers receive deterministic, domain-friendly behavior.

CREATE UNIQUE INDEX "journal_entries_source_idempotency_uidx"
ON public.journal_entries (
  "tenantId",
  "sourceType",
  "sourceId"
)
WHERE "sourceId" IS NOT NULL;