import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

const BANK_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

async function main(): Promise<void> {
  console.log("");
  console.log("=== POSTED SUPPLIER BILL ===");

  const bill = await prisma.supplierBill.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: BILL_ID,
      },
    },
    include: {
      allocations: true,
    },
  });

  if (!bill) {
    throw new Error("Supplier Bill not found.");
  }

  console.dir(
    {
      id: bill.id,
      tenantId: bill.tenantId,
      branchId: bill.branchId,
      supplierId: bill.supplierId,
      billNumber: bill.billNumber,
      currencyCode: bill.currencyCode,
      exchangeRate: bill.exchangeRate.toString(),
      total: bill.total.toString(),
      amountPaid: bill.amountPaid.toString(),
      balanceDue: bill.balanceDue.toString(),
      status: bill.status,
      postedAt: bill.postedAt,
      allocationCount: bill.allocations.length,
      allocations: bill.allocations.map((a) => ({
        id: a.id,
        supplierPaymentId: a.supplierPaymentId,
        amount: a.amount.toString(),
      })),
    },
    { depth: null },
  );

  console.log("");
  console.log("=== FINANCIAL ACCOUNT ===");

  const bank = await prisma.financialAccount.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: BANK_ID,
      },
    },
    include: {
      ledgerAccount: true,
    },
  });

  if (!bank) {
    throw new Error("Financial Account not found.");
  }

  console.dir(
    {
      id: bank.id,
      tenantId: bank.tenantId,
      branchId: bank.branchId,
      name: bank.name,
      accountType: bank.accountType,
      currencyCode: bank.currencyCode,
      status: bank.status,
      ledgerAccountId: bank.ledgerAccountId,
      ledgerAccount: bank.ledgerAccount
        ? {
            id: bank.ledgerAccount.id,
            code: bank.ledgerAccount.code,
            name: bank.ledgerAccount.name,
            status: bank.ledgerAccount.status,
          }
        : null,
    },
    { depth: null },
  );

  if (bill.status !== "POSTED") {
    throw new Error(
      `Expected bill POSTED, found ${bill.status}`,
    );
  }

  if (bill.branchId !== BRANCH_ID) {
    throw new Error("Bill branch mismatch.");
  }

  if (bill.currencyCode !== "GHS") {
    throw new Error("Bill is not GHS.");
  }

  if (!bill.exchangeRate.equals(1)) {
    throw new Error("Bill exchange rate is not 1.");
  }

  if (!bill.amountPaid.equals(0)) {
    throw new Error("Bill amountPaid is not 0.");
  }

  if (!bill.balanceDue.equals(1150)) {
    throw new Error("Bill balanceDue is not 1150.");
  }

  if (bill.allocations.length !== 0) {
    throw new Error(
      "Bill already has SupplierPaymentAllocation rows.",
    );
  }

  if (bank.tenantId !== TENANT_ID) {
    throw new Error("Bank tenant mismatch.");
  }

  if (
    bank.branchId !== null &&
    bank.branchId !== BRANCH_ID
  ) {
    throw new Error("Bank branch mismatch.");
  }

  if (bank.status !== "ACTIVE") {
    throw new Error("Bank is not ACTIVE.");
  }

  if (bank.currencyCode !== "GHS") {
    throw new Error("Bank is not GHS.");
  }

  if (!bank.ledgerAccountId || !bank.ledgerAccount) {
    throw new Error(
      "Bank has no linked ledger account.",
    );
  }

  if (bank.ledgerAccount.status !== "ACTIVE") {
    throw new Error(
      "Bank ledger account is not ACTIVE.",
    );
  }

  console.log("");
  console.log("BUSINESS PREFLIGHT: PASS");

  /*
   * Cast every PostgreSQL catalog result to text.
   * Prisma/adapter-pg catalog native types are intentionally
   * avoided here.
   */

  console.log("");
  console.log("=== SUPPLIER PAYMENT DATABASE CONSTRAINTS ===");

  const paymentConstraints =
    await prisma.$queryRaw<
      Array<{
        name: string;
        definition: string;
      }>
    >`
      SELECT
        c.conname::text AS "name",
        pg_get_constraintdef(c.oid)::text AS "definition"
      FROM pg_constraint c
      JOIN pg_class t
        ON t.oid = c.conrelid
      JOIN pg_namespace n
        ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'supplier_payments'
      ORDER BY c.conname::text
    `;

  console.dir(paymentConstraints, { depth: null });

  console.log("");
  console.log(
    "=== SUPPLIER PAYMENT ALLOCATION DATABASE CONSTRAINTS ===",
  );

  const allocationConstraints =
    await prisma.$queryRaw<
      Array<{
        name: string;
        definition: string;
      }>
    >`
      SELECT
        c.conname::text AS "name",
        pg_get_constraintdef(c.oid)::text AS "definition"
      FROM pg_constraint c
      JOIN pg_class t
        ON t.oid = c.conrelid
      JOIN pg_namespace n
        ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'supplier_payment_allocations'
      ORDER BY c.conname::text
    `;

  console.dir(allocationConstraints, { depth: null });

  console.log("");
  console.log("=== RELEVANT INDEXES ===");

  const indexes =
    await prisma.$queryRaw<
      Array<{
        tableName: string;
        indexName: string;
        definition: string;
      }>
    >`
      SELECT
        tablename::text AS "tableName",
        indexname::text AS "indexName",
        indexdef::text AS "definition"
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN (
          'supplier_payments',
          'supplier_payment_allocations',
          'supplier_ledger_entries'
        )
      ORDER BY
        tablename::text,
        indexname::text
    `;

  console.dir(indexes, { depth: null });

  console.log("");
  console.log("15R.11B PREFLIGHT: PASS");
  console.log("Database mutations: NONE");
}

main()
  .catch((error) => {
    console.error("");
    console.error("15R.11B: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });