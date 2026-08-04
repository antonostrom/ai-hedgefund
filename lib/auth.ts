// Minimal access control for a single-user personal tool.
//
// This is NOT a real auth system - it's a shared-secret check, appropriate
// only because you're the sole user and the deployment isn't linked from
// anywhere public. If you already have Supabase Auth / Clerk / NextAuth
// wired into the rest of your app, swap this out for a real session check
// instead - this is here so you have something working today.
//
// Set PORTFOLIO_ACCESS_KEY in Vercel env vars to a long random string.
// The client sends it as a header on every request (see page.tsx).

export function isAuthorized(request: Request): boolean {
  const expected = process.env.PORTFOLIO_ACCESS_KEY;
  if (!expected) {
    throw new Error("PORTFOLIO_ACCESS_KEY env var is not set");
  }
  const provided = request.headers.get("x-portfolio-key");
  return provided === expected;
}
