import { prisma } from "./src/db/prisma.ts";

const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";

const [fiscalYears, fiscalPeriods, accounts, journals, sequences] =
  await Promise.all([
    prisma.fiscalYear.count({
      where: {
        tenantId: TENANT_ID,
        startDate: { lte: new Date("2099-12-31T00:00:00.000Z") },
        endDate: { gte: new Date("2099-01-01T00:00:00.000Z") },
      },
    }),

    prisma.fiscalPeriod.count({
      where: {
        tenantId: TENANT_ID,
        startDate: { lte: new Date("2099-12-31T00:00:00.000Z") },
        endDate: { gte: new Date("2099-01-01T00:00:00.000Z") },
      },
    }),

    prisma.account.count({
      where: {
        tenantId: TENANT_ID,
        code: { startsWith: "GLC-2099-" },
      },
    }),

    prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "GL_TEST_CONCURRENT",
      },
    }),

    prisma.documentSequence.count({
      where: {
        tenantId: TENANT_ID,
        branchId: null,
        documentType: "JOURNAL",
        year: 2099,
      },
    }),
  ]);

console.log("15P.6 residue verification");
console.log(`Fiscal years: ${fiscalYears}`);
console.log(`Fiscal periods: ${fiscalPeriods}`);
console.log(`Fixture accounts: ${accounts}`);
console.log(`Concurrent test journals: ${journals}`);
console.log(`2099 JOURNAL sequences: ${sequences}`);

await prisma.$disconnect();