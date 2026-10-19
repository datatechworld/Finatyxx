-- Finatyx Migration #5
-- Accounting Integrity Hardening
--
-- Adds database-level invariants for fiscal periods,
-- exchange rates, and journal reversals.
--
-- Journal-wide balancing and business posting rules remain
-- the responsibility of the Finatyx posting service.

-- =========================================================
-- FISCAL YEAR INTEGRITY
-- =========================================================

ALTER TABLE public.fiscal_years
ADD CONSTRAINT fiscal_years_date_range_chk
CHECK ("startDate" <= "endDate");


-- =========================================================
-- FISCAL PERIOD INTEGRITY
-- =========================================================

ALTER TABLE public.fiscal_periods
ADD CONSTRAINT fiscal_periods_number_chk
CHECK ("periodNumber" >= 1);

ALTER TABLE public.fiscal_periods
ADD CONSTRAINT fiscal_periods_date_range_chk
CHECK ("startDate" <= "endDate");


-- =========================================================
-- JOURNAL ENTRY INTEGRITY
-- =========================================================

ALTER TABLE public.journal_entries
ADD CONSTRAINT journal_entries_exchange_rate_chk
CHECK ("exchangeRate" > 0);

ALTER TABLE public.journal_entries
ADD CONSTRAINT journal_entries_reversal_not_self_chk
CHECK (
  "reversalOfId" IS NULL
  OR "reversalOfId" <> id
);


-- =========================================================
-- SAME-TENANT REVERSAL RELATIONSHIP
-- =========================================================
--
-- journal_entries already has a UNIQUE index on:
--
--   ("tenantId", id)
--
-- Therefore a composite foreign key can guarantee that a
-- reversal journal cannot reference a journal belonging to
-- another tenant.

ALTER TABLE public.journal_entries
ADD CONSTRAINT journal_entries_tenantId_reversalOfId_fkey
FOREIGN KEY ("tenantId", "reversalOfId")
REFERENCES public.journal_entries ("tenantId", id)
ON UPDATE CASCADE
ON DELETE RESTRICT;


-- =========================================================
-- ONE REVERSAL PER ORIGINAL JOURNAL
-- =========================================================
--
-- NULL reversalOfId values are intentionally unrestricted.
-- PostgreSQL unique indexes allow multiple NULL values.
--
-- Once an original journal has been reversed, only one
-- journal may identify itself as that journal's reversal.

CREATE UNIQUE INDEX journal_entries_tenantId_reversalOfId_key
ON public.journal_entries (
  "tenantId",
  "reversalOfId"
);