-- ENDFIELD // схема аккаунтов и синхронизации истории
-- выполнить целиком в Supabase → SQL Editor → New query → Run

-- история снапшотов калькулятора: 1 запись = 1 игровой день конкретного юзера
create table if not exists public.history (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       text not null,              -- YYYY-MM-DD (игровой день, см. todayKey() в calc.js)
  pulls      integer not null default 0,
  pulls_don  integer,                    -- итог вместе с донатом (null = донат в этот день не считали)
  oro        integer not null default 0,
  orig       integer not null default 0,
  base       integer not null default 0,
  pass       boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.history enable row level security;

create policy "history: select own" on public.history
  for select using (auth.uid() = user_id);
create policy "history: insert own" on public.history
  for insert with check (auth.uid() = user_id);
create policy "history: update own" on public.history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "history: delete own" on public.history
  for delete using (auth.uid() = user_id);

-- текущее состояние калькулятора (черновик полей + пропуск + донаты) — 1 строка на юзера
create table if not exists public.calc_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.calc_state enable row level security;

create policy "calc_state: select own" on public.calc_state
  for select using (auth.uid() = user_id);
create policy "calc_state: upsert own" on public.calc_state
  for insert with check (auth.uid() = user_id);
create policy "calc_state: update own" on public.calc_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
