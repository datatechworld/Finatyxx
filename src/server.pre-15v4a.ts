import Fastify from "fastify";
import { clerkPlugin, getAuth } from "@clerk/fastify";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prisma } from "./db/prisma.js";
import { resolveFinatyxIdentity } from "./auth/identity.service.js";
import {
  createBusinessForUser,
  type CreateBusinessInput,
} from "./modules/onboarding/business-onboarding.service.js";
import {
  authorize,
  type BranchAccessRequirement,
} from "./authorization/authorization.service.js";

const app = Fastify({
  logger: true,
});

// Clerk authentication
await app.register(clerkPlugin);

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const authTestDirectory = path.join(
  currentDirectory,
  "auth-test"
);

const clerkJsDirectory = path.resolve(
  process.cwd(),
  "node_modules",
  "@clerk",
  "clerk-js",
  "dist"
);

const clerkUiDirectory = path.resolve(
  process.cwd(),
  "node_modules",
  "@clerk",
  "ui",
  "dist"
);

// Public health endpoint
app.get("/health", async () => {
  return {
    status: "ok",
    service: "finatyx-api",
    timestamp: new Date().toISOString(),
  };
});

// Temporary read-only database connectivity test.
//
// This endpoint verifies:
// Fastify -> Prisma -> PostgreSQL adapter -> Supabase PostgreSQL.
//
// It does not insert, update, or delete any data.
app.get("/api/v1/db/health", async (_request, reply) => {
  try {
    const result = await prisma.$queryRaw<
      Array<{
        database_name: string;
        server_time: Date;
      }>
    >`
      SELECT
        current_database() AS database_name,
        NOW() AS server_time
    `;

    const database = result[0];

    if (!database) {
      throw new Error(
        "PostgreSQL returned no database health result."
      );
    }

    return {
      status: "ok",
      database: "connected",
      databaseName: database.database_name,
      serverTime: database.server_time,
    };
  } catch (error) {
    app.log.error(
      {
        err: error,
      },
      "Finatyx database health check failed"
    );

    return reply.status(503).send({
      status: "error",
      database: "unavailable",
      message:
        "Unable to connect to the Finatyx database.",
    });
  }
});

// Temporary Clerk authentication test page
app.get("/auth-test", async (_request, reply) => {
  const html = await readFile(
    path.join(authTestDirectory, "index.html"),
    "utf8"
  );

  return reply
    .type("text/html; charset=utf-8")
    .send(html);
});

// Browser-side authentication test script
app.get(
  "/auth-test/auth-test.js",
  async (_request, reply) => {
    const javascript = await readFile(
      path.join(
        authTestDirectory,
        "auth-test.js"
      ),
      "utf8"
    );

    return reply
      .type("text/javascript; charset=utf-8")
      .send(javascript);
  }
);

// Serve ClerkJS ES module.
// auth-test.js imports { Clerk }, so this must be clerk.mjs.
app.get(
  "/auth-test/clerk.js",
  async (_request, reply) => {
    const clerkModulePath = path.join(
      clerkJsDirectory,
      "clerk.mjs"
    );

    const javascript = await readFile(
      clerkModulePath,
      "utf8"
    );

    return reply
      .type("text/javascript; charset=utf-8")
      .send(javascript);
  }
);

// Serve Clerk's main prebuilt browser UI bundle.
app.get(
  "/auth-test/clerk-ui.js",
  async (_request, reply) => {
    const clerkUiModulePath = path.join(
      clerkUiDirectory,
      "ui.browser.js"
    );

    const javascript = await readFile(
      clerkUiModulePath,
      "utf8"
    );

    return reply
      .type("text/javascript; charset=utf-8")
      .send(javascript);
  }
);

// Serve Clerk UI's dynamically loaded JavaScript chunks.
app.get<{
  Params: {
    chunk: string;
  };
}>(
  "/auth-test/:chunk",
  async (request, reply) => {
    const { chunk } = request.params;

    const isAllowedClerkUiChunk =
      /^[A-Za-z0-9_-]+_ui_[A-Za-z0-9._-]+\.js$/.test(
        chunk
      );

    if (!isAllowedClerkUiChunk) {
      return reply.status(404).send({
        error: "not_found",
        message: "Resource not found.",
      });
    }

    const chunkPath = path.resolve(
      clerkUiDirectory,
      chunk
    );

    // Defense against path traversal.
    if (
      path.dirname(chunkPath) !==
      path.resolve(clerkUiDirectory)
    ) {
      return reply.status(404).send({
        error: "not_found",
        message: "Resource not found.",
      });
    }

    try {
      const javascript = await readFile(
        chunkPath,
        "utf8"
      );

      return reply
        .type("text/javascript; charset=utf-8")
        .send(javascript);
    } catch {
      return reply.status(404).send({
        error: "not_found",
        message: "Resource not found.",
      });
    }
  }
);

// Expose ONLY Clerk's public frontend key.
// Never expose CLERK_SECRET_KEY here.
app.get(
  "/auth-test/config",
  async (_request, reply) => {
    const publishableKey =
      process.env.CLERK_PUBLISHABLE_KEY;

    if (!publishableKey) {
      return reply.status(500).send({
        error: "configuration_error",
        message:
          "CLERK_PUBLISHABLE_KEY is not configured.",
      });
    }

    return {
      publishableKey,
    };
  }
);

// Protected Finatyx identity endpoint.
//
// Authentication responsibility:
// Clerk verifies who the caller is.
//
// Identity responsibility:
// Finatyx resolves the Clerk user ID to its own internal
// UUID-based User record.
//
// This endpoint does NOT create tenant memberships,
// roles, permissions, branch access, or entitlements.
app.get(
  "/api/v1/auth/me",
  async (request, reply) => {
    const { isAuthenticated, userId } =
      getAuth(request);

    if (!isAuthenticated || !userId) {
      return reply.status(401).send({
        error: "unauthorized",
        message: "Authentication required.",
      });
    }

    try {
      const identity =
        await resolveFinatyxIdentity(userId);

      return {
        authenticated: true,
        clerkUserId: identity.clerkId,
        finatyxUserId: identity.id,
        profile: {
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          phone: identity.phone,
          avatarUrl: identity.avatarUrl,
        },
        createdAt: identity.createdAt,
        updatedAt: identity.updatedAt,
      };
    } catch (error) {
      request.log.error(
        {
          err: error,
          clerkUserId: userId,
        },
        "Unable to resolve Finatyx identity"
      );

      return reply.status(500).send({
        error: "identity_resolution_failed",
        message:
          "Unable to resolve the authenticated Finatyx user.",
      });
    }
  }
);

