import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const origin = request.nextUrl.origin;

  return NextResponse.json(
    {
      url: `${origin}/home`,
      name: "Jarvis Wallet",
      iconUrl: `${origin}/jarvis-logo.svg`,
      termsOfUseUrl: `${origin}/`,
      privacyPolicyUrl: `${origin}/`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
