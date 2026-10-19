-- Finatyx Migration #12
-- Journal Insert Integrity Hardening
--
-- Accounting invariant:
-- Every journal entry must originate as DRAFT.
--
-- POSTED and REVERSED journals may only be reached through the
-- controlled lifecycle already enforced by
-- protect_journal_entry_integrity().
--
-- This closes the database-level bypass where a caller could
-- explicitly INSERT a journal directly with status POSTED or REVERSED.

CREATE OR REPLACE FUNCTION public.protect_journal_entry_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    line_count bigint;
    total_debit numeric;
    total_credit numeric;
BEGIN
    -- --------------------------------------------------------
    -- INSERT protection
    -- --------------------------------------------------------

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'DRAFT' THEN
            RAISE EXCEPTION
                'Journal entries must be created in DRAFT status'
                USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
    END IF;


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
$function$;


DROP TRIGGER IF EXISTS journal_entries_integrity_trg
ON public.journal_entries;

CREATE TRIGGER journal_entries_integrity_trg
BEFORE INSERT OR UPDATE OR DELETE
ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.protect_journal_entry_integrity();