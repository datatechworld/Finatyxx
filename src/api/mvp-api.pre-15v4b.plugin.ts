import type {
  FastifyPluginAsync,
} from "fastify";

import {
  customersRoutes,
} from "./routes/customers.routes.js";

export const mvpApiPlugin:
FastifyPluginAsync = async (app) => {
  await app.register(customersRoutes);
};