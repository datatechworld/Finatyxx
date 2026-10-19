import { getAuth } from "@clerk/fastify";
import type { FastifyRequest } from "fastify";

import {
  AuthorizationError,
  requireAuthorization,
  type BranchAccessRequirement,
} from "../../authorization/authorization.service.js";

import {
  resolveFinatyxIdentity,
} from "../../auth/identity.service.js";

import { ApiError } from "./api-error.js";

export type AuthorizedApiContext = {
  userId: string;
  clerkUserId: string;
  tenantId: string;
};

export type RequireApiAuthorizationInput = {
  request: FastifyRequest;
  tenantId: string;
  permissionCode: string;
  branchId?: string;
  minimumBranchAccess?: BranchAccessRequirement;
  requiredFeatureCode?: string;
};

function requireNonEmpty(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new ApiError(
      400,
      "invalid_request",
      `${fieldName} is required.`,
    );
  }

  return normalized;
}

export async function requireApiAuthorization(
  input: RequireApiAuthorizationInput,
): Promise<AuthorizedApiContext> {
  const tenantId = requireNonEmpty(
    input.tenantId,
    "Tenant ID",
  );

  const {
    isAuthenticated,
    userId: clerkUserId,
  } = getAuth(input.request);

  if (!isAuthenticated || !clerkUserId) {
    throw new ApiError(
      401,
      "unauthorized",
      "Authentication required.",
    );
  }

  let identity;

  try {
    identity =
      await resolveFinatyxIdentity(clerkUserId);
  } catch {
    throw new ApiError(
      401,
      "identity_resolution_failed",
      "Unable to resolve the authenticated Finatyx user.",
    );
  }

  try {
    await requireAuthorization({
      userId: identity.id,
      tenantId,
      permissionCode: input.permissionCode,
      ...(input.branchId
        ? { branchId: input.branchId }
        : {}),
      ...(input.minimumBranchAccess
        ? {
            minimumBranchAccess:
              input.minimumBranchAccess,
          }
        : {}),
      ...(input.requiredFeatureCode
        ? {
            requiredFeatureCode:
              input.requiredFeatureCode,
          }
        : {}),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw new ApiError(
        error.statusCode,
        "forbidden",
        error.message,
      );
    }

    throw error;
  }

  return {
    userId: identity.id,
    clerkUserId,
    tenantId,
  };
}