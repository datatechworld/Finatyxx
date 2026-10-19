import { prisma } from "./src/db/prisma.js";
import { postCreditNote } from "./src/modules/sales/credit-note-posting.service.js";
const TENANT_ID = "9af89483-476a-4367-99b0-8cc15abc0011";
const EXPECTED_ERROR = "LINKED_CREDIT_NOTES_NOT_SUPPORTED_IN_MVP";
function fail(message) {
  throw new Error(message);
}
async function main() {
  console.log(
    "============================================================"
  );
  console.log(
    "15Q.16K.3 LINKED CREDIT NOTE SAFETY VERIFICATION"
  );
  console.log(
    "============================================================"
  );
  console.log(
    "FIXTURE CREATION: NONE"
  );
  console.log(
    "EXPECTED FINANCIAL MUTATIONS: NONE"
  );
  console.log("");
  const candidate = await prisma.creditNote.findFirst({
    where: {
      tenantId: TENANT_ID,
      invoiceId: {
        not: null
      },
      status: "DRAFT",
      postedAt: null
    },
    select: {
      id: true,
      creditNoteNumber: true,
      invoiceId: true,
      status: true,
      postedAt: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });
  if (!candidate) {
    console.log(
      "SAFE STOP: No existing DRAFT linked Credit Note exists."
    );
    console.log(
      "No fixture was created and no posting call was made."
    );
    console.log(
      "15Q.16K.3 requires no destructive action."
    );
    console.log(
      "DATABASE MUTATIONS: NONE"
    );
    return;
  }
  if (candidate.invoiceId === null) {
    fail(
      "SAFETY FAILURE: Candidate is not invoice-linked."
    );
  }
  console.log(
    "Existing linked DRAFT Credit Note found:"
  );
  console.log({
    id: candidate.id,
    creditNoteNumber: candidate.creditNoteNumber,
    invoiceId: candidate.invoiceId,
    status: candidate.status,
    postedAt: candidate.postedAt
  });
  console.log("");
  const beforeLedger = await prisma.customerLedgerEntry.count({
    where: {
      tenantId: TENANT_ID,
      referenceType: "SALES_CREDIT_NOTE",
      referenceId: candidate.id
    }
  });
  const beforeJournal = await prisma.journalEntry.count({
    where: {
      tenantId: TENANT_ID,
      sourceType: "SALES_CREDIT_NOTE",
      sourceId: candidate.id
    }
  });
  console.log("Before:");
  console.log({
    customerLedgerEntries: beforeLedger,
    journals: beforeJournal
  });
  if (beforeLedger !== 0 || beforeJournal !== 0) {
    fail(
      "ABORTED: Candidate already has financial posting evidence."
    );
  }
  let rejected = false;
  let errorMessage = "";
  try {
    await postCreditNote({
      tenantId: TENANT_ID,
      creditNoteId: candidate.id,
      /*
       * The service must reject the linked Credit Note
       * before this identity could be used for posting.
       */
      postedById: "1668f4f4-48fd-44d2-9ffe-293812ee55e9"
    });
  } catch (error) {
    rejected = true;
    errorMessage = error instanceof Error ? error.message : String(error);
  }
  console.log("");
  console.log("Posting result:");
  console.log({
    rejected,
    errorMessage
  });
  if (!rejected) {
    fail(
      "CRITICAL: Linked Credit Note was not rejected."
    );
  }
  if (!errorMessage.includes(EXPECTED_ERROR)) {
    fail(
      `WRONG ERROR: Expected ${EXPECTED_ERROR}; received ${errorMessage}`
    );
  }
  const afterCreditNote = await prisma.creditNote.findFirst({
    where: {
      tenantId: TENANT_ID,
      id: candidate.id
    },
    select: {
      id: true,
      invoiceId: true,
      status: true,
      postedAt: true
    }
  });
  if (!afterCreditNote) {
    fail(
      "SAFETY FAILURE: Credit Note disappeared."
    );
  }
  const afterLedger = await prisma.customerLedgerEntry.count({
    where: {
      tenantId: TENANT_ID,
      referenceType: "SALES_CREDIT_NOTE",
      referenceId: candidate.id
    }
  });
  const afterJournal = await prisma.journalEntry.count({
    where: {
      tenantId: TENANT_ID,
      sourceType: "SALES_CREDIT_NOTE",
      sourceId: candidate.id
    }
  });
  console.log("");
  console.log("After:");
  console.log({
    creditNoteStatus: afterCreditNote.status,
    postedAt: afterCreditNote.postedAt,
    customerLedgerEntries: afterLedger,
    journals: afterJournal
  });
  if (afterCreditNote.status !== "DRAFT") {
    fail(
      "SAFETY FAILURE: Credit Note status changed."
    );
  }
  if (afterCreditNote.postedAt !== null) {
    fail(
      "SAFETY FAILURE: postedAt changed."
    );
  }
  if (afterLedger !== beforeLedger) {
    fail(
      "SAFETY FAILURE: Customer ledger changed."
    );
  }
  if (afterJournal !== beforeJournal) {
    fail(
      "SAFETY FAILURE: Journal evidence changed."
    );
  }
  console.log("");
  console.log(
    "============================================================"
  );
  console.log(
    "15Q.16K.3 BEHAVIORAL SAFETY VERIFICATION: PASS"
  );
  console.log(
    "============================================================"
  );
  console.log(
    "Linked Credit Note correctly rejected."
  );
  console.log(
    "Credit Note remains DRAFT."
  );
  console.log(
    "Customer Ledger mutations: NONE"
  );
  console.log(
    "Journal mutations: NONE"
  );
  console.log(
    "Financial mutations: NONE"
  );
}
main().catch((error) => {
  console.error("");
  console.error(
    "15Q.16K.3 VERIFICATION FAILED"
  );
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
