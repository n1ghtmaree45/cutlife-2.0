-- Cutline cloud sync: one JSON snapshot per user, protected by row level security.
-- API keys and progress photos are never part of the snapshot (the app strips them before upload).
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  version    bigint      not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_data_size check (octet_length(data::text) < 5000000)
);

alter table public.user_data enable row level security;

revoke all on public.user_data from anon;

create policy "user_data_select_own" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_data_insert_own" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_data_update_own" on public.user_data
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_data_delete_own" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.user_data_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger user_data_touch before update on public.user_data
  for each row execute function public.user_data_touch();
