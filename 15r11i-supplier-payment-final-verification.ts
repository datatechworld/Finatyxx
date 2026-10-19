import { Prisma } from "./src/generated/prisma/client.js";
import { prisma } from "./src/db/prisma.js";
import {
  postSupplierPayment,
  SupplierPaymentPostingError,
} from "./src/modules/purchasing/supplier-payment-posting.service.js";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BILL_ID =
  "7664a2e4-0a8f-48af-8396-982d7e0ba827";

const PAYMENT_ID =
  "94d4433f-c996-443c-9470-0ccb72e6d12d";

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
  console.log("=== PRE-POSTING SAFETY CHECK ===");

  const paymentBefore =
    await prisma.supplierPayment.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: PAYMENT_ID,
        },
      },
      include: {
        allocations: true,
      },
    });

  assert(
    paymentBefore,
    "Preserved Supplier Payment not found.",
  );

  assert(
    paymentBefore.status === "DRAFT",
    `Expected payment DRAFT; found ${paymentBefore.status}.`,
  );

  assert(
    paymentBefore.postedAt === null,
    "Payment already has postedAt.",
  );

  assert(
    paymentBefore.amount.equals(AMOUNT),
    "Payment amount is not 1150.",
  );

  assert(
    paymentBefore.unallocatedAmount.equals(0),
    "Payment is not fully allocated.",
  );

  assert(
    paymentBefore.allocations.length === 1,
    "Expected exactly one payment allocation.",
  );

  const allocation =
    paymentBefore.allocations[0];

  assert(
    allocation,
    "Supplier Payment allocation missing.",
  );

  assert(
    allocation.supplierBillId === BILL_ID,
    "Allocation points to wrong Supplier Bill.",
  );

  assert(
    allocation.amount.equals(AMOUNT),
    "Allocation amount is not 1150.",
  );

  const billBefore =
    await prisma.supplierBill.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BILL_ID,
        },
      },
    });

  assert(billBefore, "Supplier Bill not found.");

  assert(
    billBefore.status === "POSTED",
    `Expected bill POSTED; found ${billBefore.status}.`,
  );

  assert(
    billBefore.amountPaid.equals(0),
    "Expected bill amountPaid = 0.",
  );

  assert(
    billBefore.balanceDue.equals(AMOUNT),
    "Expected bill balanceDue = 1150.",
  );

  const bankBefore =
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

  assert(bankBefore, "Financial Account not found.");

  assert(
    bankBefore.status === "ACTIVE",
    "Financial Account is not ACTIVE.",
  );

  assert(
    bankBefore.ledgerAccountId !== null &&
      bankBefore.ledgerAccount !== null,
    "Financial Account has no ledger account.",
  );

  const balanceCacheBefore =
    bankBefore.currentBalanceCache.toString();

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
    "ACCOUNTS_PAYABLE mapping missing.",
  );

  const ledgerBefore =
    await prisma.supplierLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_PAYMENT",
        referenceId: PAYMENT_ID,
      },
    });

  const journalBefore =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_PAYMENT",
        sourceId: PAYMENT_ID,
      },
    });

  assert(
    ledgerBefore === 0,
    "Supplier Payment already has ledger evidence.",
  );

  assert(
    journalBefore === 0,
    "Supplier Payment already has journal evidence.",
  );

  console.log("Payment:", paymentBefore.id);
  console.log(
    "Payment number:",
    paymentBefore.paymentNumber,
  );
  console.log("Bill:", billBefore.id);
  console.log(
    "Amount:",
    paymentBefore.amount.toString(),
    paymentBefore.currencyCode,
  );
  console.log(
    "Financial account balance cache before:",
    balanceCacheBefore,
  );

  console.log("");
  console.log("PRE-POSTING SAFETY CHECK: PASS");

  console.log("");
  console.log(
    "============================================================",
  );
  console.log(
    "EXECUTING PRODUCTION SERVICE EXACTLY ONCE",
  );
  console.log(
    "============================================================",
  );

  const result = await postSupplierPayment({
    tenantId: TENANT_ID,
    supplierPaymentId: PAYMENT_ID,
    postedById: POSTED_BY_ID,
  });

  console.log("");
  console.log("Production service returned.");
  console.log(
    "Payment ID:",
    result.supplierPayment.id,
  );
  console.log(
    "Supplier Ledger ID:",
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
          id: PAYMENT_ID,
        },
      },
      include: {
        allocations: true,
      },
    });

  assert(
    paymentAfter,
    "Supplier Payment missing after posting.",
  );

  assert(
    paymentAfter.status === "POSTED",
    `Expected payment POSTED; found ${paymentAfter.status}.`,
  );

  assert(
    paymentAfter.postedAt !== null,
    "Posted payment has no postedAt.",
  );

  assert(
    paymentAfter.amount.equals(AMOUNT),
    "Payment amount changed.",
  );

  assert(
    paymentAfter.unallocatedAmount.equals(0),
    "Payment unallocated amount changed.",
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
    "Supplier Bill missing after posting.",
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

  const ledgerEntries =
    await prisma.supplierLedgerEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        referenceType: "SUPPLIER_PAYMENT",
        referenceId: PAYMENT_ID,
      },
    });

  assert(
    ledgerEntries.length === 1,
    `Expected one Supplier Ledger entry; found ${ledgerEntries.length}.`,
  );

  const ledger = ledgerEntries[0];

  assert(ledger, "Supplier Ledger entry missing.");

  assert(
    ledger.entryType === "PAYMENT",
    `Unexpected ledger entryType ${ledger.entryType}.`,
  );

  assert(
    ledger.supplierId ===
      paymentAfter.supplierId,
    "Supplier Ledger supplier mismatch.",
  );

  assert(
    ledger.debit.equals(AMOUNT),
    "Supplier Ledger debit is not 1150.",
  );

  assert(
    ledger.credit.equals(0),
    "Supplier Ledger credit is not zero.",
  );

  const journals =
    await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_PAYMENT",
        sourceId: PAYMENT_ID,
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

  assert(journal, "Journal missing.");

  assert(
    journal.status === "POSTED",
    `Expected journal POSTED; found ${journal.status}.`,
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
      line.accountId === bankBefore.ledgerAccountId,
  );

  assert(apLine, "AP Journal line missing.");
  assert(bankLine, "Bank Journal line missing.");

  assert(
    apLine.debit.equals(AMOUNT),
    "AP debit is not 1150.",
  );

  assert(
    apLine.credit.equals(0),
    "AP credit is not zero.",
  );

  assert(
    apLine.supplierId ===
      paymentAfter.supplierId,
    "AP supplier dimension mismatch.",
  );

  assert(
    bankLine.debit.equals(0),
    "Bank debit is not zero.",
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
    "Journal debit total is not 1150.",
  );

  assert(
    totalCredit.equals(AMOUNT),
    "Journal credit total is not 1150.",
  );

  assert(
    totalDebit.equals(totalCredit),
    "Journal is not balanced.",
  );

  const bankAfter =
    await prisma.financialAccount.findUnique({
      where: {
        tenantId_id: {
          tenantId: TENANT_ID,
          id: BANK_ID,
        },
      },
    });

  assert(
    bankAfter,
    "Financial Account missing after posting.",
  );

  assert(
    bankAfter.currentBalanceCache.toString() ===
      balanceCacheBefore,
    "Supplier Payment unexpectedly mutated FinancialAccount balance cache.",
  );

  console.log("PRIMARY POSTING VERIFICATION: PASS");

  console.log("");
  console.log("=== DUPLICATE POSTING REJECTION ===");

  let duplicateRejected = false;

  try {
    await postSupplierPayment({
      tenantId: TENANT_ID,
      supplierPaymentId: PAYMENT_ID,
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
        referenceId: PAYMENT_ID,
      },
    });

  const finalJournalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType: "SUPPLIER_PAYMENT",
        sourceId: PAYMENT_ID,
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
  console.log(
    "============================================================",
  );
  console.log(
    "15R.11I SUPPLIER PAYMENT: VERIFIED",
  );
  console.log(
    "============================================================",
  );

  console.log("");
  console.log("PERMANENT EVIDENCE");
  console.log(
    "Supplier Payment ID:",
    paymentAfter.id,
  );
  console.log(
    "Payment Number:",
    paymentAfter.paymentNumber,
  );
  console.log(
    "Payment Status:",
    paymentAfter.status,
  );
  console.log(
    "Supplier Bill ID:",
    billAfter.id,
  );
  console.log(
    "Supplier Bill Status:",
    billAfter.status,
  );
  console.log(
    "Supplier Ledger ID:",
    ledger.id,
  );
  console.log(
    "Journal ID:",
    journal.id,
  );
  console.log(
    "Journal Number:",
    journal.journalNumber,
  );
  console.log(
    "Accounting: DR AP 1150 / CR Bank 1150",
  );
  console.log(
    "FinancialAccount balance cache: UNCHANGED",
  );

  console.log("");
  console.log(
    "DO NOT RERUN 15R.11I.",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("15R.11I: FAIL");
    console.error(error);
    console.error("");
    console.error(
      "DO NOT RERUN 15R.11I.",
    );
    console.error(
      "Inspect database state read-only first.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });