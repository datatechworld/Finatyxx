import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const INVENTORY_CODE = "1300";
const INPUT_TAX_CODE = "1400";

async function main(): Promise<void> {
  console.log(
    "=== 15R.4 AP ACCOUNTING FOUNDATION ===",
  );

  // ----------------------------------------------------------
  // PRE-MUTATION COLLISION CHECK
  // ----------------------------------------------------------

  const existingAccounts =
    await prisma.account.findMany({
      where: {
        tenantId: TENANT_ID,
        code: {
          in: [
            INVENTORY_CODE,
            INPUT_TAX_CODE,
          ],
        },
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

  const existingMappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
        purpose: {
          in: [
            "INVENTORY",
            "INPUT_TAX",
          ],
        },
      },
      select: {
        id: true,
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

  console.log("");
  console.log("PRE-MUTATION STATE");

  console.dir({
    existingAccounts,
    existingMappings,
  }, {
    depth: null,
  });

  if (existingAccounts.length !== 0) {
    throw new Error(
      "ACCOUNT_CODE_COLLISION_1300_OR_1400",
    );
  }

  if (existingMappings.length !== 0) {
    throw new Error(
      "INVENTORY_OR_INPUT_TAX_MAPPING_ALREADY_EXISTS",
    );
  }

  // ----------------------------------------------------------
  // ATOMIC FOUNDATION CREATION
  // ----------------------------------------------------------

  const result =
    await prisma.$transaction(
      async (tx) => {
        const inventory =
          await tx.account.create({
            data: {
              tenantId: TENANT_ID,
              code: INVENTORY_CODE,
              name: "Inventory",
              type: "ASSET",
              normalBalance: "DEBIT",
              isControlAccount: true,
              allowManualPosting: false,
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
          });

        const inputTax =
          await tx.account.create({
            data: {
              tenantId: TENANT_ID,
              code: INPUT_TAX_CODE,
              name: "Input Tax Receivable",
              type: "ASSET",
              normalBalance: "DEBIT",
              isControlAccount: true,
              allowManualPosting: false,
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
          });

        const inventoryMapping =
          await tx.systemAccountMapping.create({
            data: {
              tenantId: TENANT_ID,
              purpose: "INVENTORY",
              accountId: inventory.id,
            },
            select: {
              id: true,
              purpose: true,
              accountId: true,
            },
          });

        const inputTaxMapping =
          await tx.systemAccountMapping.create({
            data: {
              tenantId: TENANT_ID,
              purpose: "INPUT_TAX",
              accountId: inputTax.id,
            },
            select: {
              id: true,
              purpose: true,
              accountId: true,
            },
          });

        return {
          inventory,
          inputTax,
          inventoryMapping,
          inputTaxMapping,
        };
      },
      {
        isolationLevel: "Serializable",
      },
    );

  console.log("");
  console.log("CREATED");
  console.dir(
    result,
    { depth: null },
  );

  // ----------------------------------------------------------
  // POST-COMMIT VERIFICATION
  // ----------------------------------------------------------

  const verifiedAccounts =
    await prisma.account.findMany({
      where: {
        tenantId: TENANT_ID,
        code: {
          in: [
            INVENTORY_CODE,
            INPUT_TAX_CODE,
          ],
        },
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

  const verifiedMappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
        purpose: {
          in: [
            "INVENTORY",
            "INPUT_TAX",
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

  if (verifiedAccounts.length !== 2) {
    throw new Error(
      "ACCOUNT_VERIFICATION_FAILED",
    );
  }

  if (verifiedMappings.length !== 2) {
    throw new Error(
      "MAPPING_VERIFICATION_FAILED",
    );
  }

  const inventory =
    verifiedAccounts.find(
      (account) =>
        account.code === INVENTORY_CODE,
    );

  const inputTax =
    verifiedAccounts.find(
      (account) =>
        account.code === INPUT_TAX_CODE,
    );

  if (!inventory) {
    throw new Error(
      "INVENTORY_ACCOUNT_MISSING_AFTER_COMMIT",
    );
  }

  if (!inputTax) {
    throw new Error(
      "INPUT_TAX_ACCOUNT_MISSING_AFTER_COMMIT",
    );
  }

  if (
    inventory.name !== "Inventory" ||
    inventory.type !== "ASSET" ||
    inventory.normalBalance !== "DEBIT" ||
    !inventory.isControlAccount ||
    inventory.allowManualPosting ||
    inventory.status !== "ACTIVE"
  ) {
    throw new Error(
      "INVENTORY_ACCOUNT_CONTRACT_FAILED",
    );
  }

  if (
    inputTax.name !== "Input Tax Receivable" ||
    inputTax.type !== "ASSET" ||
    inputTax.normalBalance !== "DEBIT" ||
    !inputTax.isControlAccount ||
    inputTax.allowManualPosting ||
    inputTax.status !== "ACTIVE"
  ) {
    throw new Error(
      "INPUT_TAX_ACCOUNT_CONTRACT_FAILED",
    );
  }

  const inventoryMapping =
    verifiedMappings.find(
      (mapping) =>
        mapping.purpose === "INVENTORY",
    );

  const inputTaxMapping =
    verifiedMappings.find(
      (mapping) =>
        mapping.purpose === "INPUT_TAX",
    );

  if (
    !inventoryMapping ||
    inventoryMapping.accountId !== inventory.id
  ) {
    throw new Error(
      "INVENTORY_MAPPING_CONTRACT_FAILED",
    );
  }

  if (
    !inputTaxMapping ||
    inputTaxMapping.accountId !== inputTax.id
  ) {
    throw new Error(
      "INPUT_TAX_MAPPING_CONTRACT_FAILED",
    );
  }

  console.log("");
  console.log("VERIFIED ACCOUNTS");
  console.dir(
    verifiedAccounts,
    { depth: null },
  );

  console.log("");
  console.log("VERIFIED MAPPINGS");
  console.dir(
    verifiedMappings,
    { depth: null },
  );

  console.log("");
  console.log(
    "15R.4 AP ACCOUNTING FOUNDATION: PASS",
  );

  console.log(
    "Accounting foundation committed successfully.",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.4 AP ACCOUNTING FOUNDATION: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });