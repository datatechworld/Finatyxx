import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";

const ZERO = new Prisma.Decimal(0);

export class FinancialReportingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialReportingError";
  }
}

export interface TrialBalanceInput {
  tenantId: string;
  asOfDate: string;
}

export interface ProfitAndLossInput {
  tenantId: string;
  startDate: string;
  endDate: string;
}

export interface BalanceSheetInput {
  tenantId: string;
  asOfDate: string;
}

export interface TrialBalanceLine {
  accountId: string;
  code: string;
  name: string;
  type:
    | "ASSET"
    | "LIABILITY"
    | "EQUITY"
    | "REVENUE"
    | "EXPENSE";
  normalBalance: "DEBIT" | "CREDIT";
  movementDebit: Prisma.Decimal;
  movementCredit: Prisma.Decimal;
  balanceDebit: Prisma.Decimal;
  balanceCredit: Prisma.Decimal;
}

export interface TrialBalanceReport {
  tenantId: string;
  asOfDate: string;
  currencyCode: string;
  lines: TrialBalanceLine[];
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
  difference: Prisma.Decimal;
}

export interface ProfitAndLossLine {
  accountId: string;
  code: string;
  name: string;
  type: "REVENUE" | "EXPENSE";
  normalBalance: "DEBIT" | "CREDIT";
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  amount: Prisma.Decimal;
}

export interface ProfitAndLossReport {
  tenantId: string;
  startDate: string;
  endDate: string;
  currencyCode: string;
  revenue: ProfitAndLossLine[];
  expenses: ProfitAndLossLine[];
  totalRevenue: Prisma.Decimal;
  totalExpenses: Prisma.Decimal;
  netProfit: Prisma.Decimal;
}

export interface BalanceSheetLine {
  accountId: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY";
  normalBalance: "DEBIT" | "CREDIT";
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  amount: Prisma.Decimal;
}

export interface BalanceSheetReport {
  tenantId: string;
  asOfDate: string;
  currencyCode: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  totalAssets: Prisma.Decimal;
  totalLiabilities: Prisma.Decimal;
  postedEquity: Prisma.Decimal;
  unclosedEarnings: Prisma.Decimal;
  totalEquity: Prisma.Decimal;
  liabilitiesAndEquity: Prisma.Decimal;
  difference: Prisma.Decimal;
}

type LedgerRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  normalBalance: string;
  debit: string;
  credit: string;
};

type TenantContext = {
  id: string;
  status: string;
  baseCurrencyCode: string;
};

function parseDateOnly(
  value: string,
  fieldName: string,
): Date {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new FinancialReportingError(
      `${fieldName} must use YYYY-MM-DD format.`,
    );
  }

  const date = new Date(
    `${value}T00:00:00.000Z`,
  );

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new FinancialReportingError(
      `${fieldName} is not a valid calendar date.`,
    );
  }

  return date;
}

function decimal(
  value: string,
): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function add(
  values: Prisma.Decimal[],
): Prisma.Decimal {
  return values.reduce(
    (total, value) => total.plus(value),
    ZERO,
  );
}

function assertAccountType(
  value: string,
): asserts value is
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE" {
  if (
    value !== "ASSET" &&
    value !== "LIABILITY" &&
    value !== "EQUITY" &&
    value !== "REVENUE" &&
    value !== "EXPENSE"
  ) {
    throw new FinancialReportingError(
      `Unsupported account type: ${value}.`,
    );
  }
}

function assertNormalBalance(
  value: string,
): asserts value is
  | "DEBIT"
  | "CREDIT" {
  if (
    value !== "DEBIT" &&
    value !== "CREDIT"
  ) {
    throw new FinancialReportingError(
      `Unsupported normal balance: ${value}.`,
    );
  }
}

async function getTenantContext(
  tenantId: string,
): Promise<TenantContext> {
  const tenant =
    await prisma.tenant.findUnique({
      where: {
        id: tenantId,
      },
      select: {
        id: true,
        status: true,
        baseCurrencyCode: true,
      },
    });

  if (!tenant) {
    throw new FinancialReportingError(
      "Tenant not found.",
    );
  }

  if (
    tenant.status !== "TRIAL" &&
    tenant.status !== "ACTIVE"
  ) {
    throw new FinancialReportingError(
      `Tenant is not reportable: ${tenant.status}.`,
    );
  }

  return {
    id: tenant.id,
    status: tenant.status,
    baseCurrencyCode:
      tenant.baseCurrencyCode,
  };
}

