-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "BranchAccessLevel" AS ENUM ('READ', 'OPERATE', 'MANAGE');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('INVENTORY', 'NON_INVENTORY', 'SERVICE');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('DRAFT', 'PENDING', 'POSTED', 'FAILED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'BILLED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "StockDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE_RECEIPT', 'SALE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'STOCK_COUNT', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED', 'VOID');

-- CreateEnum
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('CASH', 'BANK', 'MOBILE_MONEY', 'PETTY_CASH', 'PAYMENT_GATEWAY');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "FeatureValueType" AS ENUM ('BOOLEAN', 'INTEGER', 'DECIMAL', 'TEXT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('APPROVE', 'REJECT', 'COMMENT', 'CANCEL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'POST', 'VOID', 'REVERSE', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'EXPORT', 'PERMISSION_CHANGE', 'SUPPORT_ACCESS');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "AIExecutionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PROCESSING', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('SALES', 'PURCHASE', 'WITHHOLDING', 'PAYROLL', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentSequenceType" AS ENUM ('QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'RECEIPT', 'PURCHASE_REQUEST', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'SUPPLIER_BILL', 'SUPPLIER_PAYMENT', 'EXPENSE', 'JOURNAL', 'STOCK_TRANSFER', 'STOCK_COUNT', 'PAYROLL');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "TransferLineStatus" AS ENUM ('PENDING', 'DISPATCHED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'RECONCILED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAID_OFF', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalaryComponentType" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME', 'SELECT', 'MULTISELECT', 'JSON');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "clerkId" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320),
    "firstName" VARCHAR(120),
    "lastName" VARCHAR(120),
    "phone" VARCHAR(40),
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "tradingName" VARCHAR(200),
    "slug" VARCHAR(120) NOT NULL,
    "registrationNumber" VARCHAR(100),
    "taxIdentification" VARCHAR(100),
    "industry" VARCHAR(120),
    "countryCode" CHAR(2) NOT NULL,
    "baseCurrencyCode" CHAR(3) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Africa/Accra',
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "website" TEXT,
    "logoUrl" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMPTZ(6),
    "invitedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" VARCHAR(120),
    "region" VARCHAR(120),
    "countryCode" CHAR(2) NOT NULL,
    "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "userId" UUID,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "resource" VARCHAR(80) NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "tenantId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("tenantId","membershipId","roleId")
);

-- CreateTable
CREATE TABLE "membership_branch_access" (
    "tenantId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "accessLevel" "BranchAccessLevel" NOT NULL DEFAULT 'READ',

    CONSTRAINT "membership_branch_access_pkey" PRIMARY KEY ("tenantId","membershipId","branchId")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerCode" VARCHAR(60) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contactPerson" VARCHAR(160),
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "taxNumber" VARCHAR(100),
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "currencyCode" CHAR(3) NOT NULL,
    "billingAddress" JSONB,
    "shippingAddress" JSONB,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "jobTitle" VARCHAR(120),
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierCode" VARCHAR(60) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contactPerson" VARCHAR(160),
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "taxNumber" VARCHAR(100),
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" CHAR(3) NOT NULL,
    "billingAddress" JSONB,
    "bankDetails" JSONB,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "parentId" UUID,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "precision" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "barcode" VARCHAR(120),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" "ProductType" NOT NULL,
    "categoryId" UUID,
    "baseUnitId" UUID,
    "defaultSalesPrice" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "defaultPurchasePrice" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "trackSerialNumbers" BOOLEAN NOT NULL DEFAULT false,
    "reorderLevel" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "quotationNumber" VARCHAR(80) NOT NULL,
    "quotationDate" DATE NOT NULL,
    "validUntil" DATE,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(20,4) NOT NULL,
    "discountTotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,4) NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "terms" TEXT,
    "acceptedAt" TIMESTAMPTZ(6),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "productId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "unitPrice" DECIMAL(20,4) NOT NULL,
    "discountAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(20,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "quotationId" UUID,
    "invoiceNumber" VARCHAR(80) NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(20,4) NOT NULL,
    "discountTotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "roundingAdjustment" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,4) NOT NULL,
    "amountPaid" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(20,4) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "terms" TEXT,
    "postedAt" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6),
    "paidAt" TIMESTAMPTZ(6),
    "voidedAt" TIMESTAMPTZ(6),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "productId" UUID,
    "warehouseId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "unitPrice" DECIMAL(20,4) NOT NULL,
    "discountPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(20,4) NOT NULL,
    "lineTotal" DECIMAL(20,4) NOT NULL,
    "unitCost" DECIMAL(20,4),
    "costTotal" DECIMAL(20,4),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "paymentNumber" VARCHAR(80) NOT NULL,
    "paymentDate" DATE NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "amount" DECIMAL(20,4) NOT NULL,
    "unallocatedAmount" DECIMAL(20,4) NOT NULL,
    "financialAccountId" UUID,
    "reference" VARCHAR(160),
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'DRAFT',
    "receivedById" UUID,
    "postedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_ledger_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "branchId" UUID,
    "transactionDate" DATE NOT NULL,
    "entryType" VARCHAR(60) NOT NULL,
    "referenceType" VARCHAR(60) NOT NULL,
    "referenceId" UUID NOT NULL,
    "debit" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "currencyCode" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "direction" "StockDirection" NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "unitCost" DECIMAL(20,4) NOT NULL,
    "totalCost" DECIMAL(20,4) NOT NULL,
    "referenceType" VARCHAR(60) NOT NULL,
    "referenceId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "tenantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantityOnHand" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "quantityAvailable" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("tenantId","warehouseId","productId")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "poNumber" VARCHAR(80) NOT NULL,
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(20,4) NOT NULL,
    "discountTotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,4) NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "unitCost" DECIMAL(20,4) NOT NULL,
    "taxRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "receiptNumber" VARCHAR(80) NOT NULL,
    "receivedDate" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "receivedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantityReceived" DECIMAL(20,4) NOT NULL,
    "unitCost" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bills" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "billNumber" VARCHAR(80) NOT NULL,
    "supplierInvoiceNumber" VARCHAR(120),
    "billDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(20,4) NOT NULL,
    "taxTotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,4) NOT NULL,
    "amountPaid" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(20,4) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bill_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierBillId" UUID NOT NULL,
    "productId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "unitCost" DECIMAL(20,4) NOT NULL,
    "taxRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "supplier_bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "paymentNumber" VARCHAR(80) NOT NULL,
    "paymentDate" DATE NOT NULL,
    "financialAccountId" UUID NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "amount" DECIMAL(20,4) NOT NULL,
    "unallocatedAmount" DECIMAL(20,4) NOT NULL,
    "reference" VARCHAR(160),
    "status" "PaymentStatus" NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierPaymentId" UUID NOT NULL,
    "supplierBillId" UUID NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "name" VARCHAR(160) NOT NULL,
    "accountType" "FinancialAccountType" NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "bankName" VARCHAR(160),
    "accountNumberMasked" VARCHAR(80),
    "mobileMoneyProvider" VARCHAR(80),
    "openingBalance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "currentBalanceCache" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "ledgerAccountId" UUID,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "parentId" UUID,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "type" "AccountType" NOT NULL,
    "normalBalance" "NormalBalance" NOT NULL,
    "isControlAccount" BOOLEAN NOT NULL DEFAULT false,
    "allowManualPosting" BOOLEAN NOT NULL DEFAULT true,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMPTZ(6),
    "closedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fiscalYearId" UUID NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "journalNumber" VARCHAR(80) NOT NULL,
    "journalDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" VARCHAR(60) NOT NULL,
    "sourceId" UUID,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMPTZ(6),
    "postedById" UUID,
    "reversalOfId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "customerId" UUID,
    "supplierId" UUID,
    "employeeId" UUID,
    "projectId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "expenseNumber" VARCHAR(80) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "subtotal" DECIMAL(20,4) NOT NULL,
    "taxAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "financialAccountId" UUID,
    "expenseAccountId" UUID NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" UUID,
    "postedAt" TIMESTAMPTZ(6),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "rate" DECIMAL(9,6) NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "userId" UUID,
    "employeeNumber" VARCHAR(60) NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "departmentId" UUID,
    "jobTitle" VARCHAR(160),
    "hireDate" DATE NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "approvedById" UUID,
    "postedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "payrollRunId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "grossPay" DECIMAL(20,4) NOT NULL,
    "tax" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "pension" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "customerId" UUID,
    "projectCode" VARCHAR(60) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "budget" DECIMAL(20,4),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "managerUserId" UUID,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" VARCHAR(160) NOT NULL,
    "storageProvider" VARCHAR(40) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "checksum" VARCHAR(128),
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_links" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" UUID NOT NULL,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "roleId" UUID NOT NULL,
    "minimumApprovals" INTEGER NOT NULL DEFAULT 1,
    "conditionJson" JSONB,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" UUID NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_actions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "approvalRequestId" UUID NOT NULL,
    "stepId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "comment" TEXT,
    "actedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "features" (
    "id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "valueType" "FeatureValueType" NOT NULL,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "billingInterval" "BillingInterval" NOT NULL,
    "basePrice" DECIMAL(20,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlements" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "featureId" UUID NOT NULL,
    "booleanValue" BOOLEAN,
    "integerValue" INTEGER,
    "decimalValue" DECIMAL(20,4),
    "textValue" TEXT,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "currentPeriodStart" TIMESTAMPTZ(6) NOT NULL,
    "currentPeriodEnd" TIMESTAMPTZ(6) NOT NULL,
    "trialStart" TIMESTAMPTZ(6),
    "trialEnd" TIMESTAMPTZ(6),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMPTZ(6),
    "externalSubscriptionId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "paymentProvider" VARCHAR(80) NOT NULL,
    "providerReference" VARCHAR(255),
    "paymentDate" TIMESTAMPTZ(6),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_entitlement_overrides" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "featureId" UUID NOT NULL,
    "booleanValue" BOOLEAN,
    "integerValue" INTEGER,
    "decimalValue" DECIMAL(20,4),
    "textValue" TEXT,
    "reason" TEXT,
    "effectiveFrom" TIMESTAMPTZ(6) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(6),

    CONSTRAINT "tenant_entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "featureId" UUID NOT NULL,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "usageCount" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "userId" UUID,
    "membershipId" UUID,
    "branchId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" UUID,
    "beforeData" JSONB,
    "afterData" JSONB,
    "changedFields" JSONB,
    "ipAddress" VARCHAR(64),
    "userAgent" TEXT,
    "requestId" VARCHAR(128),
    "sessionId" VARCHAR(255),
    "source" VARCHAR(60) NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorUserId" UUID,
    "activityType" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "entityType" VARCHAR(80),
    "entityId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "eventType" VARCHAR(120) NOT NULL,
    "aggregateType" VARCHAR(80) NOT NULL,
    "aggregateId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "eventType" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" VARCHAR(30) NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_executions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "conversationId" UUID,
    "messageId" UUID,
    "userId" UUID NOT NULL,
    "toolName" VARCHAR(120) NOT NULL,
    "inputJson" JSONB NOT NULL,
    "outputSummaryJson" JSONB,
    "permissionChecked" BOOLEAN NOT NULL DEFAULT false,
    "confirmationRequired" BOOLEAN NOT NULL DEFAULT false,
    "confirmationReceived" BOOLEAN NOT NULL DEFAULT false,
    "status" "AIExecutionStatus" NOT NULL,
    "executedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "documentType" "DocumentSequenceType" NOT NULL,
    "prefix" VARCHAR(30) NOT NULL,
    "year" INTEGER,
    "nextNumber" BIGINT NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(12) NOT NULL,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(6) NOT NULL,
    "source" VARCHAR(80),

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_groups" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_group_members" (
    "tenantId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "customerId" UUID NOT NULL,

    CONSTRAINT "customer_group_members_pkey" PRIMARY KEY ("tenantId","groupId","customerId")
);

-- CreateTable
CREATE TABLE "product_unit_conversions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "fromUnitId" UUID NOT NULL,
    "toUnitId" UUID NOT NULL,
    "factor" DECIMAL(20,8) NOT NULL,

    CONSTRAINT "product_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "price" DECIMAL(20,4) NOT NULL,
    "minQuantity" DECIMAL(20,4) NOT NULL DEFAULT 1,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_invoice_templates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "nextRunDate" DATE NOT NULL,
    "endDate" DATE,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recurring_invoice_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_invoice_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "productId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "unitPrice" DECIMAL(20,4) NOT NULL,
    "discountPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recurring_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "invoiceId" UUID,
    "deliveryNumber" VARCHAR(80) NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "deliveredById" UUID,
    "receivedByName" VARCHAR(160),
    "receivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_note_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "deliveryNoteId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "delivery_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "invoiceId" UUID,
    "creditNoteNumber" VARCHAR(80) NOT NULL,
    "creditNoteDate" DATE NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(20,4) NOT NULL,
    "taxTotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,4) NOT NULL,
    "reason" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMPTZ(6),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "creditNoteId" UUID NOT NULL,
    "invoiceItemId" UUID,
    "productId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "unitPrice" DECIMAL(20,4) NOT NULL,
    "taxRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "credit_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "transferNumber" VARCHAR(80) NOT NULL,
    "sourceWarehouseId" UUID NOT NULL,
    "destinationWarehouseId" UUID NOT NULL,
    "transferDate" DATE NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "dispatchedAt" TIMESTAMPTZ(6),
    "receivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "stockTransferId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantityRequested" DECIMAL(20,4) NOT NULL,
    "quantityDispatched" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "quantityReceived" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "status" "TransferLineStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "countNumber" VARCHAR(80) NOT NULL,
    "countDate" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "postedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "systemQuantity" DECIMAL(20,4) NOT NULL,
    "countedQuantity" DECIMAL(20,4) NOT NULL,
    "varianceQuantity" DECIMAL(20,4) NOT NULL,
    "unitCost" DECIMAL(20,4) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "supplierId" UUID,
    "requestNumber" VARCHAR(80) NOT NULL,
    "requestDate" DATE NOT NULL,
    "requiredDate" DATE,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "requestedById" UUID NOT NULL,
    "approvedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "productId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "estimatedUnitCost" DECIMAL(20,4),

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_ledger_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "branchId" UUID,
    "transactionDate" DATE NOT NULL,
    "entryType" VARCHAR(60) NOT NULL,
    "referenceType" VARCHAR(60) NOT NULL,
    "referenceId" UUID NOT NULL,
    "debit" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "currencyCode" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "defaultAccountId" UUID,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "financialAccountId" UUID NOT NULL,
    "transactionDate" DATE NOT NULL,
    "valueDate" DATE,
    "description" TEXT NOT NULL,
    "reference" VARCHAR(160),
    "amount" DECIMAL(20,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "externalId" VARCHAR(255),
    "status" "BankTransactionStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedReferenceType" VARCHAR(60),
    "matchedReferenceId" UUID,
    "importedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "financialAccountId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "statementOpeningBalance" DECIMAL(20,4) NOT NULL,
    "statementClosingBalance" DECIMAL(20,4) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "reconciledById" UUID,
    "reconciledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliation_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "reconciliationId" UUID NOT NULL,
    "bankTransactionId" UUID NOT NULL,
    "matchedAmount" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "bank_reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "name" VARCHAR(160) NOT NULL,
    "lenderName" VARCHAR(200) NOT NULL,
    "principal" DECIMAL(20,4) NOT NULL,
    "annualInterestRate" DECIMAL(9,6) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "startDate" DATE NOT NULL,
    "maturityDate" DATE,
    "status" "LoanStatus" NOT NULL DEFAULT 'DRAFT',
    "liabilityAccountId" UUID,
    "interestExpenseAccountId" UUID,
    "financialAccountId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_schedules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "principalDue" DECIMAL(20,4) NOT NULL,
    "interestDue" DECIMAL(20,4) NOT NULL,
    "totalDue" DECIMAL(20,4) NOT NULL,
    "amountPaid" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMPTZ(6),

    CONSTRAINT "loan_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "taxRateId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "rate" DECIMAL(9,6) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_transactions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "taxRateId" UUID,
    "taxType" "TaxType" NOT NULL,
    "transactionDate" DATE NOT NULL,
    "referenceType" VARCHAR(60) NOT NULL,
    "referenceId" UUID NOT NULL,
    "taxableAmount" DECIMAL(20,4) NOT NULL,
    "taxAmount" DECIMAL(20,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salaryStructureId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "componentType" "SalaryComponentType" NOT NULL,
    "fixedAmount" DECIMAL(20,4),
    "percentage" DECIMAL(9,6),
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "pensionable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salary_assignments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "salaryStructureId" UUID NOT NULL,
    "baseSalary" DECIMAL(20,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "employee_salary_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entry_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "payrollEntryId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "componentType" "SalaryComponentType" NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "payroll_entry_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "payrollEntryId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "payslipNumber" VARCHAR(80) NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" UUID,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_tasks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "assigneeUserId" UUID,
    "dueDate" DATE,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_expenses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "expenseId" UUID,
    "amount" DECIMAL(20,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "incurredAt" DATE NOT NULL,
    "description" TEXT,

    CONSTRAINT "project_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" VARCHAR(80),
    "entityId" UUID,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "destination" VARCHAR(320),
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" VARCHAR(255),
    "attemptedAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "failureReason" TEXT,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "basePrice" DECIMAL(20,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_entitlements" (
    "id" UUID NOT NULL,
    "addonId" UUID NOT NULL,
    "featureId" UUID NOT NULL,
    "booleanValue" BOOLEAN,
    "integerValue" INTEGER,
    "decimalValue" DECIMAL(20,4),
    "textValue" TEXT,

    CONSTRAINT "addon_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_addons" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "addonId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(20,4) NOT NULL,
    "activeFrom" TIMESTAMPTZ(6) NOT NULL,
    "activeTo" TIMESTAMPTZ(6),

    CONSTRAINT "subscription_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "fieldType" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenantId" UUID NOT NULL,
    "dateFormat" VARCHAR(30) NOT NULL DEFAULT 'DD/MM/YYYY',
    "numberFormat" VARCHAR(30) NOT NULL DEFAULT '1,234.56',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "defaultLanguage" VARCHAR(10) NOT NULL DEFAULT 'en',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "invoice_settings" (
    "tenantId" UUID NOT NULL,
    "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "defaultNotes" TEXT,
    "defaultTerms" TEXT,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "autoPostInvoices" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoice_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "inventory_settings" (
    "tenantId" UUID NOT NULL,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "costingMethod" VARCHAR(40) NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    "defaultWarehouseId" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "accounting_settings" (
    "tenantId" UUID NOT NULL,
    "receivablesAccountId" UUID,
    "payablesAccountId" UUID,
    "salesAccountId" UUID,
    "inventoryAccountId" UUID,
    "cogsAccountId" UUID,
    "retainedEarningsAccountId" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounting_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "tax_settings" (
    "tenantId" UUID NOT NULL,
    "taxInclusivePricing" BOOLEAN NOT NULL DEFAULT false,
    "defaultSalesTaxRateId" UUID,
    "defaultPurchaseTaxRateId" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "payroll_settings" (
    "tenantId" UUID NOT NULL,
    "payrollCurrencyCode" CHAR(3) NOT NULL,
    "defaultPayDay" INTEGER NOT NULL DEFAULT 25,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "tenantId" UUID NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "tenantId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "requireConfirmationForWrites" BOOLEAN NOT NULL DEFAULT true,
    "allowFinancialPosting" BOOLEAN NOT NULL DEFAULT false,
    "modelName" VARCHAR(120),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkId_key" ON "users"("clerkId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenants_countryCode_idx" ON "tenants"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_id_baseCurrencyCode_key" ON "tenants"("id", "baseCurrencyCode");

-- CreateIndex
CREATE INDEX "tenant_memberships_userId_status_idx" ON "tenant_memberships"("userId", "status");

-- CreateIndex
CREATE INDEX "tenant_memberships_tenantId_status_idx" ON "tenant_memberships"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenantId_userId_key" ON "tenant_memberships"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenantId_id_key" ON "tenant_memberships"("tenantId", "id");

-- CreateIndex
CREATE INDEX "branches_tenantId_status_idx" ON "branches"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_code_key" ON "branches"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_id_key" ON "branches"("tenantId", "id");

-- CreateIndex
CREATE INDEX "departments_tenantId_branchId_idx" ON "departments"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenantId_code_key" ON "departments"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenantId_id_key" ON "departments"("tenantId", "id");

-- CreateIndex
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_code_key" ON "roles"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_id_key" ON "roles"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_resource_idx" ON "permissions"("module", "resource");

-- CreateIndex
CREATE INDEX "membership_roles_tenantId_roleId_idx" ON "membership_roles"("tenantId", "roleId");

-- CreateIndex
CREATE INDEX "membership_branch_access_tenantId_branchId_idx" ON "membership_branch_access"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "customers_tenantId_name_idx" ON "customers"("tenantId", "name");

-- CreateIndex
CREATE INDEX "customers_tenantId_status_idx" ON "customers"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_customerCode_key" ON "customers"("tenantId", "customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_id_key" ON "customers"("tenantId", "id");

-- CreateIndex
CREATE INDEX "customer_contacts_tenantId_customerId_idx" ON "customer_contacts"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_name_idx" ON "suppliers"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenantId_supplierCode_key" ON "suppliers"("tenantId", "supplierCode");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenantId_id_key" ON "suppliers"("tenantId", "id");

-- CreateIndex
CREATE INDEX "product_categories_tenantId_parentId_idx" ON "product_categories"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_tenantId_code_key" ON "product_categories"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_tenantId_id_key" ON "product_categories"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "units_tenantId_symbol_key" ON "units"("tenantId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "units_tenantId_id_key" ON "units"("tenantId", "id");

-- CreateIndex
CREATE INDEX "products_tenantId_barcode_idx" ON "products"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "products_tenantId_name_idx" ON "products"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_sku_key" ON "products"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_id_key" ON "products"("tenantId", "id");

-- CreateIndex
CREATE INDEX "warehouses_tenantId_branchId_idx" ON "warehouses"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenantId_code_key" ON "warehouses"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenantId_id_key" ON "warehouses"("tenantId", "id");

-- CreateIndex
CREATE INDEX "quotations_tenantId_customerId_status_idx" ON "quotations"("tenantId", "customerId", "status");

-- CreateIndex
CREATE INDEX "quotations_tenantId_branchId_quotationDate_idx" ON "quotations"("tenantId", "branchId", "quotationDate");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenantId_quotationNumber_key" ON "quotations"("tenantId", "quotationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenantId_id_key" ON "quotations"("tenantId", "id");

-- CreateIndex
CREATE INDEX "quotation_items_tenantId_quotationId_idx" ON "quotation_items"("tenantId", "quotationId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_branchId_invoiceDate_idx" ON "invoices"("tenantId", "branchId", "invoiceDate");

-- CreateIndex
CREATE INDEX "invoices_tenantId_customerId_status_idx" ON "invoices"("tenantId", "customerId", "status");

-- CreateIndex
CREATE INDEX "invoices_tenantId_status_dueDate_idx" ON "invoices"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNumber_key" ON "invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_id_key" ON "invoices"("tenantId", "id");

-- CreateIndex
CREATE INDEX "invoice_items_tenantId_invoiceId_idx" ON "invoice_items"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "invoice_items_tenantId_productId_idx" ON "invoice_items"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_tenantId_id_key" ON "invoice_items"("tenantId", "id");

-- CreateIndex
CREATE INDEX "payments_tenantId_customerId_paymentDate_idx" ON "payments"("tenantId", "customerId", "paymentDate");

-- CreateIndex
CREATE INDEX "payments_tenantId_status_idx" ON "payments"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_paymentNumber_key" ON "payments"("tenantId", "paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_id_key" ON "payments"("tenantId", "id");

-- CreateIndex
CREATE INDEX "payment_allocations_tenantId_invoiceId_idx" ON "payment_allocations"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_paymentId_invoiceId_key" ON "payment_allocations"("paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "customer_ledger_entries_tenantId_customerId_transactionDate_idx" ON "customer_ledger_entries"("tenantId", "customerId", "transactionDate");

-- CreateIndex
CREATE INDEX "customer_ledger_entries_tenantId_referenceType_referenceId_idx" ON "customer_ledger_entries"("tenantId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_productId_occurredAt_idx" ON "stock_movements"("tenantId", "productId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_warehouseId_productId_idx" ON "stock_movements"("tenantId", "warehouseId", "productId");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_referenceType_referenceId_idx" ON "stock_movements"("tenantId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_supplierId_status_idx" ON "purchase_orders"("tenantId", "supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenantId_poNumber_key" ON "purchase_orders"("tenantId", "poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenantId_id_key" ON "purchase_orders"("tenantId", "id");

-- CreateIndex
CREATE INDEX "purchase_order_items_tenantId_purchaseOrderId_idx" ON "purchase_order_items"("tenantId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "goods_receipts_tenantId_supplierId_receivedDate_idx" ON "goods_receipts"("tenantId", "supplierId", "receivedDate");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenantId_receiptNumber_key" ON "goods_receipts"("tenantId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenantId_id_key" ON "goods_receipts"("tenantId", "id");

-- CreateIndex
CREATE INDEX "goods_receipt_items_tenantId_goodsReceiptId_idx" ON "goods_receipt_items"("tenantId", "goodsReceiptId");

-- CreateIndex
CREATE INDEX "supplier_bills_tenantId_supplierId_dueDate_idx" ON "supplier_bills"("tenantId", "supplierId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_tenantId_billNumber_key" ON "supplier_bills"("tenantId", "billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_tenantId_id_key" ON "supplier_bills"("tenantId", "id");

-- CreateIndex
CREATE INDEX "supplier_bill_items_tenantId_supplierBillId_idx" ON "supplier_bill_items"("tenantId", "supplierBillId");

-- CreateIndex
CREATE INDEX "supplier_payments_tenantId_supplierId_paymentDate_idx" ON "supplier_payments"("tenantId", "supplierId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_tenantId_paymentNumber_key" ON "supplier_payments"("tenantId", "paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_tenantId_id_key" ON "supplier_payments"("tenantId", "id");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_tenantId_supplierBillId_idx" ON "supplier_payment_allocations"("tenantId", "supplierBillId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_allocations_supplierPaymentId_supplierBill_key" ON "supplier_payment_allocations"("supplierPaymentId", "supplierBillId");

-- CreateIndex
CREATE INDEX "financial_accounts_tenantId_accountType_status_idx" ON "financial_accounts"("tenantId", "accountType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_tenantId_id_key" ON "financial_accounts"("tenantId", "id");

-- CreateIndex
CREATE INDEX "accounts_tenantId_type_idx" ON "accounts"("tenantId", "type");

-- CreateIndex
CREATE INDEX "accounts_tenantId_parentId_idx" ON "accounts"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenantId_code_key" ON "accounts"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenantId_id_key" ON "accounts"("tenantId", "id");

-- CreateIndex
CREATE INDEX "fiscal_years_tenantId_startDate_endDate_idx" ON "fiscal_years"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_tenantId_name_key" ON "fiscal_years"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_tenantId_id_key" ON "fiscal_years"("tenantId", "id");

-- CreateIndex
CREATE INDEX "fiscal_periods_tenantId_startDate_endDate_idx" ON "fiscal_periods"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_fiscalYearId_periodNumber_key" ON "fiscal_periods"("fiscalYearId", "periodNumber");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_tenantId_id_key" ON "fiscal_periods"("tenantId", "id");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_journalDate_idx" ON "journal_entries"("tenantId", "journalDate");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_sourceType_sourceId_idx" ON "journal_entries"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_journalNumber_key" ON "journal_entries"("tenantId", "journalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_id_key" ON "journal_entries"("tenantId", "id");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_accountId_idx" ON "journal_lines"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_journalEntryId_idx" ON "journal_lines"("tenantId", "journalEntryId");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_customerId_idx" ON "journal_lines"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_supplierId_idx" ON "journal_lines"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "expenses_tenantId_branchId_expenseDate_idx" ON "expenses"("tenantId", "branchId", "expenseDate");

-- CreateIndex
CREATE INDEX "expenses_tenantId_status_idx" ON "expenses"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenantId_expenseNumber_key" ON "expenses"("tenantId", "expenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenantId_id_key" ON "expenses"("tenantId", "id");

-- CreateIndex
CREATE INDEX "tax_rates_tenantId_taxType_status_idx" ON "tax_rates"("tenantId", "taxType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_tenantId_code_effectiveFrom_key" ON "tax_rates"("tenantId", "code", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_tenantId_id_key" ON "tax_rates"("tenantId", "id");

-- CreateIndex
CREATE INDEX "employees_tenantId_branchId_status_idx" ON "employees"("tenantId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_employeeNumber_key" ON "employees"("tenantId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_id_key" ON "employees"("tenantId", "id");

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_status_payDate_idx" ON "payroll_runs"("tenantId", "status", "payDate");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenantId_periodStart_periodEnd_key" ON "payroll_runs"("tenantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenantId_id_key" ON "payroll_runs"("tenantId", "id");

-- CreateIndex
CREATE INDEX "payroll_entries_tenantId_employeeId_idx" ON "payroll_entries"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_tenantId_id_key" ON "payroll_entries"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_payrollRunId_employeeId_key" ON "payroll_entries"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "projects_tenantId_status_idx" ON "projects"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_tenantId_projectCode_key" ON "projects"("tenantId", "projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "projects_tenantId_id_key" ON "projects"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storageKey_key" ON "documents"("storageKey");

-- CreateIndex
CREATE INDEX "documents_tenantId_createdAt_idx" ON "documents"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "documents_tenantId_id_key" ON "documents"("tenantId", "id");

-- CreateIndex
CREATE INDEX "document_links_tenantId_entityType_entityId_idx" ON "document_links"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_tenantId_name_key" ON "approval_workflows"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_tenantId_id_key" ON "approval_workflows"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_tenantId_id_key" ON "approval_steps"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_tenantId_workflowId_stepOrder_key" ON "approval_steps"("tenantId", "workflowId", "stepOrder");

-- CreateIndex
CREATE INDEX "approval_requests_tenantId_entityType_entityId_idx" ON "approval_requests"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "approval_requests_tenantId_status_requestedAt_idx" ON "approval_requests"("tenantId", "status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_tenantId_id_key" ON "approval_requests"("tenantId", "id");

-- CreateIndex
CREATE INDEX "approval_actions_tenantId_approvalRequestId_actedAt_idx" ON "approval_actions"("tenantId", "approvalRequestId", "actedAt");

-- CreateIndex
CREATE INDEX "approval_actions_tenantId_stepId_idx" ON "approval_actions"("tenantId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "features_code_key" ON "features"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entitlements_planId_featureId_key" ON "plan_entitlements"("planId", "featureId");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_status_idx" ON "subscriptions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_currentPeriodEnd_idx" ON "subscriptions"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_id_key" ON "subscriptions"("tenantId", "id");

-- CreateIndex
CREATE INDEX "subscription_payments_tenantId_status_createdAt_idx" ON "subscription_payments"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_entitlement_overrides_tenantId_featureId_effectiveFr_idx" ON "tenant_entitlement_overrides"("tenantId", "featureId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_tenantId_featureId_periodStart_periodEnd_key" ON "usage_counters"("tenantId", "featureId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_occurredAt_idx" ON "audit_logs"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_entityType_entityId_idx" ON "audit_logs"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_occurredAt_idx" ON "audit_logs"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "activity_logs_tenantId_createdAt_idx" ON "activity_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "domain_events_tenantId_eventType_occurredAt_idx" ON "domain_events"("tenantId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_createdAt_idx" ON "outbox_events"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ai_conversations_tenantId_userId_createdAt_idx" ON "ai_conversations"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_tool_executions_tenantId_userId_createdAt_idx" ON "ai_tool_executions"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_tool_executions_toolName_status_idx" ON "ai_tool_executions"("toolName", "status");

-- CreateIndex
CREATE INDEX "document_sequences_tenantId_branchId_documentType_year_idx" ON "document_sequences"("tenantId", "branchId", "documentType", "year");

-- CreateIndex
CREATE INDEX "exchange_rates_tenantId_baseCurrency_quoteCurrency_effectiv_idx" ON "exchange_rates"("tenantId", "baseCurrency", "quoteCurrency", "effectiveAt");

-- CreateIndex
CREATE INDEX "customer_groups_tenantId_status_idx" ON "customer_groups"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_groups_tenantId_code_key" ON "customer_groups"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_groups_tenantId_id_key" ON "customer_groups"("tenantId", "id");

-- CreateIndex
CREATE INDEX "customer_group_members_tenantId_customerId_idx" ON "customer_group_members"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "product_unit_conversions_tenantId_productId_fromUnitId_toUn_key" ON "product_unit_conversions"("tenantId", "productId", "fromUnitId", "toUnitId");

-- CreateIndex
CREATE INDEX "price_lists_tenantId_status_idx" ON "price_lists"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_tenantId_name_key" ON "price_lists"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_tenantId_id_key" ON "price_lists"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_items_tenantId_priceListId_productId_minQuantity_key" ON "price_list_items"("tenantId", "priceListId", "productId", "minQuantity");

-- CreateIndex
CREATE INDEX "recurring_invoice_templates_tenantId_nextRunDate_status_idx" ON "recurring_invoice_templates"("tenantId", "nextRunDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_invoice_templates_tenantId_id_key" ON "recurring_invoice_templates"("tenantId", "id");

-- CreateIndex
CREATE INDEX "recurring_invoice_items_tenantId_templateId_idx" ON "recurring_invoice_items"("tenantId", "templateId");

-- CreateIndex
CREATE INDEX "delivery_notes_tenantId_customerId_deliveryDate_idx" ON "delivery_notes"("tenantId", "customerId", "deliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_tenantId_deliveryNumber_key" ON "delivery_notes"("tenantId", "deliveryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_tenantId_id_key" ON "delivery_notes"("tenantId", "id");

-- CreateIndex
CREATE INDEX "delivery_note_items_tenantId_deliveryNoteId_idx" ON "delivery_note_items"("tenantId", "deliveryNoteId");

-- CreateIndex
CREATE INDEX "credit_notes_tenantId_customerId_creditNoteDate_idx" ON "credit_notes"("tenantId", "customerId", "creditNoteDate");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_tenantId_creditNoteNumber_key" ON "credit_notes"("tenantId", "creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_tenantId_id_key" ON "credit_notes"("tenantId", "id");

-- CreateIndex
CREATE INDEX "credit_note_items_tenantId_creditNoteId_idx" ON "credit_note_items"("tenantId", "creditNoteId");

-- CreateIndex
CREATE INDEX "stock_transfers_tenantId_transferDate_status_idx" ON "stock_transfers"("tenantId", "transferDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_tenantId_transferNumber_key" ON "stock_transfers"("tenantId", "transferNumber");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_tenantId_id_key" ON "stock_transfers"("tenantId", "id");

-- CreateIndex
CREATE INDEX "stock_transfer_items_tenantId_stockTransferId_idx" ON "stock_transfer_items"("tenantId", "stockTransferId");

-- CreateIndex
CREATE INDEX "stock_counts_tenantId_warehouseId_countDate_idx" ON "stock_counts"("tenantId", "warehouseId", "countDate");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_tenantId_countNumber_key" ON "stock_counts"("tenantId", "countNumber");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_tenantId_id_key" ON "stock_counts"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_items_tenantId_stockCountId_productId_key" ON "stock_count_items"("tenantId", "stockCountId", "productId");

-- CreateIndex
CREATE INDEX "purchase_requests_tenantId_branchId_requestDate_idx" ON "purchase_requests"("tenantId", "branchId", "requestDate");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_tenantId_requestNumber_key" ON "purchase_requests"("tenantId", "requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_tenantId_id_key" ON "purchase_requests"("tenantId", "id");

-- CreateIndex
CREATE INDEX "purchase_request_items_tenantId_purchaseRequestId_idx" ON "purchase_request_items"("tenantId", "purchaseRequestId");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_tenantId_supplierId_transactionDate_idx" ON "supplier_ledger_entries"("tenantId", "supplierId", "transactionDate");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_tenantId_referenceType_referenceId_idx" ON "supplier_ledger_entries"("tenantId", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_tenantId_code_key" ON "expense_categories"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_tenantId_id_key" ON "expense_categories"("tenantId", "id");

-- CreateIndex
CREATE INDEX "bank_transactions_tenantId_financialAccountId_transactionDa_idx" ON "bank_transactions"("tenantId", "financialAccountId", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_tenantId_financialAccountId_externalId_key" ON "bank_transactions"("tenantId", "financialAccountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_tenantId_id_key" ON "bank_transactions"("tenantId", "id");

-- CreateIndex
CREATE INDEX "bank_reconciliations_tenantId_financialAccountId_periodEnd_idx" ON "bank_reconciliations"("tenantId", "financialAccountId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconciliations_tenantId_id_key" ON "bank_reconciliations"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconciliation_items_tenantId_reconciliationId_bankTra_key" ON "bank_reconciliation_items"("tenantId", "reconciliationId", "bankTransactionId");

-- CreateIndex
CREATE INDEX "loans_tenantId_status_idx" ON "loans"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "loans_tenantId_id_key" ON "loans"("tenantId", "id");

-- CreateIndex
CREATE INDEX "loan_schedules_tenantId_dueDate_idx" ON "loan_schedules"("tenantId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "loan_schedules_tenantId_loanId_installmentNumber_key" ON "loan_schedules"("tenantId", "loanId", "installmentNumber");

-- CreateIndex
CREATE INDEX "tax_components_tenantId_taxRateId_idx" ON "tax_components"("tenantId", "taxRateId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_components_tenantId_taxRateId_code_key" ON "tax_components"("tenantId", "taxRateId", "code");

-- CreateIndex
CREATE INDEX "tax_transactions_tenantId_taxType_transactionDate_idx" ON "tax_transactions"("tenantId", "taxType", "transactionDate");

-- CreateIndex
CREATE INDEX "tax_transactions_tenantId_referenceType_referenceId_idx" ON "tax_transactions"("tenantId", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_tenantId_name_key" ON "salary_structures"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_tenantId_id_key" ON "salary_structures"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_components_tenantId_salaryStructureId_code_key" ON "salary_components"("tenantId", "salaryStructureId", "code");

-- CreateIndex
CREATE INDEX "employee_salary_assignments_tenantId_employeeId_effectiveFr_idx" ON "employee_salary_assignments"("tenantId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "payroll_entry_components_tenantId_payrollEntryId_idx" ON "payroll_entry_components"("tenantId", "payrollEntryId");

-- CreateIndex
CREATE INDEX "payslips_tenantId_employeeId_generatedAt_idx" ON "payslips"("tenantId", "employeeId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_tenantId_payrollEntryId_key" ON "payslips"("tenantId", "payrollEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_tenantId_payslipNumber_key" ON "payslips"("tenantId", "payslipNumber");

-- CreateIndex
CREATE INDEX "project_tasks_tenantId_projectId_status_idx" ON "project_tasks"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "project_expenses_tenantId_projectId_incurredAt_idx" ON "project_expenses"("tenantId", "projectId", "incurredAt");

-- CreateIndex
CREATE INDEX "notifications_tenantId_userId_createdAt_idx" ON "notifications"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_notificationId_channel_status_idx" ON "notification_deliveries"("notificationId", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "addons_code_key" ON "addons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "addon_entitlements_addonId_featureId_key" ON "addon_entitlements"("addonId", "featureId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_addons_subscriptionId_addonId_activeFrom_key" ON "subscription_addons"("subscriptionId", "addonId", "activeFrom");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_tenantId_entityType_key_key" ON "custom_field_definitions"("tenantId", "entityType", "key");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_tenantId_id_key" ON "custom_field_definitions"("tenantId", "id");

-- CreateIndex
CREATE INDEX "custom_field_values_tenantId_entityId_idx" ON "custom_field_values"("tenantId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_tenantId_definitionId_entityId_key" ON "custom_field_values"("tenantId", "definitionId", "entityId");

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_tenantId_membershipId_fkey" FOREIGN KEY ("tenantId", "membershipId") REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_tenantId_roleId_fkey" FOREIGN KEY ("tenantId", "roleId") REFERENCES "roles"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branch_access" ADD CONSTRAINT "membership_branch_access_tenantId_membershipId_fkey" FOREIGN KEY ("tenantId", "membershipId") REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branch_access" ADD CONSTRAINT "membership_branch_access_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_categoryId_fkey" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "product_categories"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_baseUnitId_fkey" FOREIGN KEY ("tenantId", "baseUnitId") REFERENCES "units"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_tenantId_quotationId_fkey" FOREIGN KEY ("tenantId", "quotationId") REFERENCES "quotations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_quotationId_fkey" FOREIGN KEY ("tenantId", "quotationId") REFERENCES "quotations"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenantId_paymentId_fkey" FOREIGN KEY ("tenantId", "paymentId") REFERENCES "payments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ledger_entries" ADD CONSTRAINT "customer_ledger_entries_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_warehouseId_fkey" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "warehouses"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_tenantId_warehouseId_fkey" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "warehouses"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenantId_supplierId_fkey" FOREIGN KEY ("tenantId", "supplierId") REFERENCES "suppliers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_tenantId_purchaseOrderId_fkey" FOREIGN KEY ("tenantId", "purchaseOrderId") REFERENCES "purchase_orders"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenantId_purchaseOrderId_fkey" FOREIGN KEY ("tenantId", "purchaseOrderId") REFERENCES "purchase_orders"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_tenantId_goodsReceiptId_fkey" FOREIGN KEY ("tenantId", "goodsReceiptId") REFERENCES "goods_receipts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_tenantId_supplierId_fkey" FOREIGN KEY ("tenantId", "supplierId") REFERENCES "suppliers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_tenantId_purchaseOrderId_fkey" FOREIGN KEY ("tenantId", "purchaseOrderId") REFERENCES "purchase_orders"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_tenantId_supplierBillId_fkey" FOREIGN KEY ("tenantId", "supplierBillId") REFERENCES "supplier_bills"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tenantId_supplierId_fkey" FOREIGN KEY ("tenantId", "supplierId") REFERENCES "suppliers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_tenantId_supplierPaymentId_fkey" FOREIGN KEY ("tenantId", "supplierPaymentId") REFERENCES "supplier_payments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_tenantId_supplierBillId_fkey" FOREIGN KEY ("tenantId", "supplierBillId") REFERENCES "supplier_bills"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_tenantId_fiscalYearId_fkey" FOREIGN KEY ("tenantId", "fiscalYearId") REFERENCES "fiscal_years"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenantId_journalEntryId_fkey" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "journal_entries"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "accounts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_tenantId_payrollRunId_fkey" FOREIGN KEY ("tenantId", "payrollRunId") REFERENCES "payroll_runs"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_tenantId_documentId_fkey" FOREIGN KEY ("tenantId", "documentId") REFERENCES "documents"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_tenantId_workflowId_fkey" FOREIGN KEY ("tenantId", "workflowId") REFERENCES "approval_workflows"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_tenantId_roleId_fkey" FOREIGN KEY ("tenantId", "roleId") REFERENCES "roles"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenantId_workflowId_fkey" FOREIGN KEY ("tenantId", "workflowId") REFERENCES "approval_workflows"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_tenantId_approvalRequestId_fkey" FOREIGN KEY ("tenantId", "approvalRequestId") REFERENCES "approval_requests"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_tenantId_stepId_fkey" FOREIGN KEY ("tenantId", "stepId") REFERENCES "approval_steps"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenantId_subscriptionId_fkey" FOREIGN KEY ("tenantId", "subscriptionId") REFERENCES "subscriptions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_entitlement_overrides" ADD CONSTRAINT "tenant_entitlement_overrides_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_tenantId_groupId_fkey" FOREIGN KEY ("tenantId", "groupId") REFERENCES "customer_groups"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_tenantId_fromUnitId_fkey" FOREIGN KEY ("tenantId", "fromUnitId") REFERENCES "units"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_tenantId_toUnitId_fkey" FOREIGN KEY ("tenantId", "toUnitId") REFERENCES "units"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tenantId_priceListId_fkey" FOREIGN KEY ("tenantId", "priceListId") REFERENCES "price_lists"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_templates" ADD CONSTRAINT "recurring_invoice_templates_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES "recurring_invoice_templates"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_note_items" ADD CONSTRAINT "delivery_note_items_tenantId_deliveryNoteId_fkey" FOREIGN KEY ("tenantId", "deliveryNoteId") REFERENCES "delivery_notes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_note_items" ADD CONSTRAINT "delivery_note_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_tenantId_creditNoteId_fkey" FOREIGN KEY ("tenantId", "creditNoteId") REFERENCES "credit_notes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_tenantId_invoiceItemId_fkey" FOREIGN KEY ("tenantId", "invoiceItemId") REFERENCES "invoice_items"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenantId_sourceWarehouseId_fkey" FOREIGN KEY ("tenantId", "sourceWarehouseId") REFERENCES "warehouses"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenantId_destinationWarehouseId_fkey" FOREIGN KEY ("tenantId", "destinationWarehouseId") REFERENCES "warehouses"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_tenantId_stockTransferId_fkey" FOREIGN KEY ("tenantId", "stockTransferId") REFERENCES "stock_transfers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_tenantId_warehouseId_fkey" FOREIGN KEY ("tenantId", "warehouseId") REFERENCES "warehouses"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_tenantId_stockCountId_fkey" FOREIGN KEY ("tenantId", "stockCountId") REFERENCES "stock_counts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tenantId_supplierId_fkey" FOREIGN KEY ("tenantId", "supplierId") REFERENCES "suppliers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_tenantId_purchaseRequestId_fkey" FOREIGN KEY ("tenantId", "purchaseRequestId") REFERENCES "purchase_requests"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_tenantId_supplierId_fkey" FOREIGN KEY ("tenantId", "supplierId") REFERENCES "suppliers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_tenantId_financialAccountId_fkey" FOREIGN KEY ("tenantId", "financialAccountId") REFERENCES "financial_accounts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_tenantId_financialAccountId_fkey" FOREIGN KEY ("tenantId", "financialAccountId") REFERENCES "financial_accounts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_tenantId_reconciliationId_fkey" FOREIGN KEY ("tenantId", "reconciliationId") REFERENCES "bank_reconciliations"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_tenantId_bankTransactionId_fkey" FOREIGN KEY ("tenantId", "bankTransactionId") REFERENCES "bank_transactions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_schedules" ADD CONSTRAINT "loan_schedules_tenantId_loanId_fkey" FOREIGN KEY ("tenantId", "loanId") REFERENCES "loans"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_tenantId_salaryStructureId_fkey" FOREIGN KEY ("tenantId", "salaryStructureId") REFERENCES "salary_structures"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_assignments" ADD CONSTRAINT "employee_salary_assignments_tenantId_employeeId_fkey" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "employees"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_assignments" ADD CONSTRAINT "employee_salary_assignments_tenantId_salaryStructureId_fkey" FOREIGN KEY ("tenantId", "salaryStructureId") REFERENCES "salary_structures"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry_components" ADD CONSTRAINT "payroll_entry_components_tenantId_payrollEntryId_fkey" FOREIGN KEY ("tenantId", "payrollEntryId") REFERENCES "payroll_entries"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry_components" ADD CONSTRAINT "payroll_entry_components_tenantId_employeeId_fkey" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "employees"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenantId_payrollEntryId_fkey" FOREIGN KEY ("tenantId", "payrollEntryId") REFERENCES "payroll_entries"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenantId_employeeId_fkey" FOREIGN KEY ("tenantId", "employeeId") REFERENCES "employees"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_tenantId_projectId_fkey" FOREIGN KEY ("tenantId", "projectId") REFERENCES "projects"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_tenantId_projectId_fkey" FOREIGN KEY ("tenantId", "projectId") REFERENCES "projects"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_entitlements" ADD CONSTRAINT "addon_entitlements_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_entitlements" ADD CONSTRAINT "addon_entitlements_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_addons" ADD CONSTRAINT "subscription_addons_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_addons" ADD CONSTRAINT "subscription_addons_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_tenantId_definitionId_fkey" FOREIGN KEY ("tenantId", "definitionId") REFERENCES "custom_field_definitions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
