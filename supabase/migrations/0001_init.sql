-- 強度行動障害 支援記録・共有アプリ: Phase 1 の最初の表（仕様書 8章）
-- 状態: 未適用・未検証。Supabase のプロジェクトを作ったあとに適用し、
--       「他チームのデータを読めない・書けない・消せない」テスト（7.4.3a）を足してから使う。
-- 列は src/db/types.ts と合わせる（camelCase ⇔ snake_case）。
-- チームの分離は行レベルセキュリティ（RLS）で強制する（決定45）。delete の権限はどこにも付けない（論理削除のみ）。

create extension if not exists pgcrypto;

-- ---------- 対象者とチーム ----------

create table persons (
  id uuid primary key,
  display_name text not null,
  birth_month text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type member_role as enum ('admin', 'subadmin', 'leader', 'supporter', 'viewer');
create type affiliation as enum ('family', 'facility', 'school', 'other');

create table team_members (
  id uuid primary key,
  person_id uuid not null references persons(id),
  user_id uuid not null references auth.users(id),
  display_name text not null,
  affiliation affiliation not null,
  role member_role not null,
  family_mark boolean not null default false,
  sleep_input_allowed boolean not null default false,
  approved_at timestamptz,            -- 招待を受けたあと、管理者か支援リーダーが承認した日時（7.4.2 #3）
  suspended_at timestamptz,           -- 停止（退職・卒業など）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (person_id, user_id)
);
create unique index one_admin_per_team on team_members (person_id) where role = 'admin' and deleted_at is null;

-- 自分がそのチームの有効なメンバーなら、その役割を返す（承認済み・停止されていない・削除されていない）
create function my_role(p uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from team_members
  where person_id = p and user_id = auth.uid()
    and approved_at is not null and suspended_at is null and deleted_at is null
$$;

create function role_at_least(p uuid, r member_role) returns boolean
language sql stable as $$
  select coalesce(
    array_position(array['viewer','supporter','leader','subadmin','admin']::member_role[], my_role(p))
      >= array_position(array['viewer','supporter','leader','subadmin','admin']::member_role[], r),
    false)
$$;

alter table persons enable row level security;
create policy persons_select on persons for select using (my_role(id) is not null);
create policy persons_update on persons for update using (role_at_least(id, 'leader'));
-- 対象者の作成は開始コードを確かめるサーバー側の関数からだけ行う（決定44）。insert の権限は付けない。

alter table team_members enable row level security;
create policy members_select on team_members for select using (my_role(person_id) is not null or user_id = auth.uid());
create policy members_update on team_members for update using (role_at_least(person_id, 'leader'));
-- 招待と承認はサーバー側の関数から行う。

-- ---------- 行動定義 ----------

create type behavior_kind as enum ('problem', 'desirable', 'alternative');
create type measure_method as enum ('frequency', 'duration', 'latency', 'interval', 'sampling');
create type behavior_function as enum ('attention', 'demand', 'escape', 'sensory');

create table behaviors (
  id uuid primary key,
  person_id uuid not null references persons(id),
  kind behavior_kind not null,
  name text not null,
  definition text not null default '',
  examples text not null default '',
  non_examples text not null default '',
  method measure_method not null,
  interval_sec int check (interval_sec between 5 and 60),
  sampling_min int check (sampling_min between 1 and 30),
  intensity jsonb,                     -- { levels: 3|5, criteria: text[] } または null
  replaces_behavior_id uuid references behaviors(id),
  func behavior_function,
  sort_order int not null default 0,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table behaviors enable row level security;
create policy behaviors_select on behaviors for select using (my_role(person_id) is not null);
create policy behaviors_insert on behaviors for insert with check (role_at_least(person_id, 'leader'));
create policy behaviors_update on behaviors for update using (role_at_least(person_id, 'leader'));
-- 「記録ごと削除」（管理者のみ、6.2）はサーバー側の関数で行い、監査ログに件数を残す。

-- ---------- 記録 ----------

create table events (
  id uuid primary key,
  person_id uuid not null references persons(id),
  behavior_id uuid not null references behaviors(id),
  occurred_at timestamptz not null,
  local_date date not null,
  count int not null default 1,
  duration_sec int,
  latency_sec int,
  intensity int,
  place_name text,                     -- 場所の名前だけ。座標は持たない（決定42）
  activity text,
  recorder_id uuid not null references auth.users(id),
  backfilled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index events_person_date on events (person_id, local_date);

alter table events enable row level security;
create policy events_select on events for select using (my_role(person_id) is not null);
-- 記録できるのは支援者以上で、記録者は自分だけ
create policy events_insert on events for insert
  with check (role_at_least(person_id, 'supporter') and recorder_id = auth.uid());
-- 取り消し・編集: 記録した本人と、管理者・副管理者・支援リーダー（6.3.5）
create policy events_update on events for update
  using ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'));

-- ---------- ABC記録（6.3.2） ----------

create type choice_kind as enum ('antecedent', 'consequence', 'setting');

-- A・C・状況要因の選択肢。対象者ごとのテンプレートで、削除は非表示だけ
create table choice_options (
  id uuid primary key,
  person_id uuid not null references persons(id),
  kind choice_kind not null,
  name text not null,
  sort_order int not null default 0,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table choice_options enable row level security;
create policy choices_select on choice_options for select using (my_role(person_id) is not null);
create policy choices_insert on choice_options for insert with check (role_at_least(person_id, 'supporter'));
create policy choices_update on choice_options for update using (role_at_least(person_id, 'supporter'));

create table abc_details (
  id uuid primary key,
  person_id uuid not null references persons(id),
  event_id uuid not null references events(id),
  antecedent_ids uuid[] not null default '{}',
  antecedent_note text not null default '',
  consequence_ids uuid[] not null default '{}',
  consequence_note text not null default '',
  setting_ids uuid[] not null default '{}',
  involved_member_ids uuid[] not null default '{}',
  func_guess behavior_function,
  note text not null default '',
  recorder_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index one_abc_per_event on abc_details (event_id) where deleted_at is null;

alter table abc_details enable row level security;
create policy abc_select on abc_details for select using (my_role(person_id) is not null);
create policy abc_insert on abc_details for insert
  with check (role_at_least(person_id, 'supporter') and recorder_id = auth.uid());
create policy abc_update on abc_details for update
  using ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'));

-- ---------- 同意 ----------

create type consent_kind as enum ('terms_privacy_sensitive', 'ai_overseas');

create table consents (
  id uuid primary key,
  person_id uuid references persons(id),
  user_id uuid not null references auth.users(id),
  kind consent_kind not null,
  text_version text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table consents enable row level security;
create policy consents_select on consents for select using (user_id = auth.uid() or role_at_least(person_id, 'subadmin'));
create policy consents_insert on consents for insert with check (user_id = auth.uid());

-- ---------- 監査ログ（追記のみ、7.4.2 #6） ----------

create table audit_logs (
  id uuid primary key,
  person_id uuid references persons(id),
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete', 'restore')),
  actor_id uuid not null references auth.users(id),
  at timestamptz not null default now(),
  before jsonb,
  after jsonb
);

alter table audit_logs enable row level security;
create policy audit_insert on audit_logs for insert with check (actor_id = auth.uid() and (person_id is null or my_role(person_id) is not null));
create policy audit_select on audit_logs for select using (role_at_least(person_id, 'leader'));
-- update と delete の権限はどこにも付けない。管理者でも書きかえ・削除できない。