async function getLedgerRows(
  tenantId: string,
  startDate: Date | null,
  endDate: Date,
): Promise<LedgerRow[]> {
  if (startDate) {
    return prisma.$queryRaw<
      LedgerRow[]
    >`
      SELECT
        a."id"::text AS "accountId",
        a."code"::text AS "code",
        a."name"::text AS "name",
        a."type"::text AS "type",
        a."normalBalance"::text AS "normalBalance",
        COALESCE(
          SUM(jl."debit"),
          0
        )::text AS "debit",
        COALESCE(
          SUM(jl."credit"),
          0
        )::text AS "credit"
      FROM "journal_entries" je
      INNER JOIN "journal_lines" jl
        ON jl."tenantId" = je."tenantId"
       AND jl."journalEntryId" = je."id"
      INNER JOIN "accounts" a
        ON a."tenantId" = jl."tenantId"
       AND a."id" = jl."accountId"
      WHERE
        je."tenantId" = ${tenantId}::uuid
        AND je."status" = 'POSTED'
        AND je."journalDate" >= ${startDate}::date
        AND je."journalDate" <= ${endDate}::date
      GROUP BY
        a."id",
        a."code",
        a."name",
        a."type",
        a."normalBalance"
      ORDER BY
        a."code"
    `;
  }

  return prisma.$queryRaw<
    LedgerRow[]
  >`
    SELECT
      a."id"::text AS "accountId",
      a."code"::text AS "code",
      a."name"::text AS "name",
      a."type"::text AS "type",
      a."normalBalance"::text AS "normalBalance",
      COALESCE(
        SUM(jl."debit"),
        0
      )::text AS "debit",
      COALESCE(
        SUM(jl."credit"),
        0
      )::text AS "credit"
    FROM "journal_entries" je
    INNER JOIN "journal_lines" jl
      ON jl."tenantId" = je."tenantId"
     AND jl."journalEntryId" = je."id"
    INNER JOIN "accounts" a
      ON a."tenantId" = jl."tenantId"
     AND a."id" = jl."accountId"
    WHERE
      je."tenantId" = ${tenantId}::uuid
      AND je."status" = 'POSTED'
      AND je."journalDate" <= ${endDate}::date
    GROUP BY
      a."id",
      a."code",
      a."name",
      a."type",
      a."normalBalance"
    ORDER BY
      a."code"
  `;
}

export async function getTrialBalance(
  input: TrialBalanceInput,
): Promise<TrialBalanceReport> {
  const tenant =
    await getTenantContext(
      input.tenantId,
    );

  const asOfDate =
    parseDateOnly(
      input.asOfDate,
      "asOfDate",
    );

  const rows =
    await getLedgerRows(
      input.tenantId,
      null,
      asOfDate,
    );

  const lines: TrialBalanceLine[] =
    rows.map((row) => {
      assertAccountType(row.type);
      assertNormalBalance(
        row.normalBalance,
      );

      const debit =
        decimal(row.debit);

      const credit =
        decimal(row.credit);

      const net =
        debit.minus(credit);

      const balanceDebit =
        net.greaterThan(0)
          ? net
          : ZERO;

      const balanceCredit =
        net.lessThan(0)
          ? net.abs()
          : ZERO;

      return {
        accountId: row.accountId,
        code: row.code,
        name: row.name,
        type: row.type,
        normalBalance:
          row.normalBalance,
        movementDebit: debit,
        movementCredit: credit,
        balanceDebit,
        balanceCredit,
      };
    });

  const totalDebit =
    add(
      lines.map(
        (line) =>
          line.balanceDebit,
      ),
    );

  const totalCredit =
    add(
      lines.map(
        (line) =>
          line.balanceCredit,
      ),
    );

  const difference =
    totalDebit.minus(
      totalCredit,
    );

  if (!difference.equals(0)) {
    throw new FinancialReportingError(
      `Trial Balance is not balanced. Difference: ${difference.toString()}.`,
    );
  }

  return {
    tenantId: input.tenantId,
    asOfDate: input.asOfDate,
    currencyCode:
      tenant.baseCurrencyCode,
    lines,
    totalDebit,
    totalCredit,
    difference,
  };
}

