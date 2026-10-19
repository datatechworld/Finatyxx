-- Migration #8: Account Self-Parent Integrity
--
-- Prevents an account from referencing itself as its direct parent.
-- Multi-level hierarchy cycle prevention is enforced by the application service.

ALTER TABLE public.accounts
ADD CONSTRAINT accounts_parent_not_self_chk
CHECK ("parentId" IS NULL OR "parentId" <> id);