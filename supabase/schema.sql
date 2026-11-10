-- =====================================================================
-- «Мой карман» — схема базы данных для Supabase (PostgreSQL)
-- Запускать целиком в Supabase → SQL Editor → New query → Run.
-- Скрипт можно запускать повторно: он не удаляет данные.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Операции (доходы и расходы)
-- id генерируется на клиенте (UUID) — это ключ идемпотентности:
-- повторная отправка той же операции (двойной клик, плохая сеть,
-- повторный импорт) не создаёт дубль.
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type         text not null check (type in ('income', 'expense')),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  amount       numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  category     text not null,
  occurred_on  date not null,
  comment      text check (comment is null or char_length(comment) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,  -- мягкое удаление: запись можно восстановить
  constraint transactions_category_valid check (
    (type = 'expense' and category in ('food','transport','fun','shopping','home','health','education','other'))
    or
    (type = 'income'  and category in ('salary','freelance','business','extra','other_income'))
  )
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Финансовые цели и пополнения
-- ---------------------------------------------------------------------
create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 120),
  target_amount  numeric(14,2) not null check (target_amount > 0),
  deadline       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.goal_contributions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id     uuid not null references public.goals(id) on delete cascade,
  amount      numeric(14,2) not null check (amount <> 0), -- отрицательная сумма = снятие
  made_on     date not null default current_date,
  comment     text,
  created_at  timestamptz not null default now()
);

create index if not exists goal_contributions_goal_idx on public.goal_contributions (goal_id);

-- ---------------------------------------------------------------------
-- Выученные правила категорий (из ручных исправлений пользователя)
-- ---------------------------------------------------------------------
create table if not exists public.category_rules (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  keyword     text not null check (char_length(keyword) between 1 and 200),
  category    text not null,
  hits        integer not null default 1,
  updated_at  timestamptz not null default now(),
  primary key (user_id, keyword)
);

-- ---------------------------------------------------------------------
-- Настройки пользователя
-- ---------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  opening_balance  numeric(14,2) not null default 0,
  monthly_budget   numeric(14,2) check (monthly_budget is null or monthly_budget >= 0),
  last_backup_at   timestamptz,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Журнал изменений: копия записи до каждого изменения/удаления.
-- Страховка от случайной правки — можно восстановить любую версию.
-- ---------------------------------------------------------------------
create table if not exists public.transaction_log (
  log_id      bigint generated always as identity primary key,
  user_id     uuid not null,
  tx_id       uuid not null,
  action      text not null,         -- UPDATE | DELETE
  old_row     jsonb not null,
  logged_at   timestamptz not null default now()
);
create index if not exists transaction_log_user_idx on public.transaction_log (user_id, logged_at desc);

-- ---------------------------------------------------------------------
-- Триггеры
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.log_transaction_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.transaction_log (user_id, tx_id, action, old_row)
  values (old.user_id, old.id, tg_op, to_jsonb(old));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Запрет «угона» записи: user_id нельзя поменять
create or replace function public.keep_owner() returns trigger
language plpgsql as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'user_id нельзя изменить';
  end if;
  return new;
end $$;

drop trigger if exists trg_tx_updated on public.transactions;
create trigger trg_tx_updated before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_tx_owner on public.transactions;
create trigger trg_tx_owner before update on public.transactions
  for each row execute function public.keep_owner();

drop trigger if exists trg_tx_log on public.transactions;
create trigger trg_tx_log after update or delete on public.transactions
  for each row execute function public.log_transaction_change();

drop trigger if exists trg_goals_updated on public.goals;
create trigger trg_goals_updated before update on public.goals
  for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_updated on public.user_settings;
create trigger trg_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security: каждый видит и меняет только свои данные
-- ---------------------------------------------------------------------
alter table public.transactions        enable row level security;
alter table public.goals               enable row level security;
alter table public.goal_contributions  enable row level security;
alter table public.category_rules      enable row level security;
alter table public.user_settings       enable row level security;
alter table public.transaction_log     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['transactions','goals','goal_contributions','category_rules','user_settings']
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Журнал: только чтение своих записей
drop policy if exists "own log read" on public.transaction_log;
create policy "own log read" on public.transaction_log for select to authenticated
  using (user_id = auth.uid());

-- Пополнение цели возможно только для своей цели
drop policy if exists "own goal only" on public.goal_contributions;
create policy "own goal only" on public.goal_contributions as restrictive for insert to authenticated
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));

grant select, insert, update, delete on public.transactions, public.goals,
  public.goal_contributions, public.category_rules, public.user_settings to authenticated;
grant select on public.transaction_log to authenticated;
