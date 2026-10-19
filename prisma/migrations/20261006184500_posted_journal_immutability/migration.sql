-- Migration #11: Posted Journal Integrity and Immutability
--
-- Finatyx General Ledger hardening.
--
-- Posting lifecycle:
--   1. JournalEntry is created as DRAFT.
--   2. JournalLine records are constructed while the journal is DRAFT.
--   3. The journal transitions DRAFT -> POSTED inside the same transaction.
--
-- Database guarantees:
--   1. A journal cannot become POSTED unless it has at least two lines.
--   2. A journal cannot become POSTED unless total debits equal total credits.
--   3. POSTED journal accounting substance is immutable.
--   4. POSTED/REVERSED journals cannot be deleted.
--   5. Lines belonging to POSTED/REVERSED journals cannot be inserted,
--      updated, moved, or deleted.
--   6. POSTED -> REVERSED is the only permitted status transition from POSTED.
--   7. POSTED -> REVERSED requires a corresponding POSTED reversal journal.
--   8. REVERSED journals are completely immutable.
--
-- Existing constraints from earlier migrations remain authoritative for:
--   - exchangeRate > 0
--   - reversalOfId cannot reference the same journal
--   - exactly one positive debit or positive credit per journal line


-- ============================================================
-- 1. Protect JournalEntry lifecycle and accounting substance
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_journal_entry_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    line_count bigint;
    total_debit numeric;
    total_credit numeric;
BEGIN
    -- --------------------------------------------------------
    -- DELETE protection
    -- --------------------------------------------------------

    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION
                'Posted or reversed journal entries cannot be deleted'
                USING ERRCODE = '23514';
        END IF;

        RETURN OLD;
    END IF;


    -- --------------------------------------------------------
    -- REVERSED journals are permanently immutable
    -- --------------------------------------------------------

    IF OLD.status = 'REVERSED' THEN
        RAISE EXCEPTION
            'Reversed journal entries are immutable'
            USING ERRCODE = '23514';
    END IF;


    -- --------------------------------------------------------
    -- POSTED journal protection
    -- --------------------------------------------------------

    IF OLD.status = 'POSTED' THEN

        -- Accounting and audit substance cannot change.
        IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
           OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
           OR NEW."journalNumber" IS DISTINCT FROM OLD."journalNumber"
           OR NEW."journalDate" IS DISTINCT FROM OLD."journalDate"
           OR NEW.description IS DISTINCT FROM OLD.description
           OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
           OR NEW."sourceId" IS DISTINCT FROM OLD."sourceId"
           OR NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode"
           OR NEW."exchangeRate" IS DISTINCT FROM OLD."exchangeRate"
           OR NEW."postedAt" IS DISTINCT FROM OLD."postedAt"
           OR NEW."postedById" IS DISTINCT FROM OLD."postedById"
           OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId"
           OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
           OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
        THEN
            RAISE EXCEPTION
                'Posted journal entry accounting fields are immutable'
                USING ERRCODE = '23514';
        END IF;

        -- POSTED may remain POSTED, or transition only to REVERSED.
        IF NEW.status IS DISTINCT FROM OLD.status THEN

            IF NEW.status <> 'REVERSED' THEN
                RAISE EXCEPTION
                    'Posted journal entry status may only transition to REVERSED'
                    USING ERRCODE = '23514';
            END IF;

            -- The reversing journal must already exist and itself be POSTED.
            IF NOT EXISTS (
                SELECT 1
                FROM public.journal_entries AS reversal
                WHERE reversal."tenantId" = OLD."tenantId"
                  AND reversal."reversalOfId" = OLD.id
                  AND reversal.status = 'POSTED'
            ) THEN
                RAISE EXCEPTION
                    'Journal entry cannot be marked REVERSED without a posted reversal journal'
                    USING ERRCODE = '23514';
            END IF;

        END IF;

        RETURN NEW;
    END IF;


    -- --------------------------------------------------------
    -- Validation when a mutable journal becomes POSTED
    -- --------------------------------------------------------

    IF NEW.status = 'POSTED'
       AND OLD.status IS DISTINCT FROM 'POSTED'
    THEN
        SELECT
            COUNT(*)::bigint,
            COALESCE(SUM(line.debit), 0),
            COALESCE(SUM(line.credit), 0)
        INTO
            line_count,
            total_debit,
            total_credit
        FROM public.journal_lines AS line
        WHERE line."tenantId" = NEW."tenantId"
          AND line."journalEntryId" = NEW.id;

        IF line_count < 2 THEN
            RAISE EXCEPTION
                'A posted journal entry must contain at least two journal lines'
                USING ERRCODE = '23514';
        END IF;

        IF total_debit IS DISTINCT FROM total_credit THEN
            RAISE EXCEPTION
                'A posted journal entry must be balanced: total debit must equal total credit'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS journal_entries_integrity_trg
ON public.journal_entries;

CREATE TRIGGER journal_entries_integrity_trg
BEFORE UPDATE OR DELETE
ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.protect_journal_entry_integrity();


-- ============================================================
-- 2. Protect JournalLine records after posting
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_journal_line_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    parent_status public."JournalStatus";
BEGIN
    -- --------------------------------------------------------
    -- Protect the existing parent for UPDATE and DELETE
    -- --------------------------------------------------------

    IF TG_OP IN ('UPDATE', 'DELETE') THEN

        SELECT journal.status
        INTO parent_status
        FROM public.journal_entries AS journal
        WHERE journal."tenantId" = OLD."tenantId"
          AND journal.id = OLD."journalEntryId";

        IF parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION
                'Journal lines belonging to posted or reversed journals are immutable'
                USING ERRCODE = '23514';
        END IF;

    END IF;


    -- --------------------------------------------------------
    -- Protect the destination parent for INSERT and UPDATE
    -- --------------------------------------------------------

    IF TG_OP IN ('INSERT', 'UPDATE') THEN

        SELECT journal.status
        INTO parent_status
        FROM public.journal_entries AS journal
        WHERE journal."tenantId" = NEW."tenantId"
          AND journal.id = NEW."journalEntryId";

        IF parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION
                'Journal lines cannot be inserted into or moved into a posted or reversed journal'
                USING ERRCODE = '23514';
        END IF;

    END IF;


    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS journal_lines_integrity_trg
ON public.journal_lines;

CREATE TRIGGER journal_lines_integrity_trg
BEFORE INSERT OR UPDATE OR DELETE
ON public.journal_lines
FOR EACH ROW
EXECUTE FUNCTION public.protect_journal_line_integrity();