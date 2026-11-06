-- 睡眠・観察していなかった日・場所（6.3.3、6.3.4）
-- 使い方: 0001_init.sql のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- ---------- 共通の決まりを少し広げる ----------
-- 「あとから変えられない列」のうち、表ごとに変えてよい列をトリガーの引数で渡せるようにする。
-- 睡眠と「観察していなかった日」は1日1件をみんなで直すので、recorder_id は最後に入力した人にする。
create or replace function sync_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if new.updated_at < old.updated_at then
      return null;
    end if;
    foreach k in array array['person_id', 'user_id', 'recorder_id', 'event_id', 'created_by'] loop
      if k = any(tg_argv) then continue; end if;
      if n ? k and (n ->> k) is distinct from (o ->> k) then
        raise exception '% は変えられません', k;
      end if;
    end loop;
    new.created_at := old.created_at;
  end if;
  new.server_at := clock_timestamp();
  return new;
end $$;

-- 睡眠を入力・変更できる人: 管理者・副管理者と、「家族」の印か「睡眠の入力を許可」が付いた人（決定37）
create function can_edit_sleep(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where person_id = p and user_id = auth.uid()
      and approved_at is not null and suspended_at is null and deleted_at is null
      and (role in ('admin', 'subadmin') or family_mark or sleep_input_allowed)
  )
$$;

-- ---------- 睡眠（6.3.4）。起きた日ごとに1件 ----------
create table sleep_logs (
  id uuid primary key,
  person_id uuid not null references persons(id),
  wake_date date not null,
  bed_time text not null,
  wake_time text not null,
  wakings int not null default 0,
  note text not null default '',
  recorder_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
create unique index one_sleep_per_day on sleep_logs (person_id, wake_date) where deleted_at is null;

alter table sleep_logs enable row level security;
create policy sleep_select on sleep_logs for select using (my_role(person_id) is not null);
create policy sleep_insert on sleep_logs for insert
  with check (can_edit_sleep(person_id) and recorder_id = auth.uid());
create policy sleep_update on sleep_logs for update
  using (can_edit_sleep(person_id)) with check (can_edit_sleep(person_id) and recorder_id = auth.uid());
create trigger sleep_sync before insert or update on sleep_logs for each row execute function sync_guard('recorder_id');

-- ---------- 観察していなかった日（6.3.3）。行動ごと・日ごとに1件 ----------
create table not_observed_days (
  id uuid primary key,
  person_id uuid not null references persons(id),
  behavior_id uuid not null references behaviors(id),
  local_date date not null,
  recorder_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
create unique index one_mark_per_day on not_observed_days (person_id, behavior_id, local_date) where deleted_at is null;

alter table not_observed_days enable row level security;
create policy nod_select on not_observed_days for select using (my_role(person_id) is not null);
create policy nod_insert on not_observed_days for insert
  with check (role_at_least(person_id, 'supporter') and recorder_id = auth.uid());
create policy nod_update on not_observed_days for update
  using (role_at_least(person_id, 'supporter')) with check (role_at_least(person_id, 'supporter') and recorder_id = auth.uid());
create trigger nod_sync before insert or update on not_observed_days for each row execute function sync_guard('recorder_id');

-- ---------- 場所（6.3.3、決定42・43） ----------
-- 中心と半径はチームの中だけで共有する。支援者の現在地はどこにも保存しない（決定42）
create type place_kind as enum ('home', 'school', 'facility', 'other');

create table places (
  id uuid primary key,
  person_id uuid not null references persons(id),
  name text not null,
  kind place_kind not null,
  lat double precision,
  lng double precision,
  radius_m int not null default 100 check (radius_m in (50, 100, 200)),
  created_by uuid not null references auth.users(id),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);

alter table places enable row level security;
create policy places_select on places for select using (my_role(person_id) is not null);
create policy places_insert on places for insert
  with check (role_at_least(person_id, 'supporter') and created_by = auth.uid());
create policy places_update on places for update
  using (role_at_least(person_id, 'supporter')) with check (role_at_least(person_id, 'supporter'));
create trigger places_sync before insert or update on places for each row execute function sync_guard();

-- ---------- 権限（ログインした人だけ。消す権限は付けない） ----------
revoke all on sleep_logs, not_observed_days, places from anon, authenticated;
revoke execute on function can_edit_sleep(uuid) from public, anon, authenticated;
grant select, insert, update on sleep_logs, not_observed_days, places to authenticated;
grant execute on function can_edit_sleep(uuid) to authenticated;
