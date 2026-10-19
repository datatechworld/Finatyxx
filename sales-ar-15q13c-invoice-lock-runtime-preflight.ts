import {
  Prisma,
} from "./src/generated/prisma/client.ts";

import { prisma } from "./src/db/prisma.ts";

const TENANT_ID =
  "9af89483-476a-4367-99b0-8cc15abc0011";

const INVOICE_ID =
  "dc91bb6d-c9a4-4590-b490-92b57f4ba235";

class IntentionalRollback extends Error {
  constructor() {
    super("15Q.13C intentional rollback");
    this.name = "IntentionalRollback";
  }
}

type LockedInvoiceRow = {
  id: string;
};

async function main() {
  console.log(
    "=== 15Q.13C INVOICE LOCK RUNTIME PREFLIGHT ===",
  );

  let lockVerified = false;
  let invoiceVerified = false;

  try {
    await prisma.$transaction(
      async (tx) => {
        const invoiceIds = [
          INVOICE_ID,
        ];

        console.log("");
        console.log(
          "=== EXECUTING EXACT SERVICE LOCK PATTERN ===",
        );

        const lockedRows =
          await tx.$queryRaw<LockedInvoiceRow[]>`
            SELECT id::text AS id
            FROM public.invoices
            WHERE "tenantId" = ${TENANT_ID}::uuid
              AND id = ANY(
                ${invoiceIds}::uuid[]
              )
            ORDER BY id
            FOR UPDATE
          `;

        console.log({
          lockedRows,
        });

        lockVerified =
          lockedRows.length === 1 &&
          lockedRows[0]?.id === INVOICE_ID;

        /*
         * Re-read the locked row using Prisma.
         */
        const invoice =
          await tx.invoice.findFirst({
            where: {
              id: INVOICE_ID,
              tenantId: TENANT_ID,
            },
            select: {
              id: true,
              tenantId: true,
              invoiceNumber: true,
              currencyCode: true,
              exchangeRate: true,
              total: true,
              amountPaid: true,
              balanceDue: true,
              status: true,
            },
          });

        console.log("");
        console.log("=== LOCKED INVOICE RE-READ ===");

        if (!invoice) {
          throw new Error(
            "STOP: frozen invoice disappeared after row lock.",
          );
        }

        console.log({
          ...invoice,
          exchangeRate:
            invoice.exchangeRate.toString(),
          total:
            invoice.total.toString(),
          amountPaid:
            invoice.amountPaid.toString(),
          balanceDue:
            invoice.balanceDue.toString(),
        });

        invoiceVerified =
          invoice.id === INVOICE_ID &&
          invoice.tenantId === TENANT_ID &&
          invoice.currencyCode === "GHS" &&
          invoice.exchangeRate.toString() === "1" &&
          invoice.total.toString() === "1150" &&
          invoice.amountPaid.toString() === "0" &&
          invoice.balanceDue.toString() === "1150" &&
          invoice.status === "POSTED";

        console.log("");
        console.log(
          "Lock result verified:",
          lockVerified,
        );

        console.log(
          "Invoice state verified:",
          invoiceVerified,
        );

        if (!lockVerified || !invoiceVerified) {
          throw new Error(
            "STOP: invoice lock runtime verification failed.",
          );
        }

        /*
         * Force rollback even though this test performs no
         * intended writes. This establishes an explicit
         * rollback-safe testing boundary.
         */
        throw new IntentionalRollback();
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    throw new Error(
      "STOP: transaction unexpectedly committed.",
    );
  } catch (error) {
    if (error instanceof IntentionalRollback) {
      console.log("");
      console.log(
        "Intentional rollback observed: true",
      );
    } else {
      throw error;
    }
  }

  /*
   * Verify the frozen invoice again outside the rolled-back
   * transaction.
   */
  const after =
    await prisma.invoice.findFirst({
      where: {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
      },
      select: {
        id: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
      },
    });

  console.log("");
  console.log("=== POST-ROLLBACK STATE ===");

  if (!after) {
    throw new Error(
      "STOP: frozen invoice not found after rollback.",
    );
  }

  console.log({
    id: after.id,
    amountPaid:
      after.amountPaid.toString(),
    balanceDue:
      after.balanceDue.toString(),
    status: after.status,
  });

  const rollbackStateVerified =
    after.id === INVOICE_ID &&
    after.amountPaid.toString() === "0" &&
    after.balanceDue.toString() === "1150" &&
    after.status === "POSTED";

  console.log("");
  console.log(
    "Post-rollback state verified:",
    rollbackStateVerified,
  );

  const passed =
    lockVerified &&
    invoiceVerified &&
    rollbackStateVerified;

  console.log("");

  console.log(
    passed
      ? "15Q.13C INVOICE LOCK RUNTIME PREFLIGHT: PASS"
      : "15Q.13C INVOICE LOCK RUNTIME PREFLIGHT: FAILED",
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "15Q.13C INVOICE LOCK RUNTIME PREFLIGHT: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });