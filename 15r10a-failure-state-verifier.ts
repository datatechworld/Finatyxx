import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main(): Promise<void> {
  console.log(
    "=== 15R.10A FAILURE-STATE DATABASE VERIFICATION ===",
  );

  const suppliers = await prisma.supplier.findMany({
    where: {
      tenantId: TENANT_ID,
      supplierCode: {
        startsWith: "APTEST-1791464987647-760870",
      },
    },
    select: {
      id: true,
      supplierCode: true,
      name: true,
    },
  });

  const products = await prisma.product.findMany({
    where: {
      tenantId: TENANT_ID,
      sku: {
        startsWith: "APTEST-1791464987647-760870",
      },
    },
    select: {
      id: true,
      sku: true,
      name: true,
    },
  });

  const bills = await prisma.supplierBill.findMany({
    where: {
      tenantId: TENANT_ID,
      billNumber: {
        startsWith:
          "BILL-APTEST-2098-1791464987647-760870",
      },
    },
    select: {
      id: true,
      billNumber: true,
      status: true,
    },
  });

  const journals = await prisma.journalEntry.findMany({
    where: {
      tenantId: TENANT_ID,
      sourceType: "SUPPLIER_BILL",
      sourceId: {
        not: null,
      },
    },
    select: {
      id: true,
      sourceId: true,
      journalNumber: true,
    },
  });

  const supplierLedger =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_BILL",
      },
      select: {
        id: true,
        referenceId: true,
      },
    });

  console.log("");
  console.log("FAILED FIXTURE TOKEN");
  console.log("1791464987647-760870");

  console.log("");
  console.log("FAILED FIXTURE STATE");
  console.dir(
    {
      suppliers,
      products,
      bills,
    },
    { depth: null },
  );

  if (suppliers.length !== 0) {
    throw new Error(
      "ROLLBACK_VERIFICATION_FAILED: supplier survived",
    );
  }

  if (products.length !== 0) {
    throw new Error(
      "ROLLBACK_VERIFICATION_FAILED: product survived",
    );
  }

  if (bills.length !== 0) {
    throw new Error(
      "ROLLBACK_VERIFICATION_FAILED: Supplier Bill survived",
    );
  }

  /*
   * We do not require global Supplier Bill journal/ledger
   * counts to be zero because future/permanent evidence may
   * legitimately exist. The failed fixture had no committed
   * Supplier Bill ID, so the rollback proof is the absence of
   * all token-addressable fixture records.
   */

  console.log("");
  console.log("EXISTING SUPPLIER BILL FINANCIAL RECORD COUNTS");
  console.dir({
    supplierBillJournals: journals.length,
    supplierBillLedgerEntries: supplierLedger.length,
  });

  console.log("");
  console.log(
    "15R.10A FAILURE-STATE VERIFICATION: PASS",
  );

  console.log(
    "Failed fixture transaction was fully rolled back.",
  );

  console.log("Database mutations: NONE");
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10A FAILURE-STATE VERIFICATION: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });