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

create table if not exists public.stories (
  id text primary key,
  title text not null,
  author text not null,
  status text not null default 'Dang ra',
  genre jsonb not null default '[]'::jsonb,
  cover text,
  summary text,
  updated_at date,
  reads integer not null default 0,
  rating numeric not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  db_updated_at timestamptz not null default now()
);

create table if not exists public.story_chapters (
  story_id text not null references public.stories(id) on delete cascade,
  chapter_id text not null,
  sort_order integer not null default 0,
  title text not null,
  episode_title text,
  free boolean not null default true,
  price_coins integer not null default 0,
  audio_url text,
  audio_urls jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  db_updated_at timestamptz not null default now(),
  primary key (story_id, chapter_id),
  constraint story_chapters_price_non_negative check (price_coins >= 0)
);

create table if not exists public.story_chapter_bodies (
  story_id text not null,
  chapter_id text not null,
  body jsonb not null,
  db_updated_at timestamptz not null default now(),
  primary key (story_id, chapter_id),
  foreign key (story_id, chapter_id)
    references public.story_chapters(story_id, chapter_id)
    on delete cascade,
  constraint story_chapter_bodies_array check (jsonb_typeof(body) = 'array')
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

create index if not exists stories_active_sort_idx
  on public.stories (is_active, sort_order, title);

create index if not exists story_chapters_story_sort_idx
  on public.story_chapters (story_id, is_active, sort_order);

create index if not exists reading_progress_user_updated_idx
  on public.reading_progress (user_id, updated_at desc);

create index if not exists unlocked_chapters_user_idx
  on public.unlocked_chapters (user_id, created_at desc);

create index if not exists coin_transactions_user_created_idx
  on public.coin_transactions (user_id, created_at desc);

alter table public.comments enable row level security;
alter table public.profiles enable row level security;
alter table public.vip_entitlements enable row level security;
alter table public.stories enable row level security;
alter table public.story_chapters enable row level security;
alter table public.story_chapter_bodies enable row level security;
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

drop policy if exists "Public can read active stories" on public.stories;
create policy "Public can read active stories"
  on public.stories
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Public can read active story chapter metadata" on public.story_chapters;
create policy "Public can read active story chapter metadata"
  on public.story_chapters
  for select
  to anon, authenticated
  using (is_active = true);

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
  v_chapter_exists boolean := false;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED' using errcode = '28000';
  end if;

  select exists (
    select 1
    from public.story_chapters
    where story_id = p_story_id
      and chapter_id = p_chapter_id
      and is_active = true
  ) into v_chapter_exists;

  if not v_chapter_exists then
    raise exception 'CHAPTER_NOT_FOUND' using errcode = 'P0002';
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

  select case when free then 0 else coalesce(price_coins, 0) end
    into v_price
    from public.story_chapters
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

create or replace function public.get_story_catalog()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'plans', '[]'::jsonb,
    'stories', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'author', s.author,
        'status', s.status,
        'genre', s.genre,
        'cover', s.cover,
        'summary', s.summary,
        'updatedAt', to_char(s.updated_at, 'YYYY-MM-DD'),
        'reads', s.reads,
        'rating', s.rating,
        'chapters', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', c.chapter_id,
              'title', c.title,
              'episodeTitle', c.episode_title,
              'free', c.free,
              'price', c.price_coins,
              'audioUrl', c.audio_url,
              'audioUrls', c.audio_urls
            )
            order by c.sort_order
          )
          from public.story_chapters c
          where c.story_id = s.id
            and c.is_active = true
        ), '[]'::jsonb)
      )
      order by s.sort_order, s.title
    ), '[]'::jsonb)
  )
  from public.stories s
  where s.is_active = true;
$$;

grant execute on function public.get_story_catalog() to anon, authenticated;

create or replace function public.get_chapter_for_reader(
  p_story_id text,
  p_chapter_id text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_chapter public.story_chapters%rowtype;
  v_body jsonb;
  v_has_vip boolean := false;
  v_is_unlocked boolean := false;
  v_can_read boolean := false;
begin
  select *
    into v_chapter
    from public.story_chapters
    where story_id = p_story_id
      and chapter_id = p_chapter_id
      and is_active = true;

  if not found then
    raise exception 'CHAPTER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_user_id is not null then
    select exists (
      select 1
      from public.vip_entitlements
      where user_id = v_user_id
        and active_until > now()
    ) into v_has_vip;

    select exists (
      select 1
      from public.unlocked_chapters
      where user_id = v_user_id
        and story_id = p_story_id
        and chapter_id = p_chapter_id
    ) into v_is_unlocked;
  end if;

  v_can_read := v_chapter.free or v_has_vip or v_is_unlocked;

  if v_can_read then
    select body
      into v_body
      from public.story_chapter_bodies
      where story_id = p_story_id
        and chapter_id = p_chapter_id;
  end if;

  return jsonb_build_object(
    'id', v_chapter.chapter_id,
    'title', v_chapter.title,
    'episodeTitle', v_chapter.episode_title,
    'free', v_chapter.free,
    'price', v_chapter.price_coins,
    'audioUrl', v_chapter.audio_url,
    'audioUrls', v_chapter.audio_urls,
    'can_read', v_can_read,
    'body', case when v_can_read then coalesce(v_body, '[]'::jsonb) else null end
  );
end;
$$;

grant execute on function public.get_chapter_for_reader(text, text) to anon, authenticated;
