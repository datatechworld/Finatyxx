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
const BEFORE_LEDGER = "2098-01-01";

function money(
  value: Prisma.Decimal,
): string {
  return value.toFixed(4);
}

function assertDecimalEquals(
  actual: Prisma.Decimal,
  expected: string,
  label: string,
): void {
  const expectedDecimal =
    new Prisma.Decimal(expected);

  if (!actual.equals(expectedDecimal)) {
    throw new Error(
      `${label}: expected ${expectedDecimal.toFixed(4)}, got ${actual.toFixed(4)}.`,
    );
  }

  console.log(
    `${label}: PASS (${actual.toFixed(4)})`,
  );
}

function assertTrue(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectReportingError(
  label: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (
      error instanceof
      FinancialReportingError
    ) {
      console.log(
        `${label}: PASS`,
      );

      console.log(
        `  ${error.message}`,
      );

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
    "=== 15U.3 FINANCIAL REPORTING BEHAVIORAL VERIFICATION ===",
  );

  console.log(
    "DATABASE MUTATIONS: NONE",
  );

  /*
   * ---------------------------------------------------------
   * TRIAL BALANCE
   * ---------------------------------------------------------
   */

  const trialBalance =
    await getTrialBalance({
      tenantId: TENANT_ID,
      asOfDate: REPORT_END,
    });

  console.log("");
  console.log("=== TRIAL BALANCE ===");

  console.log({
    currencyCode:
      trialBalance.currencyCode,
    asOfDate:
      trialBalance.asOfDate,
    lineCount:
      trialBalance.lines.length,
    totalDebit:
      money(trialBalance.totalDebit),
    totalCredit:
      money(trialBalance.totalCredit),
    difference:
      money(trialBalance.difference),
  });

  for (
    const line of
    trialBalance.lines
  ) {
    console.log({
      code: line.code,
      name: line.name,
      type: line.type,
      movementDebit:
        money(line.movementDebit),
      movementCredit:
        money(line.movementCredit),
      balanceDebit:
        money(line.balanceDebit),
      balanceCredit:
        money(line.balanceCredit),
    });
  }

  assertTrue(
    trialBalance.currencyCode ===
      "GHS",
    "Trial Balance currency must be GHS.",
  );

  assertDecimalEquals(
    trialBalance.difference,
    "0",
    "Trial Balance difference",
  );

  /*
   * The discovery total 6230.3000 / 6230.3000 represented
   * gross ledger movements.
   *
   * A conventional Trial Balance presents each account's
   * ending net debit OR ending net credit balance.
   *
   * Therefore:
   *
   * gross movements:
   *   debit  = 6230.3000
   *   credit = 6230.3000
   *
   * ending Trial Balance:
   *   debit  = 2499.7000
   *   credit = 2499.7000
   */

  assertDecimalEquals(
    trialBalance.totalDebit,
    "2499.7000",
    "Trial Balance total debit",
  );

  assertDecimalEquals(
    trialBalance.totalCredit,
    "2499.7000",
    "Trial Balance total credit",
  );

  const bank =
    trialBalance.lines.find(
      (line) => line.code === "1110",
    );

  assertTrue(
    Boolean(bank),
    "Bank account 1110 missing from Trial Balance.",
  );

  assertDecimalEquals(
    bank!.balanceCredit,
    "1150.0000",
    "Bank ending credit balance",
  );

  const accountsReceivable =
    trialBalance.lines.find(
      (line) => line.code === "1200",
    );

  assertTrue(
    Boolean(accountsReceivable),
    "Accounts Receivable 1200 missing.",
  );

  assertDecimalEquals(
    accountsReceivable!.balanceCredit,
    "230.0000",
    "Accounts Receivable ending credit balance",
  );

  const inventory =
    trialBalance.lines.find(
      (line) => line.code === "1300",
    );

  assertTrue(
    Boolean(inventory),
    "Inventory 1300 missing.",
  );

  assertDecimalEquals(
    inventory!.balanceDebit,
    "1000.0000",
    "Inventory ending debit balance",
  );

  const accountsPayable =
    trialBalance.lines.find(
      (line) => line.code === "2100",
    );

  assertTrue(
    Boolean(accountsPayable),
    "Accounts Payable 2100 missing.",
  );

  assertDecimalEquals(
    accountsPayable!.balanceDebit,
    "0",
    "Accounts Payable ending debit balance",
  );

  assertDecimalEquals(
    accountsPayable!.balanceCredit,
    "0",
    "Accounts Payable ending credit balance",
  );

  /*
   * ---------------------------------------------------------
   * PROFIT AND LOSS
   * ---------------------------------------------------------
   */

  const profitAndLoss =
    await getProfitAndLoss({
      tenantId: TENANT_ID,
      startDate: REPORT_START,
      endDate: REPORT_END,
    });

  console.log("");
  console.log(
    "=== PROFIT AND LOSS ===",
  );

  console.log({
    currencyCode:
      profitAndLoss.currencyCode,
    startDate:
      profitAndLoss.startDate,
    endDate:
      profitAndLoss.endDate,
    totalRevenue:
      money(
        profitAndLoss.totalRevenue,
      ),
    totalExpenses:
      money(
        profitAndLoss.totalExpenses,
      ),
    netProfit:
      money(
        profitAndLoss.netProfit,
      ),
  });

  console.log("Revenue lines:");

  for (
    const line of
    profitAndLoss.revenue
  ) {
    console.log({
      code: line.code,
      name: line.name,
      amount: money(line.amount),
    });
  }

  console.log("Expense lines:");

  for (
    const line of
    profitAndLoss.expenses
  ) {
    console.log({
      code: line.code,
      name: line.name,
      amount: money(line.amount),
    });
  }

  assertDecimalEquals(
    profitAndLoss.totalRevenue,
    "800.0000",
    "P&L total revenue",
  );

  assertDecimalEquals(
    profitAndLoss.totalExpenses,
    "1000.0000",
    "P&L total expenses",
  );

  assertDecimalEquals(
    profitAndLoss.netProfit,
    "-200.0000",
    "P&L net profit/loss",
  );

  const salesRevenue =
    profitAndLoss.revenue.find(
      (line) => line.code === "4100",
    );

  assertTrue(
    Boolean(salesRevenue),
    "Sales Revenue 4100 missing.",
  );

  assertDecimalEquals(
    salesRevenue!.amount,
    "1000.0000",
    "Sales Revenue amount",
  );

  const salesReturns =
    profitAndLoss.revenue.find(
      (line) => line.code === "4200",
    );

  assertTrue(
    Boolean(salesReturns),
    "Sales Returns 4200 missing.",
  );

  assertDecimalEquals(
    salesReturns!.amount,
    "-200.0000",
    "Sales Returns contra-revenue",
  );

  const operatingExpense =
    profitAndLoss.expenses.find(
      (line) => line.code === "6200",
    );

  assertTrue(
    Boolean(operatingExpense),
    "General Operating Expenses 6200 missing.",
  );

  assertDecimalEquals(
    operatingExpense!.amount,
    "1000.0000",
    "General Operating Expenses amount",
  );

  /*
   * ---------------------------------------------------------
   * BALANCE SHEET
   * ---------------------------------------------------------
   */

  const balanceSheet =
    await getBalanceSheet({
      tenantId: TENANT_ID,
      asOfDate: REPORT_END,
    });

  console.log("");
  console.log(
    "=== BALANCE SHEET ===",
  );

  console.log({
    currencyCode:
      balanceSheet.currencyCode,
    asOfDate:
      balanceSheet.asOfDate,
    totalAssets:
      money(
        balanceSheet.totalAssets,
      ),
    totalLiabilities:
      money(
        balanceSheet.totalLiabilities,
      ),
    postedEquity:
      money(
        balanceSheet.postedEquity,
      ),
    unclosedEarnings:
      money(
        balanceSheet.unclosedEarnings,
      ),
    totalEquity:
      money(
        balanceSheet.totalEquity,
      ),
    liabilitiesAndEquity:
      money(
        balanceSheet.liabilitiesAndEquity,
      ),
    difference:
      money(
        balanceSheet.difference,
      ),
  });

  assertDecimalEquals(
    balanceSheet.totalAssets,
    "-79.7000",
    "Balance Sheet total assets",
  );

  assertDecimalEquals(
    balanceSheet.totalLiabilities,
    "120.3000",
    "Balance Sheet total liabilities",
  );

  assertDecimalEquals(
    balanceSheet.postedEquity,
    "0",
    "Balance Sheet posted equity",
  );

  assertDecimalEquals(
    balanceSheet.unclosedEarnings,
    "-200.0000",
    "Balance Sheet unclosed earnings",
  );

  assertDecimalEquals(
    balanceSheet.totalEquity,
    "-200.0000",
    "Balance Sheet total equity",
  );

  assertDecimalEquals(
    balanceSheet.liabilitiesAndEquity,
    "-79.7000",
    "Balance Sheet liabilities + equity",
  );

  assertDecimalEquals(
    balanceSheet.difference,
    "0",
    "Balance Sheet difference",
  );

  /*
   * ---------------------------------------------------------
   * EMPTY / PRE-LEDGER DATE
   * ---------------------------------------------------------
   */

  const emptyTrialBalance =
    await getTrialBalance({
      tenantId: TENANT_ID,
      asOfDate: BEFORE_LEDGER,
    });

  assertDecimalEquals(
    emptyTrialBalance.totalDebit,
    "0",
    "Pre-ledger Trial Balance debit",
  );

  assertDecimalEquals(
    emptyTrialBalance.totalCredit,
    "0",
    "Pre-ledger Trial Balance credit",
  );

  assertDecimalEquals(
    emptyTrialBalance.difference,
    "0",
    "Pre-ledger Trial Balance difference",
  );

  /*
   * ---------------------------------------------------------
   * DATE VALIDATION
   * ---------------------------------------------------------
   */

  console.log("");
  console.log(
    "=== DATE VALIDATION ===",
  );

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
    "P&L reversed date range",
    () =>
      getProfitAndLoss({
        tenantId: TENANT_ID,
        startDate: "2098-12-31",
        endDate: "2098-01-01",
      }),
  );

  console.log("");
  console.log(
    "=== 15U.3 FINAL RESULT ===",
  );

  console.log(
    "Trial Balance: PASS",
  );

  console.log(
    "Profit & Loss: PASS",
  );

  console.log(
    "Balance Sheet: PASS",
  );

  console.log(
    "Date validation: PASS",
  );

  console.log(
    "DATABASE MUTATIONS: NONE",
  );

  console.log(
    "15U.3 FINANCIAL REPORTING BEHAVIORAL VERIFICATION: PASS",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "15U.3 FINANCIAL REPORTING BEHAVIORAL VERIFICATION: FAIL",
  );

  console.error(error);

  console.error(
    "DATABASE MUTATIONS: NONE",
  );

  process.exitCode = 1;
});