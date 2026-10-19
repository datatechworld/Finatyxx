ALTER TABLE public.credit_notes
ADD CONSTRAINT "credit_notes_tenantId_branchId_fkey"
FOREIGN KEY ("tenantId", "branchId")
REFERENCES public.branches ("tenantId", id)
ON UPDATE CASCADE
ON DELETE RESTRICT;