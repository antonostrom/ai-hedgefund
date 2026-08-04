import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("portfolio")
    .select("*")
    .order("ticker", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ holdings: data });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { ticker, name, asset_type, exchange, currency, shares, cost_basis, account, notes } = body;

  if (!ticker || !shares) {
    return NextResponse.json(
      { error: "ticker and shares are required" },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("portfolio")
    .insert({
      ticker: ticker.trim().toUpperCase(),
      name: name || null,
      asset_type: asset_type || "stock",
      exchange: exchange || null,
      currency: currency || "SEK",
      shares,
      cost_basis: cost_basis || null,
      account: account || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ holding: data }, { status: 201 });
}