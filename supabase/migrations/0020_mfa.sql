-- 多要素認証（MFA）の基準と、サーバーでの強制（7.4.3、決定34・53。詳細は【暫定】2026-11-07 の試作）。
-- ・チームの基準（管理者が選ぶ）: 'all' 全員必須 / 'leader' 支援リーダー以上は必須（既定）/ 'optional' 任意。
-- ・メンバーごとの例外（管理者が付ける）: 'required' 必須 / 'exempt' 免除。
-- ・管理者・副管理者は、基準と例外にかかわらず必須（解除できない）。
-- ・必須になってから7日間は猶予。猶予のあとに MFA を通していないログインでは「閲覧だけ」になる
--   （読むのはこれまでどおり。端末からの書き込みと、招待コードを作ることができなくなる）。
-- ・自分で MFA を設定している人は、基準が「任意」でも、MFA を通していないログインでは書き込めない
--   （パスワードだけを盗まれたときに書き込まれないように）。
-- ・方式は認証アプリのコード（TOTP）だけ。SMS（有料のプランが要る）とパスキーは、あとで決める。
-- ・猶予の起点: 0020 を流した時刻（いまあるチームとメンバー）、基準を変えた時刻、そのメンバーの例外・役割が変わった時刻、参加した時刻。
-- 使い方: 0019 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

alter table team_settings
  add column mfa_rule text not null default 'leader' check (mfa_rule in ('all', 'leader', 'optional')),
  add column mfa_rule_at timestamptz not null default now();
alter table team_members
  add column mfa_override text check (mfa_override in ('required', 'exempt')),
  add column mfa_override_at timestamptz not null default now();

-- ---------- いまのログインで、このチームに書き込んでよいか ----------
-- 自分がこのチームのメンバーでないとき（チームを作る・参加する途中など）は、ここでは止めない（ほかの決まりが止める）。
create function mfa_ok(p uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m team_members;
  rule text;
  rule_at timestamptz;
begin
  if uid is null then return true; end if;
  if coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then return true; end if;
  -- 自分で MFA を設定しているのに、MFA を通していないログイン
  if exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.status = 'verified') then return false; end if;
  select * into m from team_members where person_id = p and user_id = uid and deleted_at is null;
  if not found then return true; end if;
  select s.mfa_rule, s.mfa_rule_at into rule, rule_at from team_settings s where s.person_id = p;
  rule := coalesce(rule, 'leader');
  if not (m.role in ('admin', 'subadmin')
          or m.mfa_override is not distinct from 'required'
          or (m.mfa_override is distinct from 'exempt'
              and (rule = 'all' or (rule = 'leader' and m.role = 'leader')))) then
    return true;
  end if;
  return now() < greatest(coalesce(rule_at, '-infinity'), m.mfa_override_at) + interval '7 days';
end $$;

