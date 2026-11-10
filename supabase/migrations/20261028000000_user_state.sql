-- One row per account: the whole profile, as the JSON blob the app already keeps in localStorage
-- (frontend/src/store/useStore.js). Same shape as api/'s state-<uid>.json, so sync stays "newest
-- _ts wins" and the reconcile logic is unchanged (frontend/src/lib/sync.js).
create table public.user_state (
  -- default auth.uid() so a row can only ever be created for the caller, even if a client omits it
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  state jsonb not null,
  -- the profile's own _ts (ms), kept in a column so it can be compared without opening the blob
  ts bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint user_state_is_object check (jsonb_typeof(state) = 'object'),
  -- same ceiling as api/server.js MAX_BODY, so one account can't balloon the free-tier database
  constraint user_state_size check (pg_column_size(state) < 5 * 1024 * 1024)
);

-- Row-level security is the actual access control: the anon key ships in the public JS bundle,
-- so nothing may rely on it being secret. No policy for `anon` means signed-out callers get nothing.
alter table public.user_state enable row level security;
revoke all on public.user_state from anon;

create policy "read own state" on public.user_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "create own state" on public.user_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own state" on public.user_state
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own state" on public.user_state
  for delete to authenticated using ((select auth.uid()) = user_id);

create function public.touch_user_state() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger user_state_touch before update on public.user_state
  for each row execute function public.touch_user_state();
