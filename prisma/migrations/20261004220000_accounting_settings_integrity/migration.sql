-- Migration #6: Accounting Settings Integrity
--
-- Enforces:
--   1. Accounting settings must belong to an existing tenant.
--   2. Every configured default GL account must belong to the same tenant.
--
-- Account references remain nullable so accounting configuration can be
-- completed progressively during tenant onboarding.

ALTER TABLE "accounting_settings"
ADD CONSTRAINT "accounting_settings_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "tenants" ("id")
ON UPDATE CASCADE
ON DELETE RESTRICT;

ALTER TABLE "accounting_settings"
ADD CONSTRAINT "accounting_settings_tenantId_receivablesAccountId_fkey"
FOREIGN KEY ("tenantId", "receivablesAccountId")
REFERENCES "accounts" ("tenantId", "id")
ON UPDATE CASCADE
ON DELETE RESTRICT;

ALTER TABLE "accounting_settings"
ADD CONSTRAINT "accounting_settings_tenantId_payablesAccountId_fkey"
FOREIGN KEY ("tenantId", "payablesAccountId")
REFERENCES "accounts" ("tenantId", "id")
ON UPDATE CASCADE
ON DELETE RESTRICT;

ALTER TABLE "accounting_settings"
ADD CONSTRAINT "accounting_settings_tenantId_salesAccountId_fkey"
FOREIGN KEY ("tenantId", "salesAccountId")
REFERENCES "accounts" ("tenantId", "id")
ON UPDATE CASCADE
ON DELETE RESTRICT;

ALTER TABLE "accounting_settings"
ADD CONSTRAINT "accounting_settings_tenantId_inventoryAccountId_fkey"
FOREIGN KEY ("tenantId", "inventoryAccountId")
REFERENCES "accounts" ("tenantId", "id")
ON UPDATE CASCADE
ON DELETE RESTRICT;

ALTER TABLE "accounting_settings"
ADD CONSTRAINT "accounting_settings_tenantId_cogsAccountId_fkey"
FOREIGN KEY ("tenantId", "cogsAccountId")
REFERENCES "accounts" ("tenantId", "id")
ON UPDATE CASCADE
ON DELETE RESTRICT;

ALTER TABLE "accounting_settings"
ADD CONSTRAINT "accounting_settings_tenantId_retainedEarningsAccountId_fkey"
FOREIGN KEY ("tenantId", "retainedEarningsAccountId")
REFERENCES "accounts" ("tenantId", "id")
ON UPDATE CASCADE
ON DELETE RESTRICT;