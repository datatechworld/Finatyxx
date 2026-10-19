import Fastify from "fastify";
import { clerkPlugin, getAuth } from "@clerk/fastify";

const app = Fastify({
  logger: true,
});

// Clerk authentication
await app.register(clerkPlugin);

// Public health endpoint
app.get("/health", async () => {
  return {
    status: "ok",
    service: "finatyx-api",
    timestamp: new Date().toISOString(),
  };
});

// Protected authentication test endpoint
app.get("/api/v1/auth/me", async (request, reply) => {
  const { isAuthenticated, userId } = getAuth(request);

  if (!isAuthenticated || !userId) {
    return reply.status(401).send({
      error: "unauthorized",
      message: "Authentication required.",
    });
  }

  return {
    authenticated: true,
    clerkUserId: userId,
  };
});

const start = async (): Promise<void> => {
  try {
    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? "0.0.0.0";

    await app.listen({ port, host });

    app.log.info(`Finatyx API running on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

await start();
