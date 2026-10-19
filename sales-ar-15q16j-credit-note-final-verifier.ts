import {
  Prisma,
} from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const CREDIT_NOTE_ID =
  "223491fd-d39c-4fbc-8b86-ace06bbf8ad5";

const CUSTOMER_LEDGER_ID =
  "aa5b3e49-cc26-4a06-bc85-42f35a299108";

const JOURNAL_ID =
  "93bf23b7-a1de-440e-ad4b-210752822732";

const FROZEN_INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const AR_ACCOUNT_ID =
  "1d353294-00d2-4252-b6fe-60f10f3872b5";

const SALES_RETURNS_ACCOUNT_ID =
  "cc7961c2-26dd-4d47-ae53-480753e27b38";

const OUTPUT_TAX_ACCOUNT_ID =
  "092e5020-12b0-408d-83a7-84b8a0762c91";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION_FAILED: ${message}`,
    );
  }
}

function money(
  value: Prisma.Decimal | string | number,
): string {
  return new Prisma.Decimal(value)
    .toDecimalPlaces(
      4,
      Prisma.Decimal.ROUND_HALF_UP,
    )
    .toFixed(4);
}

async function main(): Promise<void> {
  console.log(
    "=== 15Q.16J FINAL READ-ONLY VERIFICATION ===",
  );

  const creditNote =
    await prisma.creditNote.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: CREDIT_NOTE_ID,
      },
      include: {
        items: true,
      },
    });

  assert(
    creditNote !== null,
    "Permanent Credit Note evidence missing.",
  );

  assert(
    creditNote.status === "POSTED",
    "Credit Note must remain POSTED.",
  );

  assert(
    creditNote.postedAt !== null,
    "Credit Note postedAt missing.",
  );

  assert(
    creditNote.invoiceId === null,
    "Behavioral Credit Note must remain standalone.",
  );

  assert(
    money(creditNote.subtotal) === "200.0000",
    "Credit Note subtotal changed.",
  );

  assert(
    money(creditNote.taxTotal) === "30.0000",
    "Credit Note tax changed.",
  );

  assert(
    money(creditNote.total) === "230.0000",
    "Credit Note total changed.",
  );

  assert(
    creditNote.items.length === 1,
    "Credit Note item count changed.",
  );

  const ledgerRows =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SALES_CREDIT_NOTE",
        referenceId: CREDIT_NOTE_ID,
      },
    });

  assert(
    ledgerRows.length === 1,
    "Expected exactly one customer ledger row.",
  );

  const ledger = ledgerRows[0];

  assert(
    ledger !== undefined,
    "Customer ledger evidence missing.",
  );

  assert(
    ledger.id === CUSTOMER_LEDGER_ID,
    "Customer ledger ID changed.",
  );

  assert(
    ledger.entryType === "CREDIT_NOTE",
    "Customer ledger entryType changed.",
  );

  assert(
    ledger.referenceType === "SALES_CREDIT_NOTE",
    "Customer ledger referenceType changed.",
  );

  assert(
    money(ledger.debit) === "0.0000",
    "Credit Note ledger debit must remain zero.",
  );

  assert(
    money(ledger.credit) === "230.0000",
    "Credit Note ledger credit must remain 230.",
  );

  assert(
    ledger.currencyCode === "GHS",
    "Customer ledger currency changed.",
  );

  const journalRows =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SALES_CREDIT_NOTE",
        sourceId: CREDIT_NOTE_ID,
      },
      include: {
        lines: true,
      },
    });

  assert(
    journalRows.length === 1,
    "Expected exactly one Credit Note journal.",
  );

  const journal = journalRows[0];

  assert(
    journal !== undefined,
    "Credit Note journal missing.",
  );

  assert(
    journal.id === JOURNAL_ID,
    "Credit Note journal ID changed.",
  );

  assert(
    journal.journalNumber === "JRN-2098-000010",
    "Credit Note journal number changed.",
  );

  assert(
    journal.status === "POSTED",
    "Credit Note journal must remain POSTED.",
  );

  assert(
    journal.currencyCode === "GHS",
    "Credit Note journal currency changed.",
  );

  assert(
    journal.lines.length === 3,
    "Credit Note journal must contain exactly three lines.",
  );

  const salesReturns =
    journal.lines.find(
      (line) =>
        line.accountId ===
        SALES_RETURNS_ACCOUNT_ID,
    );

  const outputTax =
    journal.lines.find(
      (line) =>
        line.accountId ===
        OUTPUT_TAX_ACCOUNT_ID,
    );

  const ar =
    journal.lines.find(
      (line) =>
        line.accountId ===
        AR_ACCOUNT_ID,
    );

  assert(
    salesReturns !== undefined,
    "Sales Returns line missing.",
  );

  assert(
    outputTax !== undefined,
    "Output Tax line missing.",
  );

  assert(
    ar !== undefined,
    "Accounts Receivable line missing.",
  );

  assert(
    money(salesReturns.debit) === "200.0000" &&
      money(salesReturns.credit) === "0.0000",
    "Sales Returns must remain DR 200.",
  );

  assert(
    money(outputTax.debit) === "30.0000" &&
      money(outputTax.credit) === "0.0000",
    "Output Tax must remain DR 30.",
  );

  assert(
    money(ar.debit) === "0.0000" &&
      money(ar.credit) === "230.0000",
    "Accounts Receivable must remain CR 230.",
  );

  const totalDebit =
    journal.lines.reduce(
      (sum, line) =>
        sum.plus(line.debit),
      new Prisma.Decimal(0),
    );

  const totalCredit =
    journal.lines.reduce(
      (sum, line) =>
        sum.plus(line.credit),
      new Prisma.Decimal(0),
    );

  assert(
    money(totalDebit) === "230.0000",
    "Journal debit total changed.",
  );

  assert(
    money(totalCredit) === "230.0000",
    "Journal credit total changed.",
  );

  const duplicateLedgerCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SALES_CREDIT_NOTE",
        referenceId: CREDIT_NOTE_ID,
      },
    });

  const duplicateJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SALES_CREDIT_NOTE",
        sourceId: CREDIT_NOTE_ID,
      },
    });

  assert(
    duplicateLedgerCount === 1,
    "Customer ledger idempotency violated.",
  );

  assert(
    duplicateJournalCount === 1,
    "Journal source idempotency violated.",
  );

  const frozenInvoice =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FROZEN_INVOICE_ID,
      },
      select: {
        status: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        paidAt: true,
      },
    });

  assert(
    frozenInvoice !== null,
    "Frozen invoice missing.",
  );

  assert(
    frozenInvoice.status === "PAID",
    "Frozen invoice status changed.",
  );

  assert(
    money(frozenInvoice.total) === "1150.0000",
    "Frozen invoice total changed.",
  );

  assert(
    money(frozenInvoice.amountPaid) === "1150.0000",
    "Frozen invoice amountPaid changed.",
  );

  assert(
    money(frozenInvoice.balanceDue) === "0.0000",
    "Frozen invoice balanceDue changed.",
  );

  assert(
    frozenInvoice.paidAt?.toISOString() ===
      "2026-10-08T04:02:15.174Z",
    "Frozen invoice paidAt changed.",
  );

  console.log("");
  console.log("FINAL EVIDENCE");

  console.dir({
    creditNote: {
      id: creditNote.id,
      creditNoteNumber:
        creditNote.creditNoteNumber,
      status: creditNote.status,
      subtotal:
        money(creditNote.subtotal),
      taxTotal:
        money(creditNote.taxTotal),
      total:
        money(creditNote.total),
      postedAt:
        creditNote.postedAt?.toISOString(),
    },

    customerLedger: {
      id: ledger.id,
      debit: money(ledger.debit),
      credit: money(ledger.credit),
      entryType: ledger.entryType,
      referenceType:
        ledger.referenceType,
    },

    journal: {
      id: journal.id,
      journalNumber:
        journal.journalNumber,
      status: journal.status,
      debitTotal:
        money(totalDebit),
      creditTotal:
        money(totalCredit),
      lines: journal.lines.map(
        (line) => ({
          accountId:
            line.accountId,
          debit:
            money(line.debit),
          credit:
            money(line.credit),
        }),
      ),
    },

    idempotency: {
      customerLedgerCount:
        duplicateLedgerCount,
      journalCount:
        duplicateJournalCount,
    },

    frozenInvoice: {
      status:
        frozenInvoice.status,
      total:
        money(frozenInvoice.total),
      amountPaid:
        money(frozenInvoice.amountPaid),
      balanceDue:
        money(frozenInvoice.balanceDue),
      paidAt:
        frozenInvoice.paidAt?.toISOString(),
    },
  }, {
    depth: null,
  });

  console.log("");
  console.log(
    "15Q.16J FINAL CREDIT NOTE VERIFIER: PASS",
  );

  console.log(
    "Database mutations by verifier: NONE",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.16J FINAL CREDIT NOTE VERIFIER: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });