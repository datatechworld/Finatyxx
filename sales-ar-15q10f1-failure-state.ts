import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const CUSTOMER_ID =
  "ab359555-fbf8-469a-8b05-83f7a232badc";

async function main() {
  console.log(
    "=== 15Q.10F.1 FAILURE STATE VERIFICATION ===",
  );

  const customer = await prisma.customer.findUnique({
    where: {
      tenantId_id: {
        tenantId: TENANT_ID,
        id: CUSTOMER_ID,
      },
    },
    select: {
      id: true,
      customerCode: true,
      name: true,
      status: true,
      currencyCode: true,
    },
  });

  const invoiceCount = await prisma.invoice.count({
    where: {
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
    },
  });

  const ledgerCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
      },
    });

  const salesJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SALES_INVOICE",
      },
    });

  console.log("");
  console.log("Customer:", customer);
  console.log("Invoices for customer:", invoiceCount);
  console.log(
    "Ledger entries for customer:",
    ledgerCount,
  );
  console.log(
    "SALES_INVOICE journals:",
    salesJournalCount,
  );

  console.log("");
  console.log("=== EXPECTED FAILURE STATE ===");

  if (!customer) {
    throw new Error(
      "Expected failed-test customer was not found.",
    );
  }

  if (invoiceCount !== 0) {
    throw new Error(
      `Expected 0 invoices, found ${invoiceCount}.`,
    );
  }

  if (ledgerCount !== 0) {
    throw new Error(
      `Expected 0 customer ledger entries, found ${ledgerCount}.`,
    );
  }

  if (salesJournalCount !== 0) {
    throw new Error(
      `Expected 0 SALES_INVOICE journals, found ${salesJournalCount}.`,
    );
  }

  console.log("PASS customer exists");
  console.log("PASS no invoice was created");
  console.log("PASS no customer subledger was posted");
  console.log("PASS no SALES_INVOICE journal was posted");

  console.log("");
  console.log(
    "15Q.10F.1 FAILURE STATE VERIFICATION: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.10F.1 FAILURE STATE VERIFICATION: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });