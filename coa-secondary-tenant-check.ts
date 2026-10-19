import { prisma } from "./src/db/prisma.ts";

const primaryTenantId = "9af89483-476a-4367-99b0-8cc15abc0011";

try {
  const tenants = await prisma.tenant.findMany({
    where: {
      id: {
        not: primaryTenantId,
      },
    },
    select: {
      id: true,
      legalName: true,
      tradingName: true,
      slug: true,
      status: true,
    },
    take: 5,
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log("Finatyx — Secondary Tenant Pretest");
  console.log("==================================");
  console.log(`Secondary tenants found: ${tenants.length}`);

  for (const tenant of tenants) {
    console.log(
      `${tenant.id} | ${tenant.legalName} | ${tenant.slug} | ${tenant.status}`
    );
  }
} finally {
  await prisma.$disconnect();
}