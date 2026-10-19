import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main(): Promise<void> {
  console.log(
    "=== 15R.3 READ-ONLY ACCOUNT DISCOVERY ===",
  );

  const accounts =
    await prisma.account.findMany({
      where: {
        tenantId: TENANT_ID,
        status: "ACTIVE",
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        normalBalance: true,
        isControlAccount: true,
        allowManualPosting: true,
        status: true,
      },
      orderBy: {
        code: "asc",
      },
    });

  const mappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      select: {
        purpose: true,
        accountId: true,
        account: {
          select: {
            code: true,
            name: true,
          },
        },
      },
      orderBy: {
        purpose: "asc",
      },
    });

  const likelyInventory =
    accounts.filter((account) => {
      const text =
        `${account.code} ${account.name}`.toLowerCase();

      return (
        text.includes("inventory") ||
        text.includes("stock")
      );
    });

  const likelyInputTax =
    accounts.filter((account) => {
      const text =
        `${account.code} ${account.name}`.toLowerCase();

      return (
        text.includes("input tax") ||
        text.includes("input vat") ||
        text.includes("vat receivable") ||
        text.includes("tax receivable") ||
        text.includes("recoverable tax") ||
        text.includes("recoverable vat")
      );
    });

  console.log("");
  console.log("LIKELY INVENTORY ACCOUNTS");
  console.dir(
    likelyInventory,
    { depth: null },
  );

  console.log("");
  console.log("LIKELY INPUT TAX ACCOUNTS");
  console.dir(
    likelyInputTax,
    { depth: null },
  );

  console.log("");
  console.log("ALL ACTIVE ACCOUNTS");
  console.dir(
    accounts,
    { depth: null },
  );

  console.log("");
  console.log("CURRENT SYSTEM ACCOUNT MAPPINGS");
  console.dir(
    mappings,
    { depth: null },
  );

  console.log("");
  console.log("SUMMARY");
  console.dir({
    activeAccountCount:
      accounts.length,
    likelyInventoryCount:
      likelyInventory.length,
    likelyInputTaxCount:
      likelyInputTax.length,
    inventoryMappingExists:
      mappings.some(
        (mapping) =>
          mapping.purpose === "INVENTORY",
      ),
    inputTaxMappingExists:
      mappings.some(
        (mapping) =>
          mapping.purpose === "INPUT_TAX",
      ),
  });

  console.log("");
  console.log(
    "15R.3 READ-ONLY ACCOUNT DISCOVERY: PASS",
  );

  console.log(
    "Database mutations: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.3 READ-ONLY ACCOUNT DISCOVERY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });