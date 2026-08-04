import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. Never import this file from a client component -
// the service role key bypasses Row Level Security entirely.
// Requires these two env vars set in Vercel (Production + Preview + Dev):
//   NEXT_PUBLIC_SUPABASE_URL       (safe to expose, it's just the project URL)
//   SUPABASE_SERVICE_ROLE_KEY      (secret - server-side only, do NOT prefix with NEXT_PUBLIC_)

export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
