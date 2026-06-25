create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  target_key text not null,
  story_id text not null,
  chapter_id text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  author text not null,
  body text not null,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint comments_target_key_format check (
    target_key ~ '^(story|chapter):[a-z0-9-]+(:c[0-9]{3})?$'
  ),
  constraint comments_author_length check (
    char_length(btrim(author)) between 1 and 40
  ),
  constraint comments_body_length check (
    char_length(btrim(body)) between 2 and 800
  )
);

alter table public.comments
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.comments
  add column if not exists user_email text;

create index if not exists comments_target_visible_created_idx
  on public.comments (target_key, is_hidden, created_at desc);

create index if not exists comments_story_chapter_idx
  on public.comments (story_id, chapter_id, created_at desc);

create index if not exists comments_user_idx
  on public.comments (user_id, created_at desc);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(btrim(display_name)) between 1 and 40
  )
);

create table if not exists public.vip_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null default 'vip',
  active_until timestamptz not null,
  source text not null default 'manual',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.account_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_vnd integer not null default 0,
  coin_balance integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint account_wallets_non_negative check (
    balance_vnd >= 0 and coin_balance >= 0
  )
);

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id text not null,
  chapter_id text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

create table if not exists public.unlocked_chapters (
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id text not null,
  chapter_id text not null,
  source text not null default 'purchase',
  created_at timestamptz not null default now(),
  primary key (user_id, story_id, chapter_id)
);

create table if not exists public.paid_chapters (
  story_id text not null,
  chapter_id text not null,
  price_coins integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (story_id, chapter_id),
  constraint paid_chapters_price_non_negative check (price_coins >= 0)
);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  story_id text,
  chapter_id text,
  created_at timestamptz not null default now()
);

create index if not exists vip_entitlements_user_active_idx
  on public.vip_entitlements (user_id, active_until desc);

create index if not exists reading_progress_user_updated_idx
  on public.reading_progress (user_id, updated_at desc);

create index if not exists unlocked_chapters_user_idx
  on public.unlocked_chapters (user_id, created_at desc);

create index if not exists coin_transactions_user_created_idx
  on public.coin_transactions (user_id, created_at desc);

alter table public.comments enable row level security;
alter table public.profiles enable row level security;
alter table public.vip_entitlements enable row level security;
alter table public.account_wallets enable row level security;
alter table public.reading_progress enable row level security;
alter table public.unlocked_chapters enable row level security;
alter table public.paid_chapters enable row level security;
alter table public.coin_transactions enable row level security;

drop policy if exists "Public can read visible comments" on public.comments;
create policy "Public can read visible comments"
  on public.comments
  for select
  to anon, authenticated
  using (is_hidden = false);

drop policy if exists "Public can create comments" on public.comments;
create policy "Public can create comments"
  on public.comments
  for insert
  to anon, authenticated
  with check (
    is_hidden = false
    and (auth.uid() is null or user_id is null or auth.uid() = user_id)
    and char_length(btrim(author)) between 1 and 40
    and char_length(btrim(body)) between 2 and 800
  );

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can read own VIP entitlement" on public.vip_entitlements;
create policy "Users can read own VIP entitlement"
  on public.vip_entitlements
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own wallet" on public.account_wallets;
create policy "Users can read own wallet"
  on public.account_wallets
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own reading progress" on public.reading_progress;
create policy "Users can read own reading progress"
  on public.reading_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can save own reading progress" on public.reading_progress;
create policy "Users can save own reading progress"
  on public.reading_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own reading progress" on public.reading_progress;
create policy "Users can update own reading progress"
  on public.reading_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own unlocked chapters" on public.unlocked_chapters;
create policy "Users can read own unlocked chapters"
  on public.unlocked_chapters
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Public can read active paid chapters" on public.paid_chapters;
create policy "Public can read active paid chapters"
  on public.paid_chapters
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Users can read own coin transactions" on public.coin_transactions;
create policy "Users can read own coin transactions"
  on public.coin_transactions
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.unlock_chapter_with_coins(
  p_story_id text,
  p_chapter_id text
)
returns table (
  unlocked boolean,
  charged boolean,
  price_coins integer,
  coin_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_price integer := 0;
  v_balance integer := 0;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED' using errcode = '28000';
  end if;

  if exists (
    select 1
    from public.unlocked_chapters
    where user_id = v_user_id
      and story_id = p_story_id
      and chapter_id = p_chapter_id
  ) then
    select coalesce(coin_balance, 0)
      into v_balance
      from public.account_wallets
      where user_id = v_user_id;

    return query select true, false, 0, coalesce(v_balance, 0);
    return;
  end if;

  select coalesce(price_coins, 0)
    into v_price
    from public.paid_chapters
    where story_id = p_story_id
      and chapter_id = p_chapter_id
      and is_active = true;

  v_price := coalesce(v_price, 0);

  insert into public.account_wallets (user_id, balance_vnd, coin_balance, updated_at)
  values (v_user_id, 0, 0, now())
  on conflict (user_id) do nothing;

  select coin_balance
    into v_balance
    from public.account_wallets
    where user_id = v_user_id
    for update;

  if v_balance < v_price then
    raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001';
  end if;

  if v_price > 0 then
    update public.account_wallets
      set coin_balance = coin_balance - v_price,
          updated_at = now()
      where user_id = v_user_id
      returning coin_balance into v_balance;

    insert into public.coin_transactions (user_id, amount, reason, story_id, chapter_id)
    values (v_user_id, -v_price, 'unlock_chapter', p_story_id, p_chapter_id);
  end if;

  insert into public.unlocked_chapters (user_id, story_id, chapter_id, source)
  values (v_user_id, p_story_id, p_chapter_id, case when v_price > 0 then 'coin' else 'free' end)
  on conflict (user_id, story_id, chapter_id) do nothing;

  return query select true, (v_price > 0), v_price, coalesce(v_balance, 0);
end;
$$;

grant execute on function public.unlock_chapter_with_coins(text, text) to authenticated;
