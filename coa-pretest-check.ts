import { prisma } from "./src/db/prisma.ts";

const tenantId = "9af89483-476a-4367-99b0-8cc15abc0011";

try {
  const tenant = await prisma.tenant.findUnique({
    where: {
      id: tenantId,
    },
    select: {
      id: true,
      legalName: true,
      tradingName: true,
      slug: true,
      status: true,
      _count: {
        select: {
          accounts: true,
        },
      },
    },
  });

  if (!tenant) {
    console.log("TEST TENANT NOT FOUND");
    process.exitCode = 1;
  } else {
    console.log("Finatyx — Chart of Accounts Pretest");
    console.log("==================================");
    console.log(`Tenant ID:       ${tenant.id}`);
    console.log(`Legal name:      ${tenant.legalName}`);
    console.log(`Trading name:    ${tenant.tradingName ?? "(none)"}`);
    console.log(`Slug:            ${tenant.slug}`);
    console.log(`Status:          ${tenant.status}`);
    console.log(`Existing accounts: ${tenant._count.accounts}`);
  }
} finally {
  await prisma.$disconnect();
}