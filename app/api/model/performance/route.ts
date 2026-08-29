import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth";
import { computeModelPerformance } from "@/lib/research/model-performance";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const excludeSector = searchParams.get("excludeSector");

  const supabase = getServiceSupabase();
  const result = await computeModelPerformance(supabase, { excludeSector });

  return NextResponse.json({ ...result, excludeSector: excludeSector || null });
}