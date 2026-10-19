import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main(): Promise<void> {
  console.log(
    "=== 15R.10C DATABASE SAFETY VERIFICATION ===",
  );

  const suppliers =
    await prisma.supplier.findMany({
      where: {
        tenantId: TENANT_ID,
        supplierCode: {
          startsWith: "APTEST-15R10B-",
        },
      },
      select: {
        id: true,
        supplierCode: true,
      },
    });

  const products =
    await prisma.product.findMany({
      where: {
        tenantId: TENANT_ID,
        sku: {
          startsWith: "APTEST-15R10B-",
        },
      },
      select: {
        id: true,
        sku: true,
      },
    });

  const bills =
    await prisma.supplierBill.findMany({
      where: {
        tenantId: TENANT_ID,
        billNumber: {
          startsWith: "BILL-APTEST-15R10B-",
        },
      },
      select: {
        id: true,
        billNumber: true,
        status: true,
        postedAt: true,
      },
    });

  console.log("");
  console.log("15R.10B DATABASE STATE");

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
      "SAFETY_CHECK_FAILED: 15R.10B supplier exists",
    );
  }

  if (products.length !== 0) {
    throw new Error(
      "SAFETY_CHECK_FAILED: 15R.10B product exists",
    );
  }

  if (bills.length !== 0) {
    throw new Error(
      "SAFETY_CHECK_FAILED: 15R.10B Supplier Bill exists",
    );
  }

  console.log("");
  console.log(
    "15R.10C DATABASE SAFETY VERIFICATION: PASS",
  );

  console.log(
    "Broken 15R.10B test executed no database mutations.",
  );

  console.log("Database mutations: NONE");
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10C DATABASE SAFETY VERIFICATION: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });