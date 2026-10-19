import { Prisma } from "./src/generated/prisma/client.js";
import {
  FinancialReportingError,
  getBalanceSheet,
  getProfitAndLoss,
  getTrialBalance,
} from "./src/modules/accounting/financial-reporting.service.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const REPORT_START = "2098-01-01";
const REPORT_END = "2098-12-31";
const PRE_LEDGER_DATE = "2098-01-01";

const ZERO = new Prisma.Decimal(0);

function money(value: Prisma.Decimal): string {
  return value.toFixed(4);
}

function assertDecimal(
  actual: Prisma.Decimal,
  expected: Prisma.Decimal | string,
  label: string,
): void {
  const expectedDecimal =
    expected instanceof Prisma.Decimal
      ? expected
      : new Prisma.Decimal(expected);

  if (!actual.equals(expectedDecimal)) {
    throw new Error(
      `${label}: expected ${money(expectedDecimal)}, got ${money(actual)}.`,
    );
  }

  console.log(`${label}: PASS (${money(actual)})`);
}

function assertTrue(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`${message}: PASS`);
}

function sum(
  values: Prisma.Decimal[],
): Prisma.Decimal {
  return values.reduce(
    (total, value) => total.plus(value),
    ZERO,
  );
}

async function expectReportingError(
  label: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof FinancialReportingError) {
      console.log(`${label}: PASS`);
      console.log(`  ${error.message}`);
      return;
    }

    throw error;
  }

  throw new Error(
    `${label}: expected FinancialReportingError.`,
  );
}