-- 画面に出すための、自分の MFA の状態（必須か・猶予の期限・いまのログインで書き込めるか）
create function mfa_status(p uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m team_members;
  rule text;
  rule_at timestamptz;
  need boolean;
begin
  if uid is null then return null; end if;
  select * into m from team_members where person_id = p and user_id = uid and deleted_at is null;
  if not found then return null; end if;
  select s.mfa_rule, s.mfa_rule_at into rule, rule_at from team_settings s where s.person_id = p;
  rule := coalesce(rule, 'leader');
  need := m.role in ('admin', 'subadmin')
          or m.mfa_override is not distinct from 'required'
          or (m.mfa_override is distinct from 'exempt' and (rule = 'all' or (rule = 'leader' and m.role = 'leader')));
  return json_build_object(
    'required', need,
    'due_at', case when need then greatest(coalesce(rule_at, '-infinity'), m.mfa_override_at) + interval '7 days' end,
    'aal2', coalesce(auth.jwt() ->> 'aal', '') = 'aal2',
    'ok', mfa_ok(p));
end $$;

-- ---------- 共通の決まり（0004 の作り直し）: 書き込む前に MFA を確かめる ----------
-- 画面からの書き込みと、サーバーの関数の中の書き込み（承認・管理者の引き継ぎなど）の両方で確かめる。
-- 自分からチームを抜けること（leave_team）だけは、MFA がなくてもできる。
create or replace function sync_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb;
  k text;
  p uuid;
begin
  if auth.uid() is not null and coalesce(current_setting('app.leave_team', true), '') <> 'on' then
    p := coalesce(n ->> 'person_id', case when tg_table_name = 'persons' then n ->> 'id' end)::uuid;
    if p is not null and not mfa_ok(p) then
      raise exception 'MFA_REQUIRED: このチームでは多要素認証（MFA）が必要です。「あなたの設定」で設定するか、認証アプリのコードを入れてログインし直してください';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if new.updated_at < old.updated_at then
      return null;
    end if;
    foreach k in array array['person_id', 'user_id', 'recorder_id', 'event_id', 'created_by', 'plan_id', 'saved_by', 'change_id', 'member_id', 'author_id'] loop
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

-- ---------- MFA の基準と例外を変えられるのは管理者だけ。時刻はサーバーが付ける ----------
-- 管理者でない人の保存では、エラーにせず前の値のまま残す（端末は行をまるごと送るため。0018 と同じ）。
create function mfa_settings_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if my_role(new.person_id) is distinct from 'admin' then new.mfa_rule := 'leader'; end if;
    new.mfa_rule_at := now();
    return new;
  end if;
  if my_role(new.person_id) is distinct from 'admin' then new.mfa_rule := old.mfa_rule; end if;
  new.mfa_rule_at := case when new.mfa_rule is distinct from old.mfa_rule then now() else old.mfa_rule_at end;
  return new;
end $$;
create trigger settings_mfa before insert or update on team_settings for each row execute function mfa_settings_guard();

create function mfa_member_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if my_role(old.person_id) is distinct from 'admin' and current_user = 'authenticated' then
    new.mfa_override := old.mfa_override;
  end if;
  -- 管理者・副管理者は免除できない
  if new.role in ('admin', 'subadmin') and new.mfa_override = 'exempt' then new.mfa_override := null; end if;
  new.mfa_override_at := case
    when new.mfa_override is distinct from old.mfa_override or new.role is distinct from old.role then now()
    else old.mfa_override_at end;
  return new;
end $$;
create trigger members_mfa before update on team_members for each row execute function mfa_member_guard();

-- ---------- 招待コードを作る（0018 の作り直し。MFA を確かめる行だけ足す） ----------
create or replace function create_invite(p_person uuid, p_role member_role, p_family boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text := new_code();
  fam boolean := coalesce(p_family, false);
begin
  if not role_at_least(p_person, 'leader') then raise exception '招待できるのは管理者・副管理者・支援リーダーです'; end if;
  if not mfa_ok(p_person) then raise exception 'MFA_REQUIRED: 招待するには多要素認証（MFA）が必要です'; end if;
  if p_role = 'admin' then raise exception '管理者として招待することはできません'; end if;
  if p_role = 'subadmin' and my_role(p_person) is distinct from 'admin' then
    raise exception '副管理者として招待できるのは管理者だけです';
  end if;
  if fam and my_role(p_person) is distinct from 'admin' then
    raise exception '「家族」の印を付けて招待できるのは管理者だけです';
  end if;
  insert into invites (code, person_id, role, created_by, family_mark) values (code, p_person, p_role, auth.uid(), fam);
  insert into audit_logs (id, person_id, entity, entity_id, action, actor_id, after)
    values (gen_random_uuid(), p_person, 'invite', p_person, 'create', auth.uid(), jsonb_build_object('role', p_role, 'familyMark', fam));
  return code;
end $$;

-- ---------- 使ってよい操作 ----------
revoke execute on function mfa_ok(uuid) from public, anon;
grant execute on function mfa_ok(uuid) to authenticated;
revoke execute on function mfa_status(uuid) from public, anon;
grant execute on function mfa_status(uuid) to authenticated;
