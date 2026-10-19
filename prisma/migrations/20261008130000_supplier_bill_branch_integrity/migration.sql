-- 15R Supplier Bill tenant/branch integrity.
--
-- A Supplier Bill branch must belong to the same tenant
-- as the Supplier Bill itself.

ALTER TABLE "supplier_bills"
ADD CONSTRAINT "supplier_bills_tenantId_branchId_fkey"
FOREIGN KEY ("tenantId", "branchId")
REFERENCES "branches" ("tenantId", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;