async function main(): Promise<void> {
  console.log(
    "=== 15U.3A FINANCIAL REPORTING FINAL VERIFICATION ===",
  );
  console.log("DATABASE MUTATIONS: NONE");

  /*
   * TRIAL BALANCE
   */

  const tb = await getTrialBalance({
    tenantId: TENANT_ID,
    asOfDate: REPORT_END,
  });

  console.log("");
  console.log("=== TRIAL BALANCE ===");
  console.log({
    currencyCode: tb.currencyCode,
    asOfDate: tb.asOfDate,
    lineCount: tb.lines.length,
    totalDebit: money(tb.totalDebit),
    totalCredit: money(tb.totalCredit),
    difference: money(tb.difference),
  });

  assertTrue(
    tb.currencyCode === "GHS",
    "Trial Balance currency is GHS",
  );

  assertDecimal(
    tb.totalDebit,
    "2699.7000",
    "Trial Balance total debit",
  );

  assertDecimal(
    tb.totalCredit,
    "2699.7000",
    "Trial Balance total credit",
  );

  assertDecimal(
    tb.difference,
    "0",
    "Trial Balance difference",
  );

  const grossDebit = sum(
    tb.lines.map((line) => line.movementDebit),
  );

  const grossCredit = sum(
    tb.lines.map((line) => line.movementCredit),
  );

  assertDecimal(
    grossDebit,
    "6230.3000",
    "Gross POSTED ledger debit",
  );

  assertDecimal(
    grossCredit,
    "6230.3000",
    "Gross POSTED ledger credit",
  );

  assertDecimal(
    grossDebit.minus(grossCredit),
    "0",
    "Gross POSTED ledger difference",
  );

  /*
   * IMPORTANT ACCOUNT BALANCES
   */

  const account = (code: string) => {
    const line = tb.lines.find(
      (candidate) => candidate.code === code,
    );

    if (!line) {
      throw new Error(
        `Required account ${code} missing from Trial Balance.`,
      );
    }

    return line;
  };

  assertDecimal(
    account("1110").balanceCredit,
    "1150",
    "Bank 1110 credit balance",
  );

  assertDecimal(
    account("1200").balanceCredit,
    "230",
    "Accounts Receivable 1200 credit balance",
  );

  assertDecimal(
    account("1300").balanceDebit,
    "1000",
    "Inventory 1300 debit balance",
  );

  assertDecimal(
    account("1400").balanceDebit,
    "300",
    "Input Tax 1400 debit balance",
  );

  assertDecimal(
    account("2100").balanceDebit,
    "0",
    "Accounts Payable 2100 debit balance",
  );

  assertDecimal(
    account("2100").balanceCredit,
    "0",
    "Accounts Payable 2100 credit balance",
  );

  assertDecimal(
    account("2200").balanceCredit,
    "120",
    "Output Tax 2200 credit balance",
  );

  /*
   * PROFIT & LOSS
   */

  const pnl = await getProfitAndLoss({
    tenantId: TENANT_ID,
    startDate: REPORT_START,
    endDate: REPORT_END,
  });

  console.log("");
  console.log("=== PROFIT & LOSS ===");
  console.log({
    currencyCode: pnl.currencyCode,
    totalRevenue: money(pnl.totalRevenue),
    totalExpenses: money(pnl.totalExpenses),
    netProfit: money(pnl.netProfit),
  });

  assertDecimal(
    pnl.totalRevenue,
    "800",
    "P&L total revenue",
  );

  assertDecimal(
    pnl.totalExpenses,
    "1000",
    "P&L total expenses",
  );

  assertDecimal(
    pnl.netProfit,
    "-200",
    "P&L net profit/loss",
  );

  const salesRevenue =
    pnl.revenue.find(
      (line) => line.code === "4100",
    );

  assertTrue(
    Boolean(salesRevenue),
    "Sales Revenue 4100 exists",
  );

  assertDecimal(
    salesRevenue!.amount,
    "1000",
    "Sales Revenue 4100",
  );

  const salesReturns =
    pnl.revenue.find(
      (line) => line.code === "4200",
    );

  assertTrue(
    Boolean(salesReturns),
    "Sales Returns 4200 exists",
  );

  assertDecimal(
    salesReturns!.amount,
    "-200",
    "Sales Returns 4200 contra-revenue",
  );

  const operatingExpense =
    pnl.expenses.find(
      (line) => line.code === "6200",
    );

  assertTrue(
    Boolean(operatingExpense),
    "Operating Expense 6200 exists",
  );

  assertDecimal(
    operatingExpense!.amount,
    "1000",
    "Operating Expense 6200",
  );

  /*
   * BALANCE SHEET
   *
   * Derive expected totals independently from Trial Balance.
   */

  const expectedAssets = sum(
    tb.lines
      .filter((line) => line.type === "ASSET")
      .map(
        (line) =>
          line.balanceDebit.minus(
            line.balanceCredit,
          ),
      ),
  );

  const expectedLiabilities = sum(
    tb.lines
      .filter((line) => line.type === "LIABILITY")
      .map(
        (line) =>
          line.balanceCredit.minus(
            line.balanceDebit,
          ),
      ),
  );

  const expectedPostedEquity = sum(
    tb.lines
      .filter((line) => line.type === "EQUITY")
      .map(
        (line) =>
          line.balanceCredit.minus(
            line.balanceDebit,
          ),
      ),
  );

  const bs = await getBalanceSheet({
    tenantId: TENANT_ID,
    asOfDate: REPORT_END,
  });

  console.log("");
  console.log("=== BALANCE SHEET ===");
  console.log({
    currencyCode: bs.currencyCode,
    totalAssets: money(bs.totalAssets),
    totalLiabilities: money(bs.totalLiabilities),
    postedEquity: money(bs.postedEquity),
    unclosedEarnings: money(bs.unclosedEarnings),
    totalEquity: money(bs.totalEquity),
    liabilitiesAndEquity:
      money(bs.liabilitiesAndEquity),
    difference: money(bs.difference),
  });

  assertDecimal(
    bs.totalAssets,
    expectedAssets,
    "Balance Sheet assets agree with Trial Balance",
  );

  assertDecimal(
    bs.totalLiabilities,
    expectedLiabilities,
    "Balance Sheet liabilities agree with Trial Balance",
  );

  assertDecimal(
    bs.postedEquity,
    expectedPostedEquity,
    "Balance Sheet posted equity agrees with Trial Balance",
  );

  assertDecimal(
    bs.unclosedEarnings,
    pnl.netProfit,
    "Balance Sheet unclosed earnings agree with P&L",
  );

  assertDecimal(
    bs.totalEquity,
    bs.postedEquity.plus(bs.unclosedEarnings),
    "Balance Sheet total equity",
  );

  assertDecimal(
    bs.liabilitiesAndEquity,
    bs.totalLiabilities.plus(bs.totalEquity),
    "Balance Sheet liabilities + equity",
  );

  assertDecimal(
    bs.totalAssets,
    bs.liabilitiesAndEquity,
    "Accounting equation",
  );

  assertDecimal(
    bs.difference,
    "0",
    "Balance Sheet difference",
  );

  /*
   * PRE-LEDGER / EMPTY REPORT
   */

  const emptyTb = await getTrialBalance({
    tenantId: TENANT_ID,
    asOfDate: PRE_LEDGER_DATE,
  });

  assertDecimal(
    emptyTb.totalDebit,
    "0",
    "Pre-ledger Trial Balance debit",
  );

  assertDecimal(
    emptyTb.totalCredit,
    "0",
    "Pre-ledger Trial Balance credit",
  );

  assertDecimal(
    emptyTb.difference,
    "0",
    "Pre-ledger Trial Balance difference",
  );

  /*
   * INPUT VALIDATION
   */

  console.log("");
  console.log("=== DATE VALIDATION ===");

  await expectReportingError(
    "Invalid calendar date",
    () =>
      getTrialBalance({
        tenantId: TENANT_ID,
        asOfDate: "2098-02-30",
      }),
  );

  await expectReportingError(
    "Invalid date format",
    () =>
      getTrialBalance({
        tenantId: TENANT_ID,
        asOfDate: "30-06-2098",
      }),
  );

  await expectReportingError(
    "Reversed P&L date range",
    () =>
      getProfitAndLoss({
        tenantId: TENANT_ID,
        startDate: "2098-12-31",
        endDate: "2098-01-01",
      }),
  );

  console.log("");
  console.log("================================================");
  console.log("15U.3A FINAL RESULT");
  console.log("================================================");
  console.log("Trial Balance: PASS");
  console.log("Gross ledger reconciliation: PASS");
  console.log("Profit & Loss: PASS");
  console.log("Balance Sheet: PASS");
  console.log("Accounting equation: PASS");
  console.log("Date validation: PASS");
  console.log("DATABASE MUTATIONS: NONE");
  console.log(
    "15U.3A FINANCIAL REPORTING FINAL VERIFICATION: PASS",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "15U.3A FINANCIAL REPORTING FINAL VERIFICATION: FAIL",
  );
  console.error(error);
  console.error("DATABASE MUTATIONS: NONE");
  process.exitCode = 1;
});