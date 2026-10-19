import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main() {
  console.log(
    "=== 15Q.10D SALES INVOICE TEST FIXTURE PREFLIGHT ===",
  );
  console.log("");

  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: {
      id: true,
      legalName: true,
      status: true,
      baseCurrencyCode: true,
      timezone: true,
    },
  });

  console.log("=== TENANT ===");
  console.log(tenant);

  if (!tenant) {
    throw new Error("Test tenant not found.");
  }

  const branches = await prisma.branch.findMany({
    where: {
      tenantId: TENANT_ID,
      status: "ACTIVE",
    },
    select: {
      id: true,
      code: true,
      name: true,
      isHeadOffice: true,
      status: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log("");
  console.log("=== ACTIVE BRANCHES ===");
  console.log(branches);

  const fiscalPeriods =
    await prisma.fiscalPeriod.findMany({
      where: {
        tenantId: TENANT_ID,
        status: "OPEN",
        fiscalYear: {
          status: "OPEN",
        },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        fiscalYear: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
      },
      orderBy: {
        startDate: "asc",
      },
    });

  console.log("");
  console.log("=== OPEN FISCAL PERIODS ===");
  console.log(fiscalPeriods);

  const customers = await prisma.customer.findMany({
    where: {
      tenantId: TENANT_ID,
      status: "ACTIVE",
    },
    select: {
      id: true,
      customerCode: true,
      name: true,
      currencyCode: true,
      status: true,
    },
    take: 10,
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log("");
  console.log("=== ACTIVE CUSTOMERS ===");
  console.log(customers);

  const mappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
        purpose: {
          in: [
            "ACCOUNTS_RECEIVABLE",
            "SALES_REVENUE",
            "OUTPUT_TAX",
          ],
        },
      },
      select: {
        purpose: true,
        accountId: true,
        account: {
          select: {
            code: true,
            name: true,
            type: true,
            normalBalance: true,
            isControlAccount: true,
            allowManualPosting: true,
            status: true,
          },
        },
      },
      orderBy: {
        purpose: "asc",
      },
    });

  console.log("");
  console.log("=== SALES/AR ACCOUNT MAPPINGS ===");
  console.log(mappings);

  const users = await prisma.user.findMany({
    where: {
      memberships: {
        some: {
          tenantId: TENANT_ID,
          status: "ACTIVE",
        },
      },
    },
    select: {
      id: true,
      clerkId: true,
    },
    take: 5,
  });

  console.log("");
  console.log("=== ELIGIBLE INTERNAL USERS ===");
  console.log(users);

  console.log("");
  console.log("=== CURRENT DATA COUNTS ===");

  const [
    invoiceCount,
    ledgerCount,
    journalCount,
  ] = await Promise.all([
    prisma.invoice.count({
      where: { tenantId: TENANT_ID },
    }),
    prisma.customerLedgerEntry.count({
      where: { tenantId: TENANT_ID },
    }),
    prisma.journalEntry.count({
      where: { tenantId: TENANT_ID },
    }),
  ]);

  console.log({
    invoiceCount,
    customerLedgerEntryCount: ledgerCount,
    journalCount,
  });

  console.log("");
  console.log("=== PREFLIGHT ASSESSMENT ===");

  let failures = 0;

  if (
    tenant.status !== "TRIAL" &&
    tenant.status !== "ACTIVE"
  ) {
    failures += 1;
    console.error(
      "FAIL tenant is not operational",
    );
  } else {
    console.log("PASS operational tenant");
  }

  if (branches.length === 0) {
    failures += 1;
    console.error("FAIL no active branch");
  } else {
    console.log("PASS active branch available");
  }

  if (fiscalPeriods.length === 0) {
    failures += 1;
    console.error(
      "FAIL no open fiscal period",
    );
  } else {
    console.log("PASS open fiscal period available");
  }

  if (customers.length === 0) {
    console.log(
      "INFO no active customer; behavioral test must create its own temporary customer.",
    );
  } else {
    console.log(
      "PASS active customer available",
    );
  }

  const requiredPurposes = new Set([
    "ACCOUNTS_RECEIVABLE",
    "SALES_REVENUE",
    "OUTPUT_TAX",
  ]);

  for (const mapping of mappings) {
    requiredPurposes.delete(mapping.purpose);
  }

  if (requiredPurposes.size > 0) {
    failures += 1;
    console.error(
      "FAIL missing mappings:",
      [...requiredPurposes],
    );
  } else {
    console.log(
      "PASS required Sales/AR mappings available",
    );
  }

  if (users.length === 0) {
    failures += 1;
    console.error(
      "FAIL no eligible internal posting user",
    );
  } else {
    console.log(
      "PASS eligible posting user available",
    );
  }

  console.log("");
  console.log("=== FINAL RESULT ===");

  if (failures > 0) {
    console.error(
      `15Q.10D TEST FIXTURE PREFLIGHT: FAILED (${failures} issue(s))`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    "15Q.10D TEST FIXTURE PREFLIGHT: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.10D TEST FIXTURE PREFLIGHT: ERROR",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });