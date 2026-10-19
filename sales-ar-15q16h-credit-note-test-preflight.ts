import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main(): Promise<void> {
  console.log(
    "=== 15Q.16H CREDIT NOTE TEST PREFLIGHT ===",
  );

  const tenant = await prisma.tenant.findUnique({
    where: {
      id: TENANT_ID,
    },
    select: {
      id: true,
      legalName: true,
      baseCurrencyCode: true,
    },
  });

  if (!tenant) {
    throw new Error("TEST_TENANT_NOT_FOUND");
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
      status: true,
    },
    orderBy: {
      code: "asc",
    },
  });

  const customers = await prisma.customer.findMany({
    where: {
      tenantId: TENANT_ID,
      status: "ACTIVE",
    },
    select: {
      id: true,
      customerCode: true,
      name: true,
      status: true,
    },
    orderBy: {
      customerCode: "asc",
    },
    take: 10,
  });

  /*
   * We deliberately exclude the permanently frozen
   * 15Q.10/15Q.13/15Q.14 invoice from consideration.
   */
  const frozenInvoiceId =
    "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

  const candidateInvoices =
    await prisma.invoice.findMany({
      where: {
        tenantId: TENANT_ID,
        id: {
          not: frozenInvoiceId,
        },
        status: {
          in: [
            "POSTED",
            "SENT",
            "PARTIALLY_PAID",
            "PAID",
            "OVERDUE",
          ],
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        branchId: true,
        customerId: true,
        invoiceDate: true,
        currencyCode: true,
        exchangeRate: true,
        subtotal: true,
        taxTotal: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        items: {
          select: {
            id: true,
            productId: true,
            description: true,
            quantity: true,
            unitPrice: true,
            taxAmount: true,
            lineSubtotal: true,
            lineTotal: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

  const existingCreditNotes =
    await prisma.creditNote.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        creditNoteNumber: true,
        invoiceId: true,
        customerId: true,
        branchId: true,
        subtotal: true,
        taxTotal: true,
        total: true,
        status: true,
        postedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

  const mappings =
    await prisma.systemAccountMapping.findMany({
      where: {
        tenantId: TENANT_ID,
        purpose: {
          in: [
            "ACCOUNTS_RECEIVABLE",
            "SALES_RETURNS",
            "OUTPUT_TAX",
          ],
        },
      },
      select: {
        purpose: true,
        account: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            normalBalance: true,
            status: true,
          },
        },
      },
      orderBy: {
        purpose: "asc",
      },
    });

  const frozenInvoice =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: frozenInvoiceId,
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        paidAt: true,
      },
    });

  console.log("");
  console.log("TENANT");
  console.dir(tenant, { depth: null });

  console.log("");
  console.log("ACTIVE BRANCHES");
  console.dir(branches, { depth: null });

  console.log("");
  console.log("ACTIVE CUSTOMERS");
  console.dir(customers, { depth: null });

  console.log("");
  console.log(
    "CANDIDATE INVOICES (FROZEN INVOICE EXCLUDED)",
  );
  console.dir(candidateInvoices, {
    depth: null,
  });

  console.log("");
  console.log("EXISTING CREDIT NOTES");
  console.dir(existingCreditNotes, {
    depth: null,
  });

  console.log("");
  console.log("REQUIRED ACCOUNT MAPPINGS");
  console.dir(mappings, { depth: null });

  console.log("");
  console.log(
    "FROZEN INVOICE — READ ONLY CONTROL",
  );
  console.dir(frozenInvoice, {
    depth: null,
  });

  const assertions = {
    tenantFound:
      tenant.id === TENANT_ID,

    baseCurrencyIsGhs:
      tenant.baseCurrencyCode === "GHS",

    activeBranchAvailable:
      branches.length >= 1,

    activeCustomerAvailable:
      customers.length >= 1,

    requiredMappingsPresent:
      mappings.length === 3,

    requiredMappingsActive:
      mappings.every(
        (mapping) =>
          mapping.account.status === "ACTIVE",
      ),

    frozenInvoicePreserved:
      frozenInvoice?.status === "PAID" &&
      frozenInvoice.total.toString() ===
        "1150" &&
      frozenInvoice.amountPaid.toString() ===
        "1150" &&
      frozenInvoice.balanceDue.toString() ===
        "0",
  };

  console.log("");
  console.log("ASSERTIONS");
  console.dir(assertions, {
    depth: null,
  });

  if (
    !Object.values(assertions).every(Boolean)
  ) {
    throw new Error(
      "15Q16H_PREFLIGHT_ASSERTION_FAILED",
    );
  }

  console.log("");
  console.log(
    "15Q.16H CREDIT NOTE TEST PREFLIGHT: PASS",
  );

  console.log(
    "Database changes: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.16H CREDIT NOTE TEST PREFLIGHT: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });