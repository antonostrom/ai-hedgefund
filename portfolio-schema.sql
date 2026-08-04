-- Portfolio holdings table
-- Run this in the Supabase SQL editor (or via migration) on your existing project.

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

create table if not exists portfolio (
  id            uuid primary key default gen_random_uuid(),
  ticker        text not null,            -- e.g. "NOVO-B.CO", "AAPL", "SCHD"
  name          text,                     -- optional display name, e.g. "Novo Nordisk"
  asset_type    text not null default 'stock' check (asset_type in ('stock', 'etf')),
  exchange      text,                     -- e.g. "OMX", "NASDAQ", "NYSE"
  currency      text not null default 'SEK',
  shares        numeric not null check (shares > 0),
  cost_basis    numeric,                  -- average price paid per share, in `currency`
  account       text,                     -- e.g. "ISK", "KF", "AF" - useful once you have several accounts
  date_added    date not null default current_date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Keep updated_at current on every edit
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists portfolio_set_updated_at on portfolio;
create trigger portfolio_set_updated_at
  before update on portfolio
  for each row
  execute function set_updated_at();

-- Row Level Security
-- This table is only ever written to via the service-role key from Next.js
-- API routes (see app/api/portfolio), never directly from the browser with
-- the anon key. So we lock RLS down hard: no anon access at all.
alter table portfolio enable row level security;

-- No policies created on purpose - with RLS on and zero policies, the anon
-- and authenticated roles get zero access by default. Only the service_role
-- key (used server-side only, never exposed to the client) bypasses RLS.

-- Helpful index for lookups by ticker (e.g. when the risk module joins
-- portfolio against price_history / factor_scores)
create index if not exists portfolio_ticker_idx on portfolio (ticker);
