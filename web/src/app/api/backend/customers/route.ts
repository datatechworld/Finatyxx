import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const API_BASE_URL = "http://127.0.0.1:3000";

export async function GET(request: Request) {
  const { userId, getToken } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const token = await getToken();

  if (!token) {
    return NextResponse.json(
      { error: "Session token unavailable" },
      { status: 401 }
    );
  }

  const tenantId = new URL(request.url).searchParams.get("tenantId");

  if (
    !tenantId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)
  ) {
    return NextResponse.json(
      { error: "Valid tenantId is required" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/tenants/${encodeURIComponent(tenantId)}/customers`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );

    const body = await response.text();

    let result: unknown;

    try {
      result = JSON.parse(body);
    } catch {
      console.error(
        "Fastify returned a non-JSON response.",
        "HTTP status:",
        response.status
      );

      return NextResponse.json(
        {
          error: "Backend returned an unexpected response",
          upstreamStatus: response.status,
        },
        {
          status: 502,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
    }

    return NextResponse.json(result, {
      status: response.status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Finatyx backend request failed:", error);

    return NextResponse.json(
      {
        error: "Unable to connect to financial API",
        detail:
          error instanceof Error
            ? error.name
            : "Unknown error",
      },
      { status: 502 }
    );
  }
}
