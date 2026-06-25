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

create index if not exists vip_entitlements_user_active_idx
  on public.vip_entitlements (user_id, active_until desc);

alter table public.comments enable row level security;
alter table public.profiles enable row level security;
alter table public.vip_entitlements enable row level security;

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
