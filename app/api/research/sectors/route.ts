import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth";
import { computeSectorRotation } from "@/lib/research/sectors";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const result = await computeSectorRotation(supabase);

  return NextResponse.json(result);
}