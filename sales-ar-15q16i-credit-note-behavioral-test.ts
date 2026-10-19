import {
  Prisma,
} from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  postCreditNote,
} from "./src/modules/sales/credit-note-posting.service.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const CUSTOMER_ID =
  "ab359555-fbf8-469a-8b05-83f7a232badc";

const POSTED_BY_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const FROZEN_INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const EXPECTED_AR_ACCOUNT_ID =
  "1d353294-00d2-4252-b6fe-60f10f3872b5";

const EXPECTED_SALES_RETURNS_ACCOUNT_ID =
  "cc7961c2-26dd-4d47-ae53-480753e27b38";

const EXPECTED_OUTPUT_TAX_ACCOUNT_ID =
  "092e5020-12b0-408d-83a7-84b8a0762c91";

const SOURCE_TYPE = "SALES_CREDIT_NOTE";
const LEDGER_ENTRY_TYPE = "CREDIT_NOTE";
const REFERENCE_TYPE = "SALES_CREDIT_NOTE";

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
    "=== 15Q.16I CREDIT NOTE BEHAVIORAL TEST ===",
  );

  /*
   * This is intentionally a new standalone Credit Note.
   *
   * invoiceId is NULL so the frozen invoice remains
   * completely outside the accounting relationship.
   */
  const uniqueSuffix =
    `${Date.now()}-${Math.floor(
      Math.random() * 1_000_000,
    )}`;

  const creditNoteNumber =
    `CN-ARTEST-${uniqueSuffix}`;

  let createdCreditNoteId:
    | string
    | null = null;

  /*
   * --------------------------------------------------------
   * CONTROL SNAPSHOT
   * --------------------------------------------------------
   */

  const frozenInvoiceBefore =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FROZEN_INVOICE_ID,
      },
      select: {
        id: true,
        status: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        paidAt: true,
      },
    });

  assert(
    frozenInvoiceBefore !== null,
    "Frozen invoice must exist.",
  );

  assert(
    frozenInvoiceBefore.status === "PAID",
    "Frozen invoice must remain PAID before test.",
  );

  assert(
    money(frozenInvoiceBefore.total) ===
      "1150.0000",
    "Frozen invoice total must remain 1150.",
  );

  assert(
    money(frozenInvoiceBefore.amountPaid) ===
      "1150.0000",
    "Frozen invoice amountPaid must remain 1150.",
  );

  assert(
    money(frozenInvoiceBefore.balanceDue) ===
      "0.0000",
    "Frozen invoice balanceDue must remain zero.",
  );

  const beforeCounts = {
    creditNotes:
      await prisma.creditNote.count({
        where: {
          tenantId: TENANT_ID,
        },
      }),

    customerLedger:
      await prisma.customerLedgerEntry.count({
        where: {
          tenantId: TENANT_ID,
          referenceType: REFERENCE_TYPE,
        },
      }),

    journals:
      await prisma.journalEntry.count({
        where: {
          tenantId: TENANT_ID,
          sourceType: SOURCE_TYPE,
        },
      }),
  };

  console.log("");
  console.log("BEFORE COUNTS");
  console.dir(beforeCounts);

  /*
   * --------------------------------------------------------
   * CREATE DRAFT BUSINESS DOCUMENT
   * --------------------------------------------------------
   */

  const creditNote =
    await prisma.creditNote.create({
      data: {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        customerId: CUSTOMER_ID,

        /*
         * Deliberately standalone.
         */
        invoiceId: null,

        creditNoteNumber,
        creditNoteDate:
          new Date("2098-06-22T00:00:00.000Z"),

        currencyCode: "GHS",
        exchangeRate: new Prisma.Decimal("1"),

        subtotal: new Prisma.Decimal("200"),
        taxTotal: new Prisma.Decimal("30"),
        total: new Prisma.Decimal("230"),

        reason:
          "15Q.16I permanent Credit Note posting test",

        status: "DRAFT",
        createdById: POSTED_BY_ID,

        items: {
          create: [
            {
              invoiceItemId: null,
              productId: null,

              description:
                "15Q.16I returned taxable sale",

              quantity:
                new Prisma.Decimal("1"),

              unitPrice:
                new Prisma.Decimal("200"),

              /*
               * The posting service validates stored
               * monetary totals. Tax calculation itself
               * belongs to document calculation/creation.
               */
              taxRate:
                new Prisma.Decimal("15"),

              taxAmount:
                new Prisma.Decimal("30"),

              lineTotal:
                new Prisma.Decimal("230"),
            },
          ],
        },
      },
      select: {
        id: true,
        creditNoteNumber: true,
        invoiceId: true,
        status: true,
        subtotal: true,
        taxTotal: true,
        total: true,
      },
    });

  createdCreditNoteId = creditNote.id;

  console.log("");
  console.log("DRAFT CREDIT NOTE CREATED");
  console.dir({
    ...creditNote,
    subtotal: money(creditNote.subtotal),
    taxTotal: money(creditNote.taxTotal),
    total: money(creditNote.total),
  });

  assert(
    creditNote.invoiceId === null,
    "Test Credit Note must not reference frozen invoice.",
  );

  assert(
    creditNote.status === "DRAFT",
    "Credit Note must begin DRAFT.",
  );

  /*
   * --------------------------------------------------------
   * PRODUCTION POST
   * --------------------------------------------------------
   */

  const result =
    await postCreditNote({
      tenantId: TENANT_ID,
      creditNoteId: creditNote.id,
      postedById: POSTED_BY_ID,
    });

  console.log("");
  console.log("POST RESULT");
  console.dir(result, {
    depth: null,
  });

  /*
   * --------------------------------------------------------
   * READ BACK BUSINESS DOCUMENT
   * --------------------------------------------------------
   */

  const posted =
    await prisma.creditNote.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: creditNote.id,
      },
      include: {
        items: true,
      },
    });

  assert(
    posted !== null,
    "Posted Credit Note must exist.",
  );

  assert(
    posted.status === "POSTED",
    "Credit Note must be POSTED.",
  );

  assert(
    posted.postedAt !== null,
    "Credit Note postedAt must be populated.",
  );

  assert(
    posted.invoiceId === null,
    "Posted Credit Note must remain standalone.",
  );

  assert(
    money(posted.subtotal) === "200.0000",
    "Posted subtotal must be 200.",
  );

  assert(
    money(posted.taxTotal) === "30.0000",
    "Posted taxTotal must be 30.",
  );

  assert(
    money(posted.total) === "230.0000",
    "Posted total must be 230.",
  );

  assert(
    posted.items.length === 1,
    "Credit Note must have exactly one item.",
  );

  /*
   * --------------------------------------------------------
   * CUSTOMER SUBLEDGER
   * --------------------------------------------------------
   */

  const ledgerRows =
    await prisma.customerLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: REFERENCE_TYPE,
        referenceId: creditNote.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

  assert(
    ledgerRows.length === 1,
    "Exactly one customer ledger entry must exist.",
  );

  const ledger = ledgerRows[0];

  assert(
    ledger !== undefined,
    "Customer ledger row must exist.",
  );

  assert(
    ledger.customerId === CUSTOMER_ID,
    "Ledger customer must match Credit Note customer.",
  );

  assert(
    ledger.branchId === BRANCH_ID,
    "Ledger branch must match Credit Note branch.",
  );

  assert(
    ledger.entryType === LEDGER_ENTRY_TYPE,
    "Ledger entryType must be CREDIT_NOTE.",
  );

  assert(
    ledger.referenceType === REFERENCE_TYPE,
    "Ledger referenceType must be SALES_CREDIT_NOTE.",
  );

  assert(
    money(ledger.debit) === "0.0000",
    "Credit Note customer ledger debit must be zero.",
  );

  assert(
    money(ledger.credit) === "230.0000",
    "Credit Note customer ledger credit must be 230.",
  );

  assert(
    ledger.currencyCode === "GHS",
    "Customer ledger currency must be GHS.",
  );

  /*
   * --------------------------------------------------------
   * GENERAL LEDGER
   * --------------------------------------------------------
   */

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: SOURCE_TYPE,
        sourceId: creditNote.id,
      },
      include: {
        lines: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

  assert(
    journals.length === 1,
    "Exactly one GL journal must exist.",
  );

  const journal = journals[0];

  assert(
    journal !== undefined,
    "Journal must exist.",
  );

  assert(
    journal.status === "POSTED",
    "Credit Note journal must be POSTED.",
  );

  assert(
    journal.branchId === BRANCH_ID,
    "Journal branch must match Credit Note branch.",
  );

  assert(
    journal.currencyCode === "GHS",
    "Journal currency must be GHS.",
  );

  assert(
    journal.lines.length === 3,
    "Taxable Credit Note journal must have three lines.",
  );

  const salesReturnsLine =
    journal.lines.find(
      (line) =>
        line.accountId ===
        EXPECTED_SALES_RETURNS_ACCOUNT_ID,
    );

  const outputTaxLine =
    journal.lines.find(
      (line) =>
        line.accountId ===
        EXPECTED_OUTPUT_TAX_ACCOUNT_ID,
    );

  const arLine =
    journal.lines.find(
      (line) =>
        line.accountId ===
        EXPECTED_AR_ACCOUNT_ID,
    );

  assert(
    salesReturnsLine !== undefined,
    "Sales Returns journal line missing.",
  );

  assert(
    outputTaxLine !== undefined,
    "Output Tax journal line missing.",
  );

  assert(
    arLine !== undefined,
    "Accounts Receivable journal line missing.",
  );

  assert(
    money(salesReturnsLine.debit) ===
      "200.0000" &&
    money(salesReturnsLine.credit) ===
      "0.0000",
    "Sales Returns must be DR 200.",
  );

  assert(
    money(outputTaxLine.debit) ===
      "30.0000" &&
    money(outputTaxLine.credit) ===
      "0.0000",
    "Output Tax must be DR 30.",
  );

  assert(
    money(arLine.debit) ===
      "0.0000" &&
    money(arLine.credit) ===
      "230.0000",
    "Accounts Receivable must be CR 230.",
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
    "Journal debit total must equal 230.",
  );

  assert(
    money(totalCredit) === "230.0000",
    "Journal credit total must equal 230.",
  );

  /*
   * --------------------------------------------------------
   * DUPLICATE POST PROTECTION
   * --------------------------------------------------------
   */

  let duplicateRejected = false;
  let duplicateMessage = "";

  try {
    await postCreditNote({
      tenantId: TENANT_ID,
      creditNoteId: creditNote.id,
      postedById: POSTED_BY_ID,
    });
  } catch (error) {
    duplicateRejected = true;

    duplicateMessage =
      error instanceof Error
        ? error.message
        : String(error);
  }

  console.log("");
  console.log("DUPLICATE POST RESULT");
  console.dir({
    duplicateRejected,
    duplicateMessage,
  });

  assert(
    duplicateRejected,
    "Second Credit Note posting attempt must be rejected.",
  );

  const duplicateLedgerCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: REFERENCE_TYPE,
        referenceId: creditNote.id,
      },
    });

  const duplicateJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: SOURCE_TYPE,
        sourceId: creditNote.id,
      },
    });

  assert(
    duplicateLedgerCount === 1,
    "Duplicate attempt must not create another customer ledger row.",
  );

  assert(
    duplicateJournalCount === 1,
    "Duplicate attempt must not create another journal.",
  );

  /*
   * --------------------------------------------------------
   * FROZEN INVOICE CONTROL
   * --------------------------------------------------------
   */

  const frozenInvoiceAfter =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FROZEN_INVOICE_ID,
      },
      select: {
        id: true,
        status: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        paidAt: true,
      },
    });

  assert(
    frozenInvoiceAfter !== null,
    "Frozen invoice must still exist.",
  );

  assert(
    frozenInvoiceAfter.status === "PAID",
    "Frozen invoice status must remain PAID.",
  );

  assert(
    money(frozenInvoiceAfter.total) ===
      money(frozenInvoiceBefore.total),
    "Frozen invoice total changed.",
  );

  assert(
    money(frozenInvoiceAfter.amountPaid) ===
      money(frozenInvoiceBefore.amountPaid),
    "Frozen invoice amountPaid changed.",
  );

  assert(
    money(frozenInvoiceAfter.balanceDue) ===
      money(frozenInvoiceBefore.balanceDue),
    "Frozen invoice balanceDue changed.",
  );

  const beforePaidAt =
    frozenInvoiceBefore.paidAt?.toISOString() ??
    null;

  const afterPaidAt =
    frozenInvoiceAfter.paidAt?.toISOString() ??
    null;

  assert(
    afterPaidAt === beforePaidAt,
    "Frozen invoice paidAt changed.",
  );

  /*
   * --------------------------------------------------------
   * COUNT DELTAS
   * --------------------------------------------------------
   */

  const afterCounts = {
    creditNotes:
      await prisma.creditNote.count({
        where: {
          tenantId: TENANT_ID,
        },
      }),

    customerLedger:
      await prisma.customerLedgerEntry.count({
        where: {
          tenantId: TENANT_ID,
          referenceType: REFERENCE_TYPE,
        },
      }),

    journals:
      await prisma.journalEntry.count({
        where: {
          tenantId: TENANT_ID,
          sourceType: SOURCE_TYPE,
        },
      }),
  };

  assert(
    afterCounts.creditNotes ===
      beforeCounts.creditNotes + 1,
    "Exactly one Credit Note must have been added.",
  );

  assert(
    afterCounts.customerLedger ===
      beforeCounts.customerLedger + 1,
    "Exactly one Credit Note customer ledger row must have been added.",
  );

  assert(
    afterCounts.journals ===
      beforeCounts.journals + 1,
    "Exactly one Credit Note journal must have been added.",
  );

  console.log("");
  console.log("=== VERIFIED ACCOUNTING ===");

  console.dir({
    creditNote: {
      id: posted.id,
      creditNoteNumber:
        posted.creditNoteNumber,
      status: posted.status,
      invoiceId: posted.invoiceId,
      subtotal: money(posted.subtotal),
      taxTotal: money(posted.taxTotal),
      total: money(posted.total),
      postedAt:
        posted.postedAt?.toISOString(),
    },

    customerLedger: {
      id: ledger.id,
      entryType: ledger.entryType,
      referenceType:
        ledger.referenceType,
      debit: money(ledger.debit),
      credit: money(ledger.credit),
      currencyCode:
        ledger.currencyCode,
    },

    journal: {
      id: journal.id,
      journalNumber:
        journal.journalNumber,
      status: journal.status,
      sourceType:
        journal.sourceType,
      sourceId:
        journal.sourceId,
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

    duplicateProtection: {
      rejected:
        duplicateRejected,
      ledgerCount:
        duplicateLedgerCount,
      journalCount:
        duplicateJournalCount,
    },

    frozenInvoiceControl: {
      id:
        frozenInvoiceAfter.id,
      status:
        frozenInvoiceAfter.status,
      total:
        money(
          frozenInvoiceAfter.total,
        ),
      amountPaid:
        money(
          frozenInvoiceAfter.amountPaid,
        ),
      balanceDue:
        money(
          frozenInvoiceAfter.balanceDue,
        ),
      paidAt:
        frozenInvoiceAfter.paidAt
          ?.toISOString(),
    },

    countDelta: {
      before: beforeCounts,
      after: afterCounts,
    },
  }, {
    depth: null,
  });

  console.log("");
  console.log(
    "15Q.16I CREDIT NOTE BEHAVIORAL TEST: PASS",
  );

  console.log(
    "IMPORTANT: posted test evidence is permanent and must not be deleted.",
  );

  console.log(
    "Credit Note ID:",
    posted.id,
  );

  console.log(
    "Customer Ledger Entry ID:",
    ledger.id,
  );

  console.log(
    "Journal Entry ID:",
    journal.id,
  );
}

main()
  .catch(async (error) => {
    console.error("");
    console.error(
      "15Q.16I CREDIT NOTE BEHAVIORAL TEST: FAIL",
    );

    console.error(error);

    /*
     * If failure occurs before posting, report the DRAFT
     * fixture so we can clean it safely.
     *
     * If posting succeeded before a later assertion failed,
     * DO NOT delete anything automatically. Posted accounting
     * evidence must be inspected and preserved.
     */
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });