-- わたしのいつもの時間（6.3.3、データモデル UserSchedule）。記録者ごとの勤務・在宅時間の目安で、グラフの「1時間あたりの回数」の観察時間の推定に使う
-- 使い方: 0005 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

create table user_schedules (
  id uuid primary key,
  person_id uuid not null references persons(id),
  user_id uuid not null references auth.users(id),
  weekdays int[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]),
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and end_time > start_time),
  place_name text check (length(place_name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
alter table user_schedules enable row level security;
-- チームの全員が見られる（だれがいつ一緒にいるかの目安）
create policy schedules_select on user_schedules for select using (my_role(person_id) is not null);
-- 作る・直す・消す（論理削除）のは本人だけで、記録できる人（支援者以上）。ほかの人のものは管理者でも直せない
create policy schedules_insert on user_schedules for insert
  with check (user_id = auth.uid() and role_at_least(person_id, 'supporter'));
create policy schedules_update on user_schedules for update
  using (user_id = auth.uid() and role_at_least(person_id, 'supporter'))
  with check (user_id = auth.uid() and role_at_least(person_id, 'supporter'));
create trigger schedules_sync before insert or update on user_schedules for each row execute function sync_guard();
