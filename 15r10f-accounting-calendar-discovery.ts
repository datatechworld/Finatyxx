import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

async function main(): Promise<void> {
  console.log(
    "=== 15R.10F ACCOUNTING CALENDAR DISCOVERY ===",
  );

  const fiscalYears =
    await prisma.fiscalYear.findMany({
      where: {
        tenantId: TENANT_ID,
      },
      orderBy: {
        startDate: "asc",
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        closedAt: true,
        periods: {
          orderBy: {
            periodNumber: "asc",
          },
          select: {
            id: true,
            periodNumber: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
      },
    });

  console.log("");
  console.log("ALL FISCAL YEARS / PERIODS");
  console.dir(
    fiscalYears,
    { depth: null },
  );

  const openYears =
    fiscalYears.filter(
      (year) => year.status === "OPEN",
    );

  const openCandidates =
    openYears.flatMap((year) =>
      year.periods
        .filter(
          (period) =>
            period.status === "OPEN",
        )
        .map((period) => ({
          fiscalYearId: year.id,
          fiscalYearName: year.name,
          fiscalYearStartDate:
            year.startDate,
          fiscalYearEndDate:
            year.endDate,

          fiscalPeriodId:
            period.id,
          periodNumber:
            period.periodNumber,
          fiscalPeriodName:
            period.name,
          periodStartDate:
            period.startDate,
          periodEndDate:
            period.endDate,
        })),
    );

  console.log("");
  console.log("OPEN YEAR + OPEN PERIOD CANDIDATES");
  console.dir(
    openCandidates,
    { depth: null },
  );

  console.log("");
  console.log("SUMMARY");
  console.dir(
    {
      fiscalYearCount:
        fiscalYears.length,

      openFiscalYearCount:
        openYears.length,

      openYearAndPeriodCandidateCount:
        openCandidates.length,
    },
    { depth: null },
  );

  console.log("");
  console.log(
    "15R.10F ACCOUNTING CALENDAR DISCOVERY: PASS",
  );

  console.log("Database mutations: NONE");
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15R.10F ACCOUNTING CALENDAR DISCOVERY: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });