import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(
      "http://127.0.0.1:3000/health",
      {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Backend health check failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      connected: true,
      authenticated: true,
      backendStatus: response.status,
    });
  } catch {
    return NextResponse.json(
      {
        connected: false,
        error: "Backend unavailable",
      },
      { status: 502 }
    );
  }
}

