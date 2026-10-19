import { prisma } from "./src/db/prisma.ts";
import {
  allocateDocumentNumberInTransaction,
} from "./src/modules/documents/document-number.service.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

const RECEIVED_BY_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const PAYMENT_DATE =
  new Date("2098-06-21T00:00:00.000Z");

const PAYMENT_SEQUENCE_DATE =
  "2098-06-21";

const PAYMENT_AMOUNT =
  "550";

const REFERENCE =
  "15Q.14B GHS 550 final settlement test";

async function main() {
  console.log(
    "=== 15Q.14B.1 CREATE FINAL-SETTLEMENT DRAFT ===",
  );

  /*
   * Safety guard.
   *
   * This prevents an accidental rerun from creating a second
   * final-settlement fixture.
   */
  const existing =
    await prisma.payment.findFirst({
      where: {
        tenantId: TENANT_ID,
        reference: REFERENCE,
      },
      select: {
        id: true,
        paymentNumber: true,
        amount: true,
        status: true,
      },
    });

  if (existing) {
    throw new Error(
      `STOP: 15Q.14B fixture already exists: ${existing.paymentNumber} (${existing.id}) amount=${existing.amount.toString()} status=${existing.status}. Do not create another one.`,
    );
  }

  /*
   * Reconfirm the exact frozen invoice starting state.
   */
  const invoice =
    await prisma.invoice.findFirst({
      where: {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        customerId: true,
        currencyCode: true,
        exchangeRate: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        postedAt: true,
        paidAt: true,
      },
    });

  if (!invoice) {
    throw new Error(
      "STOP: target invoice was not found.",
    );
  }

  if (
    invoice.currencyCode !== "GHS" ||
    invoice.exchangeRate.toString() !== "1" ||
    invoice.total.toString() !== "1150" ||
    invoice.amountPaid.toString() !== "600" ||
    invoice.balanceDue.toString() !==
      PAYMENT_AMOUNT ||
    invoice.status !== "PARTIALLY_PAID" ||
    invoice.postedAt === null ||
    invoice.paidAt !== null
  ) {
    throw new Error(
      "STOP: invoice is no longer in the verified 15Q.14A starting state.",
    );
  }

  /*
   * Reconfirm the exact BANK -> GL 1110 contract.
   */
  const financialAccount =
    await prisma.financialAccount.findFirst({
      where: {
        id: FINANCIAL_ACCOUNT_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        accountType: true,
        currencyCode: true,
        status: true,
        ledgerAccountId: true,

        ledgerAccount: {
          select: {
            id: true,
            tenantId: true,
            code: true,
            name: true,
            type: true,
            normalBalance: true,
            status: true,
          },
        },
      },
    });

  if (!financialAccount) {
    throw new Error(
      "STOP: test financial account was not found.",
    );
  }

  if (
    financialAccount.accountType !== "BANK" ||
    financialAccount.currencyCode !== "GHS" ||
    financialAccount.status !== "ACTIVE" ||
    financialAccount.ledgerAccountId !==
      financialAccount.ledgerAccount.id ||
    financialAccount.ledgerAccount.tenantId !==
      TENANT_ID ||
    financialAccount.ledgerAccount.code !==
      "1110" ||
    financialAccount.ledgerAccount.type !==
      "ASSET" ||
    financialAccount.ledgerAccount.normalBalance !==
      "DEBIT" ||
    financialAccount.ledgerAccount.status !==
      "ACTIVE"
  ) {
    throw new Error(
      "STOP: financial account no longer matches the verified 15Q contract.",
    );
  }

  if (
    invoice.branchId !==
    financialAccount.branchId
  ) {
    throw new Error(
      "STOP: invoice and financial account branch mismatch.",
    );
  }

  /*
   * Before entering the write transaction, verify that this
   * invoice still has exactly one existing allocation:
   * the frozen GHS 600 receipt.
   */
  const allocationCountBefore =
    await prisma.paymentAllocation.count({
      where: {
        tenantId: TENANT_ID,
        invoiceId: INVOICE_ID,
      },
    });

  if (allocationCountBefore !== 1) {
    throw new Error(
      `STOP: expected exactly 1 existing invoice allocation before final settlement; found ${allocationCountBefore}.`,
    );
  }

  /*
   * Sequence allocation + Payment + PaymentAllocation are one
   * Serializable transaction.
   *
   * Therefore, if anything below fails, the receipt number
   * allocation rolls back with the fixture.
   */
  const result =
    await prisma.$transaction(
      async (tx) => {
        const allocatedNumber =
          await allocateDocumentNumberInTransaction(
            tx,
            TENANT_ID,
            "RECEIPT",
            PAYMENT_SEQUENCE_DATE,
          );

        if (
          allocatedNumber.documentType !==
            "RECEIPT" ||
          allocatedNumber.prefix !== "REC" ||
          allocatedNumber.year !== 2098 ||
          allocatedNumber.number !== 2n ||
          allocatedNumber.documentNumber !==
            "REC-2098-000002"
        ) {
          throw new Error(
            `STOP: unexpected receipt allocation ${allocatedNumber.documentNumber}; expected REC-2098-000002.`,
          );
        }

        const payment =
          await tx.payment.create({
            data: {
              tenantId: TENANT_ID,
              branchId: invoice.branchId,
              customerId: invoice.customerId,
              paymentNumber:
                allocatedNumber.documentNumber,
              paymentDate: PAYMENT_DATE,
              currencyCode: "GHS",
              exchangeRate: "1",
              amount: PAYMENT_AMOUNT,
              unallocatedAmount: "0",
              financialAccountId:
                FINANCIAL_ACCOUNT_ID,
              reference: REFERENCE,
              status: "DRAFT",
              receivedById: RECEIVED_BY_ID,
            },
            select: {
              id: true,
              tenantId: true,
              branchId: true,
              customerId: true,
              paymentNumber: true,
              paymentDate: true,
              currencyCode: true,
              exchangeRate: true,
              amount: true,
              unallocatedAmount: true,
              financialAccountId: true,
              reference: true,
              status: true,
              postedAt: true,
              receivedById: true,
            },
          });

        const allocation =
          await tx.paymentAllocation.create({
            data: {
              tenantId: TENANT_ID,
              paymentId: payment.id,
              invoiceId: INVOICE_ID,
              amount: PAYMENT_AMOUNT,
            },
            select: {
              id: true,
              tenantId: true,
              paymentId: true,
              invoiceId: true,
              amount: true,
            },
          });

        return {
          allocatedNumber,
          payment,
          allocation,
        };
      },
      {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

  console.log("");
  console.log("=== DOCUMENT NUMBER ALLOCATION ===");

  console.log({
    documentNumber:
      result.allocatedNumber.documentNumber,
    documentType:
      result.allocatedNumber.documentType,
    prefix:
      result.allocatedNumber.prefix,
    year:
      result.allocatedNumber.year,
    number:
      result.allocatedNumber.number.toString(),
    padding:
      result.allocatedNumber.padding,
  });

  console.log("");
  console.log("=== CREATED DRAFT PAYMENT ===");

  console.log({
    id:
      result.payment.id,
    paymentNumber:
      result.payment.paymentNumber,
    paymentDate:
      result.payment.paymentDate,
    customerId:
      result.payment.customerId,
    branchId:
      result.payment.branchId,
    currencyCode:
      result.payment.currencyCode,
    exchangeRate:
      result.payment.exchangeRate.toString(),
    amount:
      result.payment.amount.toString(),
    unallocatedAmount:
      result.payment.unallocatedAmount.toString(),
    financialAccountId:
      result.payment.financialAccountId,
    reference:
      result.payment.reference,
    status:
      result.payment.status,
    postedAt:
      result.payment.postedAt,
    receivedById:
      result.payment.receivedById,
  });

  console.log("");
  console.log("=== CREATED ALLOCATION ===");

  console.log({
    id:
      result.allocation.id,
    tenantId:
      result.allocation.tenantId,
    paymentId:
      result.allocation.paymentId,
    invoiceId:
      result.allocation.invoiceId,
    amount:
      result.allocation.amount.toString(),
  });

  /*
   * Independent post-commit verification.
   */
  const persisted =
    await prisma.payment.findFirst({
      where: {
        id: result.payment.id,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        customerId: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        unallocatedAmount: true,
        currencyCode: true,
        exchangeRate: true,
        financialAccountId: true,
        reference: true,
        status: true,
        postedAt: true,
        receivedById: true,

        allocations: {
          select: {
            id: true,
            tenantId: true,
            paymentId: true,
            invoiceId: true,
            amount: true,
          },
        },
      },
    });

  const invoiceAfter =
    await prisma.invoice.findFirst({
      where: {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
      },
      select: {
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        postedAt: true,
        paidAt: true,
      },
    });

  const ledgerCount =
    await prisma.customerLedgerEntry.count({
      where: {
        tenantId: TENANT_ID,
        referenceType:
          "CUSTOMER_PAYMENT",
        referenceId:
          result.payment.id,
      },
    });

  const journalCount =
    await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        sourceType:
          "CUSTOMER_PAYMENT",
        sourceId:
          result.payment.id,
      },
    });

  const allocationCountAfter =
    await prisma.paymentAllocation.count({
      where: {
        tenantId: TENANT_ID,
        invoiceId: INVOICE_ID,
      },
    });

  const sequenceAfter =
    await prisma.documentSequence.findFirst({
      where: {
        tenantId: TENANT_ID,
        documentType: "RECEIPT",
        year: 2098,
        branchId: null,
      },
      select: {
        nextNumber: true,
      },
    });

  if (
    !persisted ||
    !invoiceAfter ||
    !sequenceAfter
  ) {
    throw new Error(
      "STOP: post-create verification could not load required records.",
    );
  }

  const sequenceVerified =
    result.allocatedNumber.documentNumber ===
      "REC-2098-000002" &&
    result.allocatedNumber.number === 2n &&
    sequenceAfter.nextNumber === 3n;

  const draftVerified =
    persisted.paymentNumber ===
      "REC-2098-000002" &&
    persisted.status === "DRAFT" &&
    persisted.postedAt === null &&
    persisted.currencyCode === "GHS" &&
    persisted.exchangeRate.toString() === "1" &&
    persisted.amount.toString() === "550" &&
    persisted.unallocatedAmount.toString() === "0" &&
    persisted.financialAccountId ===
      FINANCIAL_ACCOUNT_ID &&
    persisted.reference === REFERENCE &&
    persisted.receivedById ===
      RECEIVED_BY_ID &&
    persisted.customerId ===
      invoice.customerId &&
    persisted.branchId ===
      invoice.branchId &&
    persisted.allocations.length === 1 &&
    persisted.allocations[0]!.tenantId ===
      TENANT_ID &&
    persisted.allocations[0]!.paymentId ===
      persisted.id &&
    persisted.allocations[0]!.invoiceId ===
      INVOICE_ID &&
    persisted.allocations[0]!.amount.toString() ===
      "550";

  const invoiceUntouched =
    invoiceAfter.total.toString() === "1150" &&
    invoiceAfter.amountPaid.toString() === "600" &&
    invoiceAfter.balanceDue.toString() === "550" &&
    invoiceAfter.status === "PARTIALLY_PAID" &&
    invoiceAfter.postedAt !== null &&
    invoiceAfter.paidAt === null;

  const noAccountingYet =
    ledgerCount === 0 &&
    journalCount === 0;

  const allocationCountVerified =
    allocationCountAfter === 2;

  console.log("");
  console.log("=== POST-CREATE ASSERTIONS ===");

  console.log(
    "Receipt sequence advanced exactly once:",
    sequenceVerified,
  );

  console.log(
    "Draft receipt contract:",
    draftVerified,
  );

  console.log(
    "Invoice remains untouched:",
    invoiceUntouched,
  );

  console.log(
    "No ledger/journal before posting:",
    noAccountingYet,
  );

  console.log(
    "Invoice now has exactly two allocations:",
    allocationCountVerified,
  );

  const passed =
    sequenceVerified &&
    draftVerified &&
    invoiceUntouched &&
    noAccountingYet &&
    allocationCountVerified;

  console.log("");

  console.log(
    passed
      ? "15Q.14B.1 CREATE FINAL-SETTLEMENT DRAFT: PASS"
      : "15Q.14B.1 CREATE FINAL-SETTLEMENT DRAFT: FAILED",
  );

  console.log("");
  console.log(
    "15Q.14B.1 PAYMENT ID:",
    result.payment.id,
  );

  console.log(
    "15Q.14B.1 ALLOCATION ID:",
    result.allocation.id,
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.14B.1 CREATE FINAL-SETTLEMENT DRAFT: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });