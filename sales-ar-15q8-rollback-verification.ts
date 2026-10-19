import { prisma } from "./src/db/prisma.ts";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";

const BASELINE_CODES = [
  "1000",
  "1100",
  "1110",
  "1200",
  "2000",
  "2100",
  "2200",
  "3000",
  "3100",
  "3200",
  "4000",
  "4100",
  "4200",
  "4300",
  "5000",
  "5100",
  "6000",
  "6100",
];

async function main() {
  console.log("=== 15Q.8 FAILED-TRANSACTION ROLLBACK VERIFICATION ===");
  console.log("");

  const [accounts, mappings, profile] = await Promise.all([
    prisma.account.findMany({
      where: {
        tenantId: TENANT_ID,
        code: {
          in: BASELINE_CODES,
        },
      },
      select: {
        code: true,
        name: true,
      },
      orderBy: {
        code: "asc",
      },
    }),

    prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      select: {
        purpose: true,
        accountId: true,
      },
      orderBy: {
        purpose: "asc",
      },
    }),

    prisma.accountingProfile.findUnique({
      where: {
        tenantId: TENANT_ID,
      },
      select: {
        framework: true,
        frameworkEdition: true,
        effectiveFrom: true,
      },
    }),
  ]);

  console.log("Bootstrap account rows found:", accounts.length);
  console.log("System mappings found:", mappings.length);
  console.log("Accounting profile found:", profile !== null);

  if (accounts.length > 0) {
    console.log("");
    console.log("Accounts unexpectedly present:");
    for (const account of accounts) {
      console.log(`  ${account.code} | ${account.name}`);
    }
  }

  if (mappings.length > 0) {
    console.log("");
    console.log("Mappings unexpectedly present:");
    for (const mapping of mappings) {
      console.log(`  ${mapping.purpose} -> ${mapping.accountId}`);
    }
  }

  if (profile) {
    console.log("");
    console.log("Accounting profile unexpectedly present:");
    console.log(`  Framework: ${profile.framework}`);
    console.log(`  Edition: ${profile.frameworkEdition}`);
    console.log(`  Effective from: ${profile.effectiveFrom.toISOString()}`);
  }

  console.log("");

  const clean =
    accounts.length === 0 &&
    mappings.length === 0 &&
    profile === null;

  if (!clean) {
    console.error("15Q.8 ROLLBACK VERIFICATION: FAILED");
    console.error(
      "The failed bootstrap left records behind. Do NOT rerun the bootstrap."
    );
    process.exitCode = 1;
    return;
  }

  console.log("15Q.8 ROLLBACK VERIFICATION: PASS");
  console.log("Failed bootstrap transaction left no baseline records.");
}

main()
  .catch((error) => {
    console.error("");
    console.error("15Q.8 ROLLBACK VERIFICATION: ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });