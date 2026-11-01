-- Execute uma vez no SQL Editor do projeto Supabase.
-- Dados internos do bot: sem acesso pelas chaves públicas ou usuários do site.
begin;
create table if not exists public.anzy_bot_state (
  bot_id text not null check (bot_id ~ '^[0-9]{17,20}$'),
  module text not null check (module ~ '^[a-z0-9_-]{1,64}$'),
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (bot_id, module)
);
alter table public.anzy_bot_state enable row level security;
revoke all on table public.anzy_bot_state from anon, authenticated;
grant select, insert, update, delete on table public.anzy_bot_state to service_role;
commit;
