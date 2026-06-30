-- Run this in Supabase SQL Editor to harden the live production database.
-- It removes anonymous shared-comment writes and keeps public reads.

delete from public.comments
where author in ('security-test', 'security-test-2', 'audit-anon', 'audit-anon-now', 'audit-anon-live')
   or body in ('test comment security check', 'test anonymous comment after UI hardening', 'audit anon insert test');

drop policy if exists "Public can create comments" on public.comments;
drop policy if exists "Authenticated users can create comments" on public.comments;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.comments', policy_record.policyname);
  end loop;
end $$;

revoke insert on public.comments from anon;
grant insert on public.comments to authenticated;

create policy "Authenticated users can create comments"
  on public.comments
  for insert
  to authenticated
  with check (
    is_hidden = false
    and auth.uid() = user_id
    and (
      user_email is null
      or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and char_length(btrim(author)) between 1 and 40
    and char_length(btrim(body)) between 2 and 800
  );
