import { NextResponse } from "next/server";

import { getStakingInfo, type StakingInfo } from "@/lib/defi/stake";

export const runtime = "nodejs";
const STAKE_OVERVIEW_CACHE_TTL_MS = 15_000;

let cachedOverview: { data: StakingInfo; expiresAt: number } | null = null;

export async function GET(): Promise<Response> {
  try {
    const now = Date.now();
    if (cachedOverview && cachedOverview.expiresAt > now) {
      return NextResponse.json(cachedOverview.data);
    }

    const overview = await getStakingInfo();
    cachedOverview = {
      data: overview,
      expiresAt: now + STAKE_OVERVIEW_CACHE_TTL_MS,
    };
    return NextResponse.json(overview);
  } catch (error) {
    console.error("[StakeOverview] Failed to load staking overview:", error);
    return NextResponse.json(
      { error: "Could not load staking data right now." },
      { status: 500 },
    );
  }
}
