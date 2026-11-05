-- 強度行動障害 支援記録・共有アプリ: Phase 1 の最初の表（仕様書 8章）
-- 適用のしかた: Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する（1回だけ）。
-- そのあと supabase/tests/rls.sql を Run して、「他チームのデータを読めない・書けない・消せない」ことを確かめる（7.4.3a）。
-- 列は src/db/types.ts と合わせる（camelCase ⇔ snake_case）。
-- チームの分離は行レベルセキュリティ（RLS）で強制する（決定45）。delete の権限はどこにも付けない（論理削除のみ）。
-- 「Automatically expose new tables」を外して作ったプロジェクトなので、使ってよい操作は grant で1つずつ許す。
-- anon（ログインしていない人）には何も許さない。

create extension if not exists pgcrypto;

-- ---------- 共通の決まり（同期するすべての表に付ける） ----------

-- server_at: サーバーが受け取った時刻。端末はこれより新しいものを取りにくる（同期の目印）。
-- 古い updated_at の変更は捨てる（後から届いた古い変更で、新しい変更を上書きしない）。
-- チーム（person_id）・記録した人・作った日時は、あとから変えられない。
create function sync_guard() returns trigger
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
    foreach k in array array['person_id', 'user_id', 'recorder_id', 'event_id'] loop
      if n ? k and (n ->> k) is distinct from (o ->> k) then
        raise exception '% は変えられません', k;
      end if;
    end loop;
    new.created_at := old.created_at;
  end if;
  new.server_at := clock_timestamp();
  return new;
end $$;

-- ---------- 対象者とチーム ----------

create table persons (
  id uuid primary key,
  display_name text not null,
  birth_month text,
  notes text not null default '',
  belongs text not null default '',
  cautions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
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
  approved_at timestamptz,            -- 招待を受けたあと、管理者・副管理者・支援リーダーが承認した日時（7.4.2 #3）
  suspended_at timestamptz,           -- 停止（退職・卒業など）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp(),
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
language sql stable set search_path = public as $$
  select coalesce(
    array_position(array['viewer','supporter','leader','subadmin','admin']::member_role[], my_role(p))
      >= array_position(array['viewer','supporter','leader','subadmin','admin']::member_role[], r),
    false)
$$;

alter table persons enable row level security;
create policy persons_select on persons for select using (my_role(id) is not null);
create policy persons_update on persons for update
  using (role_at_least(id, 'leader')) with check (role_at_least(id, 'leader'));
-- 対象者の作成は開始コードを確かめる関数 create_team からだけ行う（決定44）。insert の権限は付けない。
create trigger persons_sync before insert or update on persons for each row execute function sync_guard();

-- チームの削除の申し込み（deleted_at）は管理者だけ（6.9）
create function persons_rules() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.deleted_at is distinct from old.deleted_at and my_role(old.id) is distinct from 'admin' then
    raise exception 'チームの削除は管理者だけができます';
  end if;
  return new;
end $$;
create trigger persons_rules before update on persons for each row execute function persons_rules();

alter table team_members enable row level security;
-- 承認を待っている人は、自分の行だけ見える
create policy members_select on team_members for select using (my_role(person_id) is not null or user_id = auth.uid());
-- 招待・承認・役割の変更は 管理者・副管理者・支援リーダー（6.9 の「招待・権限」）
create policy members_update on team_members for update
  using (role_at_least(person_id, 'leader')) with check (role_at_least(person_id, 'leader'));
-- メンバーの追加は関数 create_team・join_team からだけ。insert の権限は付けない。
create trigger members_sync before update on team_members for each row execute function sync_guard();

-- 管理者・副管理者にかかわる変更（その役割にする・その人の行を変える）は管理者だけ。
-- 支援リーダーが自分や他人を副管理者・管理者にすることはできない。
create function members_rules() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.role in ('admin', 'subadmin') or old.role in ('admin', 'subadmin'))
     and (new.role, new.approved_at, new.suspended_at, new.deleted_at)
         is distinct from (old.role, old.approved_at, old.suspended_at, old.deleted_at)
     and my_role(old.person_id) is distinct from 'admin' then
    raise exception '管理者・副管理者にかかわる変更は管理者だけができます';
  end if;
  if old.role = 'admin' and new.role is distinct from 'admin' then
    raise exception '管理者の引き継ぎは、まだこの方法ではできません';
  end if;
  return new;
end $$;
create trigger members_rules before update on team_members for each row execute function members_rules();

-- ---------- 開始コードと招待コード（決定44） ----------

-- 開始コード: 運営が発行する。1つで1チーム、使い切り、30日で期限切れ（6.9【暫定】）。
-- 発行は SQL Editor で: insert into start_codes (code) values ('（コード）');
-- 画面からは読めない（RLS を有効にし、ポリシーも grant も付けない）。
create table start_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  disabled_at timestamptz,
  used_at timestamptz,
  used_by uuid references auth.users(id),
  person_id uuid references persons(id)
);
alter table start_codes enable row level security;

-- 招待コード: 管理者・副管理者・支援リーダーが作る。使い切り、7日で期限切れ【暫定】。
create table invites (
  code text primary key,
  person_id uuid not null references persons(id),
  role member_role not null check (role <> 'admin'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  used_at timestamptz,
  used_by uuid references auth.users(id)
);
alter table invites enable row level security;
create policy invites_select on invites for select using (role_at_least(person_id, 'leader'));

-- 読み違えにくい文字だけで 10 文字のコードを作る
create function new_code() returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1), '')
  from generate_series(1, 10)
$$;

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
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);

alter table behaviors enable row level security;
create policy behaviors_select on behaviors for select using (my_role(person_id) is not null);
create policy behaviors_insert on behaviors for insert with check (role_at_least(person_id, 'leader'));
create policy behaviors_update on behaviors for update
  using (role_at_least(person_id, 'leader')) with check (role_at_least(person_id, 'leader'));
create trigger behaviors_sync before insert or update on behaviors for each row execute function sync_guard();
-- 「記録ごと削除」（管理者のみ、6.2）は、のちほどサーバー側の関数で行い、監査ログに件数を残す。

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
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
create index events_person_date on events (person_id, local_date);

alter table events enable row level security;
create policy events_select on events for select using (my_role(person_id) is not null);
-- 記録できるのは支援者以上で、記録者は自分だけ
create policy events_insert on events for insert
  with check (role_at_least(person_id, 'supporter') and recorder_id = auth.uid());
-- 取り消し・編集: 記録した本人と、管理者・副管理者・支援リーダー（6.3.5）
create policy events_update on events for update
  using ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'))
  with check ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'));
create trigger events_sync before insert or update on events for each row execute function sync_guard();

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
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);

alter table choice_options enable row level security;
create policy choices_select on choice_options for select using (my_role(person_id) is not null);
create policy choices_insert on choice_options for insert with check (role_at_least(person_id, 'supporter'));
create policy choices_update on choice_options for update
  using (role_at_least(person_id, 'supporter')) with check (role_at_least(person_id, 'supporter'));
create trigger choices_sync before insert or update on choice_options for each row execute function sync_guard();

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
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
create unique index one_abc_per_event on abc_details (event_id) where deleted_at is null;

alter table abc_details enable row level security;
create policy abc_select on abc_details for select using (my_role(person_id) is not null);
create policy abc_insert on abc_details for insert
  with check (role_at_least(person_id, 'supporter') and recorder_id = auth.uid());
create policy abc_update on abc_details for update
  using ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'))
  with check ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'));
create trigger abc_sync before insert or update on abc_details for each row execute function sync_guard();

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
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);

alter table consents enable row level security;
create policy consents_select on consents for select using (user_id = auth.uid() or role_at_least(person_id, 'subadmin'));
create policy consents_insert on consents for insert
  with check (user_id = auth.uid() and (person_id is null or my_role(person_id) is not null));
create trigger consents_sync before insert on consents for each row execute function sync_guard();

-- ---------- 監査ログ（追記のみ、7.4.2 #6） ----------

create table audit_logs (
  id uuid primary key,
  person_id uuid references persons(id),
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete', 'restore', 'export')),
  actor_id uuid not null references auth.users(id),
  at timestamptz not null default now(),
  before jsonb,
  after jsonb
);

alter table audit_logs enable row level security;
create policy audit_insert on audit_logs for insert
  with check (actor_id = auth.uid() and (person_id is null or my_role(person_id) is not null));
create policy audit_select on audit_logs for select using (role_at_least(person_id, 'leader'));
-- update と delete の権限はどこにも付けない。管理者でも書きかえ・削除できない。

-- ---------- チームを作る・招待する・参加する（決定44） ----------