// Protected first-business onboarding endpoint.
//
// Security flow:
// 1. Clerk authenticates the caller.
// 2. Finatyx resolves the Clerk identity to its internal User UUID.
// 3. The onboarding service creates the tenant environment atomically.
//
// Security-sensitive fields such as userId, OWNER role,
// membership status, tenant status, branch access level,
// and permission IDs are never accepted from the browser.
app.post<{
  Body: CreateBusinessInput;
}>(
  "/api/v1/onboarding/business",
  async (request, reply) => {
    const { isAuthenticated, userId } =
      getAuth(request);

    if (!isAuthenticated || !userId) {
      return reply.status(401).send({
        error: "unauthorized",
        message: "Authentication required.",
      });
    }

    const body = request.body;

    if (
      !body ||
      typeof body !== "object" ||
      typeof body.legalName !== "string" ||
      typeof body.slug !== "string" ||
      typeof body.countryCode !== "string" ||
      typeof body.baseCurrencyCode !== "string"
    ) {
      return reply.status(400).send({
        error: "invalid_request",
        message:
          "legalName, slug, countryCode, and baseCurrencyCode are required.",
      });
    }

    try {
      const identity =
        await resolveFinatyxIdentity(userId);

      const onboarding =
        await createBusinessForUser(
          identity.id,
          body
        );

      return reply.status(201).send({
        status: "created",
        business: onboarding.tenant,
        headOffice: onboarding.branch,
        membership: onboarding.membership,
        ownerRole: onboarding.role,
        permissionsGranted:
          onboarding.permissionsGranted,
        branchAccessLevel:
          onboarding.branchAccessLevel,
      });
    } catch (error) {
      request.log.error(
        {
          err: error,
          clerkUserId: userId,
        },
        "Finatyx business onboarding failed"
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to create the Finatyx business.";

      if (
        message.includes("already in use")
      ) {
        return reply.status(409).send({
          error: "business_slug_conflict",
          message,
        });
      }

      if (
        message.includes("required") ||
        message.includes("must contain") ||
        message.includes("cannot exceed") ||
        message.includes("not an active Finatyx currency")
      ) {
        return reply.status(400).send({
          error: "invalid_business_data",
          message,
        });
      }

      return reply.status(500).send({
        error: "business_onboarding_failed",
        message:
          "Unable to create the Finatyx business.",
      });
    }
  }
);

type AuthorizationTestBody = {
  tenantId?: unknown;
  branchId?: unknown;
  permissionCode?: unknown;
  minimumBranchAccess?: unknown;
};

function isBranchAccessRequirement(
  value: unknown
): value is BranchAccessRequirement {
  return (
    value === "READ" ||
    value === "OPERATE" ||
    value === "MANAGE"
  );
}

// Temporary protected authorization test endpoint.
//
// This route proves the complete HTTP authorization path:
//
// Clerk session
// -> Finatyx internal identity
// -> ACTIVE tenant membership
// -> role permission
// -> branch scope
// -> allow / deny.
//
// tenantId and branchId are resource selectors, not authorization
// credentials. Supplying an ID does not grant access to it.
app.post<{
  Body: AuthorizationTestBody;
}>(
  "/api/v1/authz/test",
  async (request, reply) => {
    const { isAuthenticated, userId } =
      getAuth(request);

    if (!isAuthenticated || !userId) {
      return reply.status(401).send({
        error: "unauthorized",
        message: "Authentication required.",
      });
    }

    const body = request.body;

    if (
      !body ||
      typeof body !== "object" ||
      typeof body.tenantId !== "string" ||
      typeof body.branchId !== "string" ||
      typeof body.permissionCode !== "string" ||
      !isBranchAccessRequirement(
        body.minimumBranchAccess
      )
    ) {
      return reply.status(400).send({
        error: "invalid_request",
        message:
          "tenantId, branchId, permissionCode, and a valid minimumBranchAccess are required.",
      });
    }

    const tenantId = body.tenantId.trim();
    const branchId = body.branchId.trim();
    const permissionCode =
      body.permissionCode.trim();

    if (
      !tenantId ||
      !branchId ||
      !permissionCode
    ) {
      return reply.status(400).send({
        error: "invalid_request",
        message:
          "tenantId, branchId, and permissionCode cannot be empty.",
      });
    }

    try {
      const identity =
        await resolveFinatyxIdentity(userId);

      const authorization =
        await authorize({
          userId: identity.id,
          tenantId,
          branchId,
          permissionCode,
          minimumBranchAccess:
            body.minimumBranchAccess,
        });

      if (!authorization.allowed) {
        return reply.status(403).send({
          authorized: false,
          error: "forbidden",
          reason: authorization.reason,
          message: authorization.message,
        });
      }

      return reply.status(200).send({
        authorized: true,
        context: authorization.context,
      });
    } catch (error) {
      request.log.error(
        {
          err: error,
          clerkUserId: userId,
        },
        "Finatyx authorization test failed"
      );

      return reply.status(500).send({
        error: "authorization_test_failed",
        message:
          "Unable to evaluate Finatyx authorization.",
      });
    }
  }
);

const start = async (): Promise<void> => {
  try {
    const port = Number(
      process.env.PORT ?? 3000
    );

    const host =
      process.env.HOST ?? "0.0.0.0";

    await app.listen({
      port,
      host,
    });

    app.log.info(
      `Finatyx API running on http://${host}:${port}`
    );
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

await start();