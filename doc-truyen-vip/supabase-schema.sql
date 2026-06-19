create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  target_key text not null,
  story_id text not null,
  chapter_id text,
  author text not null default 'Doc gia',
  body text not null check (char_length(body) between 1 and 800),
  created_at timestamptz not null default now()
);

create index if not exists comments_target_key_created_at_idx
  on public.comments (target_key, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "Anyone can read comments" on public.comments;
create policy "Anyone can read comments"
  on public.comments
  for select
  using (true);

drop policy if exists "Anyone can add comments" on public.comments;
create policy "Anyone can add comments"
  on public.comments
  for insert
  with check (
    char_length(author) between 1 and 80
    and char_length(body) between 1 and 800
  );
