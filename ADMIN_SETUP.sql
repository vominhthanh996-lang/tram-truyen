-- Run this once in Supabase SQL Editor after this account exists in Authentication > Users.
-- Only Vominhthanh996@gmail.com will be kept as admin.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.admin_users
     where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
  on public.admin_users
  for select
  to authenticated
  using (public.is_admin());

create unique index if not exists vip_entitlements_user_plan_idx
  on public.vip_entitlements (user_id, plan_id);

drop policy if exists "Admins can manage stories" on public.stories;
create policy "Admins can manage stories"
  on public.stories
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage story chapters" on public.story_chapters;
create policy "Admins can manage story chapters"
  on public.story_chapters
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage story chapter bodies" on public.story_chapter_bodies;
create policy "Admins can manage story chapter bodies"
  on public.story_chapter_bodies
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage comments" on public.comments;
create policy "Admins can manage comments"
  on public.comments
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can read profiles" on public.profiles;
create policy "Admins can read profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can create profiles" on public.profiles;
create policy "Admins can create profiles"
  on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can delete profiles" on public.profiles;
create policy "Admins can delete profiles"
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can manage wallets" on public.account_wallets;
create policy "Admins can manage wallets"
  on public.account_wallets
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage VIP entitlements" on public.vip_entitlements;
create policy "Admins can manage VIP entitlements"
  on public.vip_entitlements
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can read reading progress" on public.reading_progress;
drop policy if exists "Admins can manage reading progress" on public.reading_progress;
create policy "Admins can manage reading progress"
  on public.reading_progress
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage paid chapters" on public.paid_chapters;
create policy "Admins can manage paid chapters"
  on public.paid_chapters
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage unlocked chapters" on public.unlocked_chapters;
create policy "Admins can manage unlocked chapters"
  on public.unlocked_chapters
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can read coin transactions" on public.coin_transactions;
drop policy if exists "Admins can manage coin transactions" on public.coin_transactions;
create policy "Admins can manage coin transactions"
  on public.coin_transactions
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.admin_adjust_user_coins(
  p_email text,
  p_amount integer,
  p_reason text default 'admin_adjust'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  new_balance integer;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_amount = 0 then
    raise exception 'AMOUNT_MUST_NOT_BE_ZERO';
  end if;

  select id
    into target_user_id
    from public.profiles
   where lower(email) = lower(btrim(p_email))
   limit 1;

  if target_user_id is null then
    select id
      into target_user_id
      from auth.users
     where lower(email) = lower(btrim(p_email))
     limit 1;
  end if;

  if target_user_id is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.profiles (id, email, display_name, updated_at)
  select id, email, split_part(email, '@', 1), now()
    from auth.users
   where id = target_user_id
  on conflict (id) do update
    set email = excluded.email,
        updated_at = excluded.updated_at;

  insert into public.account_wallets (user_id, balance_vnd, coin_balance, updated_at)
  values (target_user_id, 0, 0, now())
  on conflict (user_id) do nothing;

  update public.account_wallets
     set coin_balance = greatest(0, coin_balance + p_amount),
         updated_at = now()
   where user_id = target_user_id
   returning coin_balance into new_balance;

  insert into public.coin_transactions (user_id, amount, reason)
  values (target_user_id, p_amount, coalesce(nullif(btrim(p_reason), ''), 'admin_adjust'));

  return jsonb_build_object(
    'user_id', target_user_id,
    'amount', p_amount,
    'coin_balance', new_balance
  );
end;
$$;

revoke all on function public.admin_adjust_user_coins(text, integer, text) from public;
grant execute on function public.admin_adjust_user_coins(text, integer, text) to authenticated;

do $$
declare
  owner_id uuid;
begin
  select id
    into owner_id
    from auth.users
   where lower(email) = lower('Vominhthanh996@gmail.com')
   limit 1;

  if owner_id is null then
    raise exception 'Admin account Vominhthanh996@gmail.com does not exist yet. Create it in Authentication > Users first.';
  end if;

  delete from public.admin_users
   where user_id <> owner_id;

  insert into public.admin_users (user_id, role)
  values (owner_id, 'owner')
  on conflict (user_id) do update
    set role = excluded.role;
end $$;
