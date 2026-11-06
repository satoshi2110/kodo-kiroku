-- チームの設定（ワイヤーフレーム 13）、好きなもの（強化子、6.14）と写真、インターバル記録・時間サンプリング（6.3.1）
-- 使い方: 0004 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- ---------- チームの設定。チーム（対象者）ごとに1行で、id は対象者の id と同じ ----------
create table team_settings (
  id uuid primary key references persons(id),
  person_id uuid not null references persons(id) check (person_id = id),
  ai_enabled boolean not null default false,
  restraint_period text check (restraint_period in ('week', 'month', 'quarter')),
  restraint_count int check (restraint_count >= 0),
  short_sleep_under_hours numeric check (short_sleep_under_hours > 0 and short_sleep_under_hours < 24),
  delete_requested_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz check (deleted_at is null),
  server_at timestamptz not null default clock_timestamp()
);
alter table team_settings enable row level security;
create policy settings_select on team_settings for select using (my_role(person_id) is not null);
-- 設定を変えられるのは管理者・副管理者
create policy settings_insert on team_settings for insert with check (role_at_least(person_id, 'subadmin'));
create policy settings_update on team_settings for update
  using (role_at_least(person_id, 'subadmin')) with check (role_at_least(person_id, 'subadmin'));

-- AI の あり／なし と、チームの削除の申し込みは管理者だけ。ほかの人の保存ではサーバーの値のまま残す。
-- 変えた人は、実際に送った人にする
create function setting_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if my_role(new.person_id) is distinct from 'admin' then
    if tg_op = 'INSERT' then
      new.ai_enabled := false;
      new.delete_requested_at := null;
    else
      new.ai_enabled := old.ai_enabled;
      new.delete_requested_at := old.delete_requested_at;
    end if;
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger settings_rules before insert or update on team_settings for each row execute function setting_guard();
create trigger settings_sync before insert or update on team_settings for each row execute function sync_guard();

-- ---------- 好きなもの（強化子） ----------
create table reinforcers (
  id uuid primary key,
  person_id uuid not null references persons(id),
  name text not null,
  category text not null check (category in ('thing', 'activity', 'food', 'people', 'sensory')),
  level int not null check (level between 1 and 5),
  usage text not null default '',
  has_photo boolean not null default false,
  last_used_at timestamptz,
  updated_by uuid references auth.users(id),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
alter table reinforcers enable row level security;
create policy reinforcers_select on reinforcers for select using (my_role(person_id) is not null);
-- 追加・編集は支援者以上（6.9）
create policy reinforcers_insert on reinforcers for insert with check (role_at_least(person_id, 'supporter'));
create policy reinforcers_update on reinforcers for update
  using (role_at_least(person_id, 'supporter')) with check (role_at_least(person_id, 'supporter'));
create trigger reinforcers_sync before insert or update on reinforcers for each row execute function sync_guard();

-- ---------- 好きなものの写真。小さく縮めた JPEG を文字（data URL）で持つ。id は強化子の id と同じ ----------
-- 端末で長辺 640px に縮め、描き直して Exif（撮影場所など）を落としてから送る。消すときは中身を空にする
create table reinforcer_photos (
  id uuid primary key references reinforcers(id),
  person_id uuid not null references persons(id),
  data text not null check (data = '' or (data like 'data:image/jpeg;base64,%' and length(data) <= 400000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
alter table reinforcer_photos enable row level security;
create policy photos_select on reinforcer_photos for select using (my_role(person_id) is not null);
-- 写真を付けられるのは支援者以上で、同じ対象者の強化子にだけ
create policy photos_insert on reinforcer_photos for insert
  with check (
    role_at_least(person_id, 'supporter')
    and exists (select 1 from reinforcers r where r.id = reinforcer_photos.id and r.person_id = reinforcer_photos.person_id)
  );
create policy photos_update on reinforcer_photos for update
  using (role_at_least(person_id, 'supporter')) with check (role_at_least(person_id, 'supporter'));
create trigger photos_sync before insert or update on reinforcer_photos for each row execute function sync_guard();

-- ---------- インターバル記録・時間サンプリング ----------
create table observations (
  id uuid primary key,
  person_id uuid not null references persons(id),
  behavior_id uuid not null references behaviors(id),
  method text not null check (method in ('interval', 'sampling')),
  interval_sec int not null check (interval_sec > 0),
  started_at timestamptz not null,
  ended_at timestamptz,
  local_date date not null,
  results jsonb not null default '[]',
  recorder_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
alter table observations enable row level security;
create policy observations_select on observations for select using (my_role(person_id) is not null);
-- 記録できるのは支援者以上で、記録者は自分だけ。直すのは記録した本人と、管理者・副管理者・支援リーダー（6.3.5）
create policy observations_insert on observations for insert
  with check (role_at_least(person_id, 'supporter') and recorder_id = auth.uid());
create policy observations_update on observations for update
  using ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'))
  with check ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'));
create trigger observations_sync before insert or update on observations for each row execute function sync_guard();

-- ---------- 権限（ログインした人だけ。消す権限は付けない） ----------
revoke all on team_settings, reinforcers, reinforcer_photos, observations from anon, authenticated;
grant select, insert, update on team_settings, reinforcers, reinforcer_photos, observations to authenticated;
