-- Guitar Tabs: per-user tab library with soft deletes, protected by Row Level Security.
-- Sync is last-write-wins on updated_at, which the client sets (so offline edits keep their real time).

create table if not exists public.tabs (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Untitled tab' check (char_length(title) <= 200),
  artist      text not null default '' check (char_length(artist) <= 200),
  tuning      smallint[] not null default '{}' check (cardinality(tuning) <= 12),
  tempo       integer not null default 100 check (tempo between 20 and 300),
  content     text not null default '' check (octet_length(content) <= 1000000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists tabs_user_id_updated_at_idx on public.tabs (user_id, updated_at desc);

alter table public.tabs enable row level security;

-- Only signed-in users, and only their own rows. No anon access at all.
revoke all on public.tabs from anon;
grant select, insert, update, delete on public.tabs to authenticated;

create policy "tabs: select own" on public.tabs
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "tabs: insert own" on public.tabs
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "tabs: update own" on public.tabs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "tabs: delete own" on public.tabs
  for delete to authenticated using ((select auth.uid()) = user_id);
