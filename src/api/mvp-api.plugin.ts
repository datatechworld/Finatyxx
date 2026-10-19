import type {
  FastifyPluginAsync,
} from "fastify";

import {
  customerPaymentsRoutes,
} from "./routes/customer-payments.routes.js";

import {
  customersRoutes,
} from "./routes/customers.routes.js";

import {
  invoicesRoutes,
} from "./routes/invoices.routes.js";

import {
  productsRoutes,
} from "./routes/products.routes.js";

import {
  suppliersRoutes,
} from "./routes/suppliers.routes.js";

import { supplierBillsRoutes } from "./routes/supplier-bills.routes.js";

import { supplierPaymentsRoutes } from "./routes/supplier-payments.routes.js";

export const mvpApiPlugin:
FastifyPluginAsync = async (app) => {
  await app.register(customersRoutes);
  await app.register(suppliersRoutes);
  await app.register(productsRoutes);
  await app.register(invoicesRoutes);
  await app.register(customerPaymentsRoutes);
  await app.register(supplierBillsRoutes);
  await app.register(supplierPaymentsRoutes);
};
