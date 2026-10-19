import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  postSupplierPayment,
  SupplierPaymentPostingError,
} from "./src/modules/purchasing/supplier-payment-posting.service.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

const BANK_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

const POSTED_BY_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const AMOUNT = new Prisma.Decimal("1150");

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("=== PRE-MUTATION SAFETY CHECK ===");

  const billBefore =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BILL_ID,
        },
      },
    });

  assert(
    billBefore,
    "Frozen Supplier Bill not found.",
  );

  assert(
    billBefore.status === "POSTED",
    `Expected bill POSTED before payment; found ${billBefore.status}.`,
  );

  assert(
    billBefore.amountPaid.equals(0),
    "Expected bill amountPaid = 0.",
  );

  assert(
    billBefore.balanceDue.equals(AMOUNT),
    "Expected bill balanceDue = 1150.",
  );

  assert(
    billBefore.currencyCode === "GHS",
    "Expected GHS Supplier Bill.",
  );

  assert(
    billBefore.exchangeRate.equals(1),
    "Expected Supplier Bill exchangeRate = 1.",
  );

  const existingAllocations =
    await prisma.supplierPaymentAllocation.count({
      where: {
        tenantId: TENANT_ID,
        supplierBillId: BILL_ID,
      },
    });

  assert(
    existingAllocations === 0,
    "Supplier Bill already has payment allocations.",
  );

  const bank =
    await prisma.financialAccount.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BANK_ID,
        },
      },
      include: {
        ledgerAccount: true,
      },
    });

  assert(bank, "Bank account not found.");

  assert(
    bank.status === "ACTIVE",
    "Bank account is not ACTIVE.",
  );

  assert(
    bank.currencyCode === "GHS",
    "Bank account is not GHS.",
  );

  assert(
    bank.branchId === null ||
      bank.branchId === BRANCH_ID,
    "Bank account branch mismatch.",
  );

  assert(
    bank.ledgerAccountId !== null &&
      bank.ledgerAccount !== null,
    "Bank has no linked ledger account.",
  );

  const apMapping =
    await prisma.systemAccountMapping.findFirst({
      where: {
        tenantId: TENANT_ID,
        purpose: "ACCOUNTS_PAYABLE",
      },
      include: {
        account: true,
      },
    });

  assert(
    apMapping,
    "ACCOUNTS_PAYABLE mapping not found.",
  );

  assert(
    apMapping.account.status === "ACTIVE",
    "Accounts Payable account is not ACTIVE.",
  );

  console.log("PRE-MUTATION SAFETY CHECK: PASS");

  console.log("");
  console.log("=== CREATING CONTROLLED PAYMENT FIXTURE ===");

  const nonce =
    `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

  const paymentNumber =
    `PAY-15R11D-${nonce}`;

  /*
   * Fixture creation is intentionally committed before
   * production service execution so that any subsequent
   * failure can be inspected without recreating the fixture.
   */
  const payment =
    await prisma.$transaction(async (tx) => {
      const createdPayment =
        await tx.supplierPayment.create({
          data: {
            tenantId: TENANT_ID,
            branchId: BRANCH_ID,
            supplierId: billBefore.supplierId,
            paymentNumber,
            paymentDate: "2098-06-26",
            financialAccountId: BANK_ID,
            currencyCode: "GHS",
            exchangeRate: new Prisma.Decimal("1"),
            amount: AMOUNT,
            unallocatedAmount:
              new Prisma.Decimal("0"),
            reference:
              "15R.11D controlled verification",
            notes:
              "Permanent Supplier Payment posting evidence",
            status: "DRAFT",
          },
        });

      await tx.supplierPaymentAllocation.create({
        data: {
          tenantId: TENANT_ID,
          supplierPaymentId:
            createdPayment.id,
          supplierBillId: BILL_ID,
          amount: AMOUNT,
        },
      });

      return createdPayment;
    });

  console.log("Payment fixture ID:", payment.id);
  console.log(
    "Payment number:",
    payment.paymentNumber,
  );
  console.log("Fixture status:", payment.status);

  /*
   * Re-read fixture before invoking production code.
   */
  const fixture =
    await prisma.supplierPayment.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: payment.id,
        },
      },
      include: {
        allocations: true,
      },
    });

  assert(fixture, "Payment fixture disappeared.");

  assert(
    fixture.status === "DRAFT",
    "Fixture is not DRAFT.",
  );

  assert(
    fixture.postedAt === null,
    "Fixture unexpectedly has postedAt.",
  );

  assert(
    fixture.amount.equals(AMOUNT),
    "Fixture amount mismatch.",
  );

  assert(
    fixture.unallocatedAmount.equals(0),
    "Fixture is not fully allocated.",
  );

  assert(
    fixture.allocations.length === 1,
    "Expected exactly one allocation.",
  );

  assert(
    fixture.allocations[0]?.supplierBillId ===
      BILL_ID,
    "Allocation bill mismatch.",
  );

  assert(
    fixture.allocations[0]?.amount.equals(
      AMOUNT,
    ),
    "Allocation amount mismatch.",
  );

  const ledgerBefore =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_PAYMENT",
        referenceId: payment.id,
      },
    });

  const journalsBefore =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_PAYMENT",
        sourceId: payment.id,
      },
    });

  assert(
    ledgerBefore === 0,
    "Fixture already has Supplier Ledger evidence.",
  );

  assert(
    journalsBefore === 0,
    "Fixture already has Journal evidence.",
  );

  console.log("");
  console.log("FIXTURE SAFETY CHECK: PASS");
  console.log("");
  console.log(
    "============================================================",
  );
  console.log(
    "EXECUTING postSupplierPayment() EXACTLY ONCE",
  );
  console.log(
    "DATABASE MUTATION BEGINS NOW",
  );
  console.log(
    "============================================================",
  );

  const result = await postSupplierPayment({
    tenantId: TENANT_ID,
    supplierPaymentId: payment.id,
    postedById: POSTED_BY_ID,
  });

  console.log("");
  console.log("Production service returned.");
  console.log(
    "Posted payment ID:",
    result.supplierPayment.id,
  );
  console.log(
    "Supplier ledger ID:",
    result.supplierLedgerEntry.id,
  );
  console.log(
    "Journal ID:",
    result.journal.id,
  );

  console.log("");
  console.log("=== POSTING VERIFICATION ===");

  const paymentAfter =
    await prisma.supplierPayment.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: payment.id,
        },
      },
      include: {
        allocations: true,
      },
    });

  assert(
    paymentAfter,
    "Posted Supplier Payment not found.",
  );

  assert(
    paymentAfter.status === "POSTED",
    `Expected payment POSTED; found ${paymentAfter.status}.`,
  );

  assert(
    paymentAfter.postedAt !== null,
    "Posted Supplier Payment has no postedAt.",
  );

  assert(
    paymentAfter.amount.equals(AMOUNT),
    "Posted payment amount changed.",
  );

  assert(
    paymentAfter.unallocatedAmount.equals(0),
    "Posted payment unallocatedAmount changed.",
  );

  assert(
    paymentAfter.allocations.length === 1,
    "Payment allocation count changed.",
  );

  const billAfter =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BILL_ID,
        },
      },
    });

  assert(
    billAfter,
    "Supplier Bill missing after payment.",
  );

  assert(
    billAfter.status === "PAID",
    `Expected bill PAID; found ${billAfter.status}.`,
  );

  assert(
    billAfter.amountPaid.equals(AMOUNT),
    "Supplier Bill amountPaid is not 1150.",
  );

  assert(
    billAfter.balanceDue.equals(0),
    "Supplier Bill balanceDue is not 0.",
  );

  const ledgers =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_PAYMENT",
        referenceId: payment.id,
      },
    });

  assert(
    ledgers.length === 1,
    `Expected one Supplier Ledger entry; found ${ledgers.length}.`,
  );

  const ledger = ledgers[0];

  assert(
    ledger !== undefined,
    "Supplier Ledger entry missing.",
  );

  assert(
    ledger.supplierId ===
      paymentAfter.supplierId,
    "Supplier Ledger supplier mismatch.",
  );

  assert(
    ledger.entryType === "PAYMENT",
    `Unexpected Supplier Ledger entryType ${ledger.entryType}.`,
  );

  assert(
    ledger.debit.equals(AMOUNT),
    "Supplier Ledger debit is not 1150.",
  );

  assert(
    ledger.credit.equals(0),
    "Supplier Ledger credit is not 0.",
  );

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_PAYMENT",
        sourceId: payment.id,
      },
      include: {
        lines: true,
      },
    });

  assert(
    journals.length === 1,
    `Expected one Journal; found ${journals.length}.`,
  );

  const journal = journals[0];

  assert(
    journal !== undefined,
    "Journal missing.",
  );

  assert(
    journal.status === "POSTED",
    `Expected Journal POSTED; found ${journal.status}.`,
  );

  assert(
    journal.postedAt !== null,
    "Journal has no postedAt.",
  );

  assert(
    journal.lines.length === 2,
    `Expected two Journal lines; found ${journal.lines.length}.`,
  );

  for (const line of journal.lines) {
    assert(
      line.tenantId === TENANT_ID,
      "JournalLine tenantId mismatch.",
    );

    assert(
      line.journalEntryId === journal.id,
      "JournalLine journalEntryId mismatch.",
    );
  }

  const apLine = journal.lines.find(
    (line) =>
      line.accountId === apMapping.account.id,
  );

  const bankLine = journal.lines.find(
    (line) =>
      line.accountId === bank.ledgerAccountId,
  );

  assert(
    apLine,
    "Accounts Payable Journal line missing.",
  );

  assert(
    bankLine,
    "Bank Journal line missing.",
  );

  assert(
    apLine.debit.equals(AMOUNT),
    "AP debit is not 1150.",
  );

  assert(
    apLine.credit.equals(0),
    "AP credit is not 0.",
  );

  assert(
    apLine.supplierId ===
      paymentAfter.supplierId,
    "AP Journal line supplier dimension mismatch.",
  );

  assert(
    bankLine.debit.equals(0),
    "Bank debit is not 0.",
  );

  assert(
    bankLine.credit.equals(AMOUNT),
    "Bank credit is not 1150.",
  );

  const totalDebit = journal.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    new Prisma.Decimal("0"),
  );

  const totalCredit = journal.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    new Prisma.Decimal("0"),
  );

  assert(
    totalDebit.equals(AMOUNT),
    "Journal total debit is not 1150.",
  );

  assert(
    totalCredit.equals(AMOUNT),
    "Journal total credit is not 1150.",
  );

  assert(
    totalDebit.equals(totalCredit),
    "Journal is not balanced.",
  );

  console.log("PRIMARY POSTING VERIFICATION: PASS");

  console.log("");
  console.log("=== DUPLICATE POSTING REJECTION ===");

  let duplicateRejected = false;

  try {
    await postSupplierPayment({
      tenantId: TENANT_ID,
      supplierPaymentId: payment.id,
      postedById: POSTED_BY_ID,
    });
  } catch (error) {
    if (
      error instanceof SupplierPaymentPostingError
    ) {
      duplicateRejected = true;

      console.log(
        "Duplicate rejected:",
        error.message,
      );
    } else {
      throw error;
    }
  }

  assert(
    duplicateRejected,
    "Duplicate posting was not rejected.",
  );

  const finalLedgerCount =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_PAYMENT",
        referenceId: payment.id,
      },
    });

  const finalJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_PAYMENT",
        sourceId: payment.id,
      },
    });

  assert(
    finalLedgerCount === 1,
    "Duplicate attempt changed Supplier Ledger count.",
  );

  assert(
    finalJournalCount === 1,
    "Duplicate attempt changed Journal count.",
  );

  console.log("DUPLICATE PROTECTION: PASS");

  console.log("");
  console.log("============================================================");
  console.log("15R.11D SUPPLIER PAYMENT: VERIFIED");
  console.log("============================================================");
  console.log("");
  console.log("PERMANENT EVIDENCE");
  console.log("Supplier Payment ID:", paymentAfter.id);
  console.log(
    "Payment Number:",
    paymentAfter.paymentNumber,
  );
  console.log(
    "Supplier Payment status:",
    paymentAfter.status,
  );
  console.log("Supplier Bill ID:", billAfter.id);
  console.log(
    "Supplier Bill status:",
    billAfter.status,
  );
  console.log(
    "Supplier Ledger ID:",
    ledger.id,
  );
  console.log("Journal ID:", journal.id);
  console.log(
    "Journal Number:",
    journal.journalNumber,
  );
  console.log(
    "Accounting: DR AP 1150 / CR Bank 1150",
  );
  console.log("");
  console.log("DO NOT RERUN 15R.11D.");
}

main()
  .catch((error) => {
    console.error("");
    console.error("15R.11D: FAIL");
    console.error(error);
    console.error("");
    console.error(
      "DO NOT RERUN 15R.11D.",
    );
    console.error(
      "Inspect database state read-only first.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });