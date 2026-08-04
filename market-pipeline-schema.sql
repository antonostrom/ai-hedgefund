-- Universe + price history tables.
-- Run in the Supabase SQL editor, same project as the portfolio table.

create table if not exists universe (
  id            uuid primary key default gen_random_uuid(),
  ticker        text not null unique,       -- Yahoo Finance format: "AAPL", "NOVO-B.CO", "SCHD"
  name          text,
  asset_type    text not null default 'stock' check (asset_type in ('stock', 'etf')),
  region        text,                       -- 'US', 'Europe', 'Nordics', 'UK', 'Asia'
  country       text,
  exchange      text,
  currency      text,
  sector        text,                       -- GICS sector, null/irrelevant for most ETFs
  industry      text,
  market_cap    numeric,                    -- refreshed periodically, not daily
  avg_volume    numeric,
  active        boolean not null default true,  -- flip false instead of deleting on delist/illiquidity
  source        text,                       -- 'SP500', 'STOXX600', 'NASDAQ100', 'curated_etf', etc - lets you trace where a ticker came from
  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists universe_active_idx on universe (active) where active = true;
create index if not exists universe_asset_type_idx on universe (asset_type);
create index if not exists universe_region_idx on universe (region);

create table if not exists price_history (
  ticker      text not null,
  date        date not null,
  open        numeric,
  high        numeric,
  low         numeric,
  close       numeric,
  adj_close   numeric,
  volume      bigint,
  currency    text,
  created_at  timestamptz not null default now(),
  primary key (ticker, date)
);

create index if not exists price_history_ticker_date_idx on price_history (ticker, date desc);

-- updated_at trigger for universe (reuses the function from the portfolio schema
-- if you've already run that migration - if not, this creates it)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists universe_set_updated_at on universe;
create trigger universe_set_updated_at
  before update on universe
  for each row
  execute function set_updated_at();

-- RLS: same pattern as portfolio - server-only access via service role key,
-- zero policies means zero access for anon/authenticated roles.
alter table universe enable row level security;
alter table price_history enable row level security;
