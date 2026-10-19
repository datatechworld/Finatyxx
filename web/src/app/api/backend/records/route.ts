import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const resources = new Set(["customers", "suppliers", "products", "invoices", "customer-payments", "supplier-bills", "supplier-payments"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Session token unavailable" }, { status: 401 });
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource") ?? "";
  const tenantId = url.searchParams.get("tenantId") ?? "";
  const branchId = url.searchParams.get("branchId") ?? "";
  if (!resources.has(resource) || !uuid.test(tenantId)) return NextResponse.json({ error: "Invalid resource or tenant" }, { status: 400 });
  const branchScoped = new Set(["invoices", "customer-payments", "supplier-bills", "supplier-payments"]);
  if (branchScoped.has(resource) && !uuid.test(branchId)) return NextResponse.json({ error: "Valid branchId required" }, { status: 400 });
  const apiBase = process.env.FINATYX_API_BASE_URL ?? "http://127.0.0.1:3000";
  const upstream = new URL(`/api/v1/tenants/${tenantId}/${resource}`, apiBase);
  if (branchScoped.has(resource)) upstream.searchParams.set("branchId", branchId);
  try {
    const response = await fetch(upstream, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    const body: unknown = await response.json().catch(() => null);
    if (body === null) return NextResponse.json({ error: "Unexpected backend response" }, { status: 502 });
    return NextResponse.json(body, { status: response.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Finatyx records bridge failed", error);
    return NextResponse.json({ error: "Financial API unavailable" }, { status: 502 });
  }
}
