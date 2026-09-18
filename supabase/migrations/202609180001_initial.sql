create extension if not exists pgcrypto;

create table public.tracked_products (
  id uuid primary key default gen_random_uuid(),
  source_product_id text not null unique,
  url text not null unique check (url ~ '^https://demo\.inelabteamdev\.com/product/[0-9]+$'),
  name text not null,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  next_scrape_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz
);

create table public.scrape_attempts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.tracked_products(id) on delete cascade,
  run_id uuid not null,
  attempt_number smallint not null check (attempt_number between 1 and 10),
  trigger text not null check (trigger in ('scheduled', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'retried', 'failed')),
  error_code text,
  error_message text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  unique (run_id, attempt_number)
);

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.tracked_products(id) on delete cascade,
  attempt_id uuid not null unique references public.scrape_attempts(id) on delete cascade,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null check (char_length(currency) = 3),
  in_stock boolean not null,
  observed_at timestamptz not null
);

create index tracked_products_due_idx
  on public.tracked_products (next_scrape_at)
  where active = true;
create index price_history_product_time_idx
  on public.price_history (product_id, observed_at desc);
create index scrape_attempts_product_time_idx
  on public.scrape_attempts (product_id, started_at desc);

alter table public.tracked_products enable row level security;
alter table public.scrape_attempts enable row level security;
alter table public.price_history enable row level security;

revoke all on public.tracked_products, public.scrape_attempts, public.price_history from anon, authenticated;
grant all on public.tracked_products, public.scrape_attempts, public.price_history to service_role;

create or replace function public.claim_due_products(p_limit integer, p_lease_seconds integer default 180)
returns setof public.tracked_products
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id
    from public.tracked_products
    where active = true
      and next_scrape_at <= now()
      and (lease_until is null or lease_until < now())
    order by next_scrape_at
    for update skip locked
    limit greatest(1, least(p_limit, 10))
  )
  update public.tracked_products product
  set lease_token = gen_random_uuid(),
      lease_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600)))
  from due
  where product.id = due.id
  returning product.*;
end;
$$;

create or replace function public.claim_product(p_product_id uuid, p_lease_seconds integer default 180)
returns setof public.tracked_products
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.tracked_products product
  set lease_token = gen_random_uuid(),
      lease_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600)))
  where product.id = p_product_id
    and product.active = true
    and (product.lease_until is null or product.lease_until < now())
  returning product.*;
end;
$$;

create or replace function public.complete_scrape(
  p_product_id uuid,
  p_attempt_id uuid,
  p_price numeric,
  p_currency text,
  p_in_stock boolean,
  p_observed_at timestamptz,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_price is null or p_price < 0 or p_currency is null or char_length(p_currency) <> 3 or p_in_stock is null then
    raise exception 'invalid observation';
  end if;

  insert into public.price_history (product_id, attempt_id, price, currency, in_stock, observed_at)
  values (p_product_id, p_attempt_id, p_price, upper(p_currency), p_in_stock, p_observed_at);

  update public.scrape_attempts
  set status = 'success', finished_at = now(), duration_ms = greatest(0, p_duration_ms), error_code = null, error_message = null
  where id = p_attempt_id and product_id = p_product_id and status = 'running';
  if not found then raise exception 'running attempt not found'; end if;

  update public.tracked_products
  set next_scrape_at = p_observed_at + interval '2 hours', lease_token = null, lease_until = null
  where id = p_product_id;
  if not found then raise exception 'product not found'; end if;
end;
$$;

create or replace function public.reconcile_abandoned_attempts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.scrape_attempts attempt
  set status = 'failed',
      finished_at = now(),
      duration_ms = greatest(0, floor(extract(epoch from (now() - attempt.started_at)) * 1000)::integer),
      error_code = 'PROCESS_INTERRUPTED',
      error_message = 'The scraper stopped before this attempt finished.'
  from public.tracked_products product
  where attempt.product_id = product.id
    and attempt.status = 'running'
    and product.lease_until < now();
  get diagnostics changed = row_count;

  update public.tracked_products
  set lease_token = null, lease_until = null
  where lease_until < now();
  return changed;
end;
$$;

revoke all on function public.claim_due_products(integer, integer) from public, anon, authenticated;
revoke all on function public.claim_product(uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_scrape(uuid, uuid, numeric, text, boolean, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.reconcile_abandoned_attempts() from public, anon, authenticated;
grant execute on function public.claim_due_products(integer, integer) to service_role;
grant execute on function public.claim_product(uuid, integer) to service_role;
grant execute on function public.complete_scrape(uuid, uuid, numeric, text, boolean, timestamptz, integer) to service_role;
grant execute on function public.reconcile_abandoned_attempts() to service_role;
