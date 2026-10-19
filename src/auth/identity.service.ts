import { prisma } from "../db/prisma.js";

export type FinatyxIdentity = {
  id: string;
  clerkId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Resolves an authenticated Clerk user to Finatyx's internal User record.
 *
 * Clerk remains the authoritative authentication provider.
 * Finatyx uses its own UUID-based User record for internal relationships,
 * tenant memberships, permissions, financial records, and audit trails.
 *
 * This function deliberately does NOT:
 * - create a tenant
 * - create a tenant membership
 * - assign a role
 * - grant branch access
 * - grant permissions
 *
 * Those responsibilities belong to the Finatyx onboarding and
 * authorization layers.
 */
export async function resolveFinatyxIdentity(
  clerkUserId: string
): Promise<FinatyxIdentity> {
  const normalizedClerkUserId = clerkUserId.trim();

  if (!normalizedClerkUserId) {
    throw new Error(
      "A valid Clerk user ID is required to resolve a Finatyx identity."
    );
  }

  const user = await prisma.user.upsert({
    where: {
      clerkId: normalizedClerkUserId,
    },
    update: {},
    create: {
      clerkId: normalizedClerkUserId,
    },
    select: {
      id: true,
      clerkId: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
}