export async function getProfitAndLoss(
  input: ProfitAndLossInput,
): Promise<ProfitAndLossReport> {
  const tenant =
    await getTenantContext(
      input.tenantId,
    );

  const startDate =
    parseDateOnly(
      input.startDate,
      "startDate",
    );

  const endDate =
    parseDateOnly(
      input.endDate,
      "endDate",
    );

  if (
    startDate.getTime() >
    endDate.getTime()
  ) {
    throw new FinancialReportingError(
      "startDate cannot be after endDate.",
    );
  }

  const rows =
    await getLedgerRows(
      input.tenantId,
      startDate,
      endDate,
    );

  const revenue: ProfitAndLossLine[] =
    [];

  const expenses: ProfitAndLossLine[] =
    [];

  for (const row of rows) {
    assertAccountType(row.type);
    assertNormalBalance(
      row.normalBalance,
    );

    if (
      row.type !== "REVENUE" &&
      row.type !== "EXPENSE"
    ) {
      continue;
    }

    const debit =
      decimal(row.debit);

    const credit =
      decimal(row.credit);

    const amount =
      row.type === "REVENUE"
        ? credit.minus(debit)
        : debit.minus(credit);

    const line: ProfitAndLossLine = {
      accountId: row.accountId,
      code: row.code,
      name: row.name,
      type: row.type,
      normalBalance:
        row.normalBalance,
      debit,
      credit,
      amount,
    };

    if (row.type === "REVENUE") {
      revenue.push(line);
    } else {
      expenses.push(line);
    }
  }

  const totalRevenue =
    add(
      revenue.map(
        (line) => line.amount,
      ),
    );

  const totalExpenses =
    add(
      expenses.map(
        (line) => line.amount,
      ),
    );

  const netProfit =
    totalRevenue.minus(
      totalExpenses,
    );

  return {
    tenantId: input.tenantId,
    startDate: input.startDate,
    endDate: input.endDate,
    currencyCode:
      tenant.baseCurrencyCode,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netProfit,
  };
}

export async function getBalanceSheet(
  input: BalanceSheetInput,
): Promise<BalanceSheetReport> {
  const tenant =
    await getTenantContext(
      input.tenantId,
    );

  const asOfDate =
    parseDateOnly(
      input.asOfDate,
      "asOfDate",
    );

  const rows =
    await getLedgerRows(
      input.tenantId,
      null,
      asOfDate,
    );

  const assets: BalanceSheetLine[] =
    [];

  const liabilities: BalanceSheetLine[] =
    [];

  const equity: BalanceSheetLine[] =
    [];

  let cumulativeRevenue = ZERO;
  let cumulativeExpenses = ZERO;

  for (const row of rows) {
    assertAccountType(row.type);
    assertNormalBalance(
      row.normalBalance,
    );

    const debit =
      decimal(row.debit);

    const credit =
      decimal(row.credit);

    if (row.type === "REVENUE") {
      cumulativeRevenue =
        cumulativeRevenue.plus(
          credit.minus(debit),
        );

      continue;
    }

    if (row.type === "EXPENSE") {
      cumulativeExpenses =
        cumulativeExpenses.plus(
          debit.minus(credit),
        );

      continue;
    }

    let amount: Prisma.Decimal;

    if (row.type === "ASSET") {
      amount =
        debit.minus(credit);
    } else {
      amount =
        credit.minus(debit);
    }

    const line: BalanceSheetLine = {
      accountId: row.accountId,
      code: row.code,
      name: row.name,
      type: row.type,
      normalBalance:
        row.normalBalance,
      debit,
      credit,
      amount,
    };

    if (row.type === "ASSET") {
      assets.push(line);
    } else if (
      row.type === "LIABILITY"
    ) {
      liabilities.push(line);
    } else {
      equity.push(line);
    }
  }

  const totalAssets =
    add(
      assets.map(
        (line) => line.amount,
      ),
    );

  const totalLiabilities =
    add(
      liabilities.map(
        (line) => line.amount,
      ),
    );

  const postedEquity =
    add(
      equity.map(
        (line) => line.amount,
      ),
    );

  const unclosedEarnings =
    cumulativeRevenue.minus(
      cumulativeExpenses,
    );

  const totalEquity =
    postedEquity.plus(
      unclosedEarnings,
    );

  const liabilitiesAndEquity =
    totalLiabilities.plus(
      totalEquity,
    );

  const difference =
    totalAssets.minus(
      liabilitiesAndEquity,
    );

  if (!difference.equals(0)) {
    throw new FinancialReportingError(
      `Balance Sheet is not balanced. Difference: ${difference.toString()}.`,
    );
  }

  return {
    tenantId: input.tenantId,
    asOfDate: input.asOfDate,
    currencyCode:
      tenant.baseCurrencyCode,
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    postedEquity,
    unclosedEarnings,
    totalEquity,
    liabilitiesAndEquity,
    difference,
  };
}