-- 開始コードで新しいチームを作り、自分を管理者にする
create function create_team(
  p_code text,
  p_person_name text,
  p_birth_month text,
  p_belongs text,
  p_cautions text,
  p_member_name text,
  p_affiliation affiliation,
  p_consent_version text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c start_codes;
  pid uuid := gen_random_uuid();
  mid uuid := gen_random_uuid();
  cid uuid := gen_random_uuid();
begin
  if uid is null then raise exception 'ログインが必要です'; end if;
  select * into c from start_codes where code = upper(trim(p_code)) for update;
  if not found or c.used_at is not null or c.disabled_at is not null or c.expires_at < now() then
    raise exception '開始コードが使えません（まちがい・使用済み・期限切れ）';
  end if;
  insert into persons (id, display_name, birth_month, belongs, cautions)
    values (pid, p_person_name, nullif(p_birth_month, ''), coalesce(p_belongs, ''), coalesce(p_cautions, ''));
  insert into team_members (id, person_id, user_id, display_name, affiliation, role, family_mark, approved_at)
    values (mid, pid, uid, p_member_name, p_affiliation, 'admin', p_affiliation = 'family', now());
  insert into consents (id, person_id, user_id, kind, text_version)
    values (cid, pid, uid, 'terms_privacy_sensitive', p_consent_version);
  update start_codes set used_at = now(), used_by = uid, person_id = pid where code = c.code;
  insert into audit_logs (id, person_id, entity, entity_id, action, actor_id, after) values
    (gen_random_uuid(), pid, 'person', pid, 'create', uid, jsonb_build_object('displayName', p_person_name)),
    (gen_random_uuid(), pid, 'teamMember', mid, 'create', uid, jsonb_build_object('role', 'admin')),
    (gen_random_uuid(), pid, 'consent', cid, 'create', uid, jsonb_build_object('textVersion', p_consent_version));
  return pid;
end $$;

-- 招待コードを作る（管理者・副管理者・支援リーダー）。副管理者として招待できるのは管理者だけ
create function create_invite(p_person uuid, p_role member_role) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text := new_code();
begin
  if not role_at_least(p_person, 'leader') then raise exception '招待できるのは管理者・副管理者・支援リーダーです'; end if;
  if p_role = 'admin' then raise exception '管理者として招待することはできません'; end if;
  if p_role = 'subadmin' and my_role(p_person) is distinct from 'admin' then
    raise exception '副管理者として招待できるのは管理者だけです';
  end if;
  insert into invites (code, person_id, role, created_by) values (code, p_person, p_role, auth.uid());
  insert into audit_logs (id, person_id, entity, entity_id, action, actor_id, after)
    values (gen_random_uuid(), p_person, 'invite', p_person, 'create', auth.uid(), jsonb_build_object('role', p_role));
  return code;
end $$;

-- 招待コードで参加する。承認されるまでチームのデータは見えない（7.4.2 #3）
create function join_team(p_code text, p_member_name text, p_affiliation affiliation, p_consent_version text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  i invites;
  mid uuid := gen_random_uuid();
  cid uuid := gen_random_uuid();
begin
  if uid is null then raise exception 'ログインが必要です'; end if;
  select * into i from invites where code = upper(trim(p_code)) for update;
  if not found or i.used_at is not null or i.revoked_at is not null or i.expires_at < now() then
    raise exception '招待コードが使えません（まちがい・使用済み・期限切れ）';
  end if;
  if exists (select 1 from team_members where person_id = i.person_id and user_id = uid) then
    raise exception 'すでにこのチームのメンバーです';
  end if;
  insert into team_members (id, person_id, user_id, display_name, affiliation, role, family_mark)
    values (mid, i.person_id, uid, p_member_name, p_affiliation, i.role, p_affiliation = 'family');
  insert into consents (id, person_id, user_id, kind, text_version)
    values (cid, i.person_id, uid, 'terms_privacy_sensitive', p_consent_version);
  update invites set used_at = now(), used_by = uid where code = i.code;
  insert into audit_logs (id, person_id, entity, entity_id, action, actor_id, after)
    values (gen_random_uuid(), i.person_id, 'teamMember', mid, 'create', uid, jsonb_build_object('role', i.role, 'via', 'invite'));
  return i.person_id;
end $$;

-- ---------- 使ってよい操作（grant） ----------

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select, update on persons, team_members to authenticated;
grant select, insert, update on behaviors, events, choice_options, abc_details to authenticated;
grant select, insert on consents, audit_logs to authenticated;
grant select on invites to authenticated;

grant execute on function my_role(uuid), role_at_least(uuid, member_role) to authenticated;
grant execute on function create_team(text, text, text, text, text, text, affiliation, text) to authenticated;
grant execute on function create_invite(uuid, member_role) to authenticated;
grant execute on function join_team(text, text, affiliation, text) to authenticated;
