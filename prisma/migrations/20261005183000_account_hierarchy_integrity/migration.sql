-- Migration #7: Account Hierarchy Integrity
--
-- Enforces tenant-safe parent/child relationships in the Chart of Accounts.
-- A child account may only reference an account belonging to the same tenant.
-- Parent deletion is restricted to protect the account hierarchy.

ALTER TABLE public.accounts
ADD CONSTRAINT "accounts_tenantId_parentId_fkey"
FOREIGN KEY ("tenantId", "parentId")
REFERENCES public.accounts ("tenantId", id)
ON UPDATE CASCADE
ON DELETE RESTRICT;