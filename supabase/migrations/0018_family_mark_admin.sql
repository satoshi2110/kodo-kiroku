-- 「家族」の印は管理者だけが付ける（6.3.4、発注者回答 2026-11-07）。
-- ・これまで: 参加する人が所属に「家族」を選ぶと、印が自動で付いた。承認は支援リーダーでもできるので、
--   管理者を通さずに睡眠の入力ができる人が出た。また、支援リーダーがメンバーの行の印を直接書きかえられた（画面で隠していただけ）。
-- ・これから:
--   1. 招待コードに「家族」の印を持たせる。印を付けて招待できるのは管理者だけ。
--   2. 招待で参加した人の印は、招待コードの印だけで決まる（所属の自己申告では付かない）。
--   3. メンバーの「家族」の印と「睡眠の入力を許可」を変えられるのは管理者だけ。管理者でない人が送った変更は、
--      エラーにせず前の値のまま残す（端末はメンバーの行をまるごと送るため。古い行を送った人の同期を止めない）。
-- ・すでに付いている印はそのまま。管理者がメンバー一覧で見直して外せる。
-- 使い方: 0017 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

alter table invites add column family_mark boolean not null default false;

-- ---------- 招待コードを作る（0001 の作り直し。印を付けられるのは管理者だけ） ----------
drop function create_invite(uuid, member_role);
create function create_invite(p_person uuid, p_role member_role, p_family boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text := new_code();
  fam boolean := coalesce(p_family, false);
begin
  if not role_at_least(p_person, 'leader') then raise exception '招待できるのは管理者・副管理者・支援リーダーです'; end if;
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

-- ---------- 招待コードで参加する（0001 の作り直し。印は招待コードから） ----------
create or replace function join_team(p_code text, p_member_name text, p_affiliation affiliation, p_consent_version text) returns uuid
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
    values (mid, i.person_id, uid, p_member_name, p_affiliation, i.role, i.family_mark);
  insert into consents (id, person_id, user_id, kind, text_version)
    values (cid, i.person_id, uid, 'terms_privacy_sensitive', p_consent_version);
  update invites set used_at = now(), used_by = uid where code = i.code;
  insert into audit_logs (id, person_id, entity, entity_id, action, actor_id, after)
    values (gen_random_uuid(), i.person_id, 'teamMember', mid, 'create', uid, jsonb_build_object('role', i.role, 'via', 'invite'));
  return i.person_id;
end $$;

-- ---------- メンバーの決まり（0012 の作り直し。印と睡眠の許可は管理者だけ） ----------
create or replace function members_rules() returns trigger
language plpgsql set search_path = public as $$
declare
  handover boolean := coalesce(current_setting('app.owner_transfer', true), '') = 'on' and current_user <> 'authenticated';
begin
  if not handover
     and (new.role in ('admin', 'subadmin') or old.role in ('admin', 'subadmin'))
     and (new.role, new.approved_at, new.suspended_at, new.deleted_at)
         is distinct from (old.role, old.approved_at, old.suspended_at, old.deleted_at)
     and my_role(old.person_id) is distinct from 'admin' then
    raise exception '管理者・副管理者にかかわる変更は管理者だけができます';
  end if;
  if not handover and (old.role = 'admin') is distinct from (new.role = 'admin') then
    raise exception '管理者は、管理者の引き継ぎでだけ変わります';
  end if;
  if old.user_id = auth.uid()
     and (new.suspended_at, new.deleted_at) is distinct from (old.suspended_at, old.deleted_at) then
    raise exception '自分を停止・削除することはできません';
  end if;
  -- 「家族」の印と「睡眠の入力を許可」は管理者だけ（6.3.4）。ほかの人の変更は前の値に戻す
  if my_role(old.person_id) is distinct from 'admin' then
    new.family_mark := old.family_mark;
    new.sleep_input_allowed := old.sleep_input_allowed;
  end if;
  return new;
end $$;

-- ---------- 使ってよい操作 ----------
revoke execute on function create_invite(uuid, member_role, boolean) from public, anon;
grant execute on function create_invite(uuid, member_role, boolean) to authenticated;
