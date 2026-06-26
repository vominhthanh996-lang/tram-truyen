-- Run this in Supabase SQL Editor to harden the live production database.
-- It removes anonymous shared-comment writes and keeps public reads.

delete from public.comments
where author in ('security-test', 'security-test-2')
  and body in ('test comment security check', 'test anonymous comment after UI hardening');

drop policy if exists "Public can create comments" on public.comments;
drop policy if exists "Authenticated users can create comments" on public.comments;

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
