import { randomUUID } from "node:crypto";

import { prisma } from "./src/db/prisma.ts";

import {
  CustomerPaymentPostingError,
  postCustomerPayment,
} from "./src/modules/sales/customer-payment-posting.service.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const BRANCH_ID =
  "8b675c86-7c95-4da8-a0b8-37be06f3cf64";

const CUSTOMER_ID =
  "ab359555-fbf8-469a-8b05-83f7a232badc";

const FROZEN_INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

const FINANCIAL_ACCOUNT_ID =
  "6dcc5237-4028-4a20-8f32-8f4a59c34884";

const USER_ID =
  "1668f4f4-48fd-44d2-9ffe-293812ee55e9";

const SERVICE_EXPECTED_HASH =
  "FB65F0BDAA94C1C0B0B567D4BE08533996A182E0DF8B094FA5EBF4D57E0A6F3F";

const PAYMENT_AMOUNT = 100;
const ALLOCATION_AMOUNT = 60;
const UNALLOCATED_AMOUNT = 40;

async function main() {
  console.log(
    "=== 15Q.15C.2 UNDERALLOCATED PAYMENT TEST ===",
  );

  /*
   * The production service itself is tested here.
   *
   * This fixture is intentionally invalid for the current MVP:
   *
   * Payment       GHS 100
   * Allocation    GHS  60
   * Unallocated   GHS  40
   *
   * Expected:
   * PAYMENT_NOT_FULLY_ALLOCATED
   *
   * The hardened guard executes before invoice locking and
   * invoice-status validation, so the existing frozen PAID
   * invoice may safely serve as the FK target without being
   * modified.
   */

  const fixtureToken =
    `15Q15C2-${randomUUID()}`;

  const paymentNumber =
    fixtureToken.slice(0, 80);

  let paymentId: string | null = null;

  const invoiceBefore =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FROZEN_INVOICE_ID,
      },
      select: {
        id: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        paidAt: true,
      },
    });

  if (!invoiceBefore) {
    throw new Error(
      "Frozen invoice was not found.",
    );
  }

  console.log("");
  console.log("Frozen invoice before test:", {
    id: invoiceBefore.id,
    total: invoiceBefore.total.toString(),
    amountPaid:
      invoiceBefore.amountPaid.toString(),
    balanceDue:
      invoiceBefore.balanceDue.toString(),
    status: invoiceBefore.status,
    paidAt: invoiceBefore.paidAt,
  });

  try {
    const payment =
      await prisma.payment.create({
        data: {
          id: randomUUID(),
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          customerId: CUSTOMER_ID,
          paymentNumber,
          paymentDate: new Date(
            "2098-06-22T00:00:00.000Z",
          ),
          currencyCode: "GHS",
          exchangeRate: 1,
          amount: PAYMENT_AMOUNT,
          unallocatedAmount:
            UNALLOCATED_AMOUNT,
          financialAccountId:
            FINANCIAL_ACCOUNT_ID,
          reference:
            "15Q.15C.2 underallocated payment rejection test",
          status: "DRAFT",
          receivedById: USER_ID,
        },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          unallocatedAmount: true,
          status: true,
          postedAt: true,
        },
      });

    paymentId = payment.id;

    await prisma.paymentAllocation.create({
      data: {
        id: randomUUID(),
        tenantId: TENANT_ID,
        paymentId: payment.id,
        invoiceId: FROZEN_INVOICE_ID,
        amount: ALLOCATION_AMOUNT,
      },
    });

    console.log("");
    console.log("Temporary fixture created:", {
      paymentId: payment.id,
      paymentNumber:
        payment.paymentNumber,
      amount: payment.amount.toString(),
      allocatedAmount:
        ALLOCATION_AMOUNT.toString(),
      unallocatedAmount:
        payment.unallocatedAmount.toString(),
      status: payment.status,
    });

    let rejectedCode: string | null = null;
    let rejectedMessage: string | null = null;

    try {
      await postCustomerPayment({
        tenantId: TENANT_ID,
        paymentId: payment.id,
        postedById: USER_ID,
      });

      throw new Error(
        "Production service unexpectedly posted an underallocated payment.",
      );
    } catch (error) {
      if (
        error instanceof
        CustomerPaymentPostingError
      ) {
        rejectedCode = error.code;
        rejectedMessage = error.message;
      } else {
        throw error;
      }
    }

    console.log("");
    console.log("Service rejection:", {
      code: rejectedCode,
      message: rejectedMessage,
    });

    if (
      rejectedCode !==
      "PAYMENT_NOT_FULLY_ALLOCATED"
    ) {
      throw new Error(
        `Expected PAYMENT_NOT_FULLY_ALLOCATED but received ${rejectedCode ?? "UNKNOWN_ERROR"}.`,
      );
    }

    /*
     * Verify the rejected service transaction produced
     * absolutely no accounting side effects.
     */

    const [
      paymentAfter,
      ledgerCount,
      journalCount,
      invoiceAfter,
      allocationCount,
    ] = await Promise.all([
      prisma.payment.findFirst({
        where: {
          tenantId: TENANT_ID,
          id: payment.id,
        },
        select: {
          status: true,
          postedAt: true,
          amount: true,
          unallocatedAmount: true,
        },
      }),

      prisma.customerLedgerEntry.count({
        where: {
          tenantId: TENANT_ID,
          referenceType:
            "CUSTOMER_PAYMENT",
          referenceId: payment.id,
        },
      }),

      prisma.journalEntry.count({
        where: {
          tenantId: TENANT_ID,
          sourceType:
            "CUSTOMER_PAYMENT",
          sourceId: payment.id,
        },
      }),

      prisma.invoice.findFirst({
        where: {
          tenantId: TENANT_ID,
          id: FROZEN_INVOICE_ID,
        },
        select: {
          total: true,
          amountPaid: true,
          balanceDue: true,
          status: true,
          paidAt: true,
        },
      }),

      prisma.paymentAllocation.count({
        where: {
          tenantId: TENANT_ID,
          paymentId: payment.id,
        },
      }),
    ]);

    if (!paymentAfter || !invoiceAfter) {
      throw new Error(
        "Post-rejection verification records were not found.",
      );
    }

    const assertions = {
      exactRejection:
        rejectedCode ===
        "PAYMENT_NOT_FULLY_ALLOCATED",

      paymentStillDraft:
        paymentAfter.status === "DRAFT" &&
        paymentAfter.postedAt === null,

      paymentAmountsPreserved:
        paymentAfter.amount.equals(
          PAYMENT_AMOUNT,
        ) &&
        paymentAfter.unallocatedAmount.equals(
          UNALLOCATED_AMOUNT,
        ),

      allocationPreservedForVerification:
        allocationCount === 1,

      noCustomerLedgerEntry:
        ledgerCount === 0,

      noJournalEntry:
        journalCount === 0,

      frozenInvoiceUntouched:
        invoiceAfter.total.equals(
          invoiceBefore.total,
        ) &&
        invoiceAfter.amountPaid.equals(
          invoiceBefore.amountPaid,
        ) &&
        invoiceAfter.balanceDue.equals(
          invoiceBefore.balanceDue,
        ) &&
        invoiceAfter.status ===
          invoiceBefore.status &&
        (
          invoiceAfter.paidAt?.getTime() ??
          null
        ) ===
          (
            invoiceBefore.paidAt?.getTime() ??
            null
          ),
    };

    console.log("");
    console.log(
      "=== POST-REJECTION ASSERTIONS ===",
    );
    console.table(assertions);

    if (
      !Object.values(assertions).every(
        Boolean,
      )
    ) {
      throw new Error(
        "15Q.15C.2 accounting safety assertions failed.",
      );
    }

    console.log("");
    console.log(
      "UNDERALLOCATED PAYMENT REJECTION: PASS",
    );
  } finally {
    /*
     * Cleanup is permitted only for this temporary DRAFT
     * fixture. Posted/frozen payment evidence is never touched.
     */

    if (paymentId) {
      const ledgerCount =
        await prisma.customerLedgerEntry.count({
          where: {
            tenantId: TENANT_ID,
            referenceType:
              "CUSTOMER_PAYMENT",
            referenceId: paymentId,
          },
        });

      const journalCount =
        await prisma.journalEntry.count({
          where: {
            tenantId: TENANT_ID,
            sourceType:
              "CUSTOMER_PAYMENT",
            sourceId: paymentId,
          },
        });

      const payment =
        await prisma.payment.findFirst({
          where: {
            tenantId: TENANT_ID,
            id: paymentId,
          },
          select: {
            status: true,
            postedAt: true,
          },
        });

      const safeToDelete =
        payment !== null &&
        payment.status === "DRAFT" &&
        payment.postedAt === null &&
        ledgerCount === 0 &&
        journalCount === 0;

      if (!safeToDelete) {
        throw new Error(
          "TEMP_FIXTURE_CLEANUP_BLOCKED: fixture is not safely deletable.",
        );
      }

      await prisma.$transaction(
        async (tx) => {
          await tx.paymentAllocation.deleteMany({
            where: {
              tenantId: TENANT_ID,
              paymentId,
            },
          });

          await tx.payment.delete({
            where: {
              tenantId_id: {
                tenantId: TENANT_ID,
                id: paymentId,
              },
            },
          });
        },
      );

      const [
        remainingPayment,
        remainingAllocations,
      ] = await Promise.all([
        prisma.payment.count({
          where: {
            tenantId: TENANT_ID,
            id: paymentId,
          },
        }),

        prisma.paymentAllocation.count({
          where: {
            tenantId: TENANT_ID,
            paymentId,
          },
        }),
      ]);

      console.log("");
      console.log("Cleanup verification:", {
        remainingPayment,
        remainingAllocations,
      });

      if (
        remainingPayment !== 0 ||
        remainingAllocations !== 0
      ) {
        throw new Error(
          "Temporary fixture cleanup failed.",
        );
      }
    }
  }

  /*
   * Final frozen-state verification after temporary fixture
   * cleanup.
   */

  const finalInvoice =
    await prisma.invoice.findFirst({
      where: {
        tenantId: TENANT_ID,
        id: FROZEN_INVOICE_ID,
      },
      select: {
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        paidAt: true,
      },
    });

  if (
    !finalInvoice ||
    !finalInvoice.total.equals(1150) ||
    !finalInvoice.amountPaid.equals(1150) ||
    !finalInvoice.balanceDue.equals(0) ||
    finalInvoice.status !== "PAID" ||
    finalInvoice.paidAt === null
  ) {
    throw new Error(
      "Frozen settlement changed during 15Q.15C.2.",
    );
  }

  console.log("");
  console.log(
    "Frozen settlement after cleanup: PRESERVED",
  );

  console.log("");
  console.log(
    "15Q.15C.2 UNDERALLOCATED PAYMENT TEST: PASS",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.15C.2 UNDERALLOCATED PAYMENT TEST: FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });