-- Finatyx Migration #4
-- Add a stable human-readable document number to payroll runs.
--
-- Pre-deployment audit confirmed payroll_runs contains zero rows,
-- therefore payrollNumber can safely be introduced as NOT NULL.

ALTER TABLE "payroll_runs"
ADD COLUMN "payrollNumber" VARCHAR(80) NOT NULL;

CREATE UNIQUE INDEX "payroll_runs_tenantId_payrollNumber_key"
ON "payroll_runs"("tenantId", "payrollNumber");
