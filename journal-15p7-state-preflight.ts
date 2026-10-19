import { prisma } from "./src/db/prisma.ts";

const [
  total,
  draft,
  posted,
  reversed,
  voided,
  reversalLinks,
] = await Promise.all([
  prisma.journalEntry.count(),
  prisma.journalEntry.count({ where: { status: "DRAFT" } }),
  prisma.journalEntry.count({ where: { status: "POSTED" } }),
  prisma.journalEntry.count({ where: { status: "REVERSED" } }),
  prisma.journalEntry.count({ where: { status: "VOID" } }),
  prisma.journalEntry.count({
    where: { reversalOfId: { not: null } },
  }),
]);

console.log("Checkpoint 15P.7C — Existing Journal State Preflight");
console.log(`Total journals: ${total}`);
console.log(`DRAFT: ${draft}`);
console.log(`POSTED: ${posted}`);
console.log(`REVERSED: ${reversed}`);
console.log(`VOID: ${voided}`);
console.log(`Reversal-linked journals: ${reversalLinks}`);

await prisma.$disconnect();