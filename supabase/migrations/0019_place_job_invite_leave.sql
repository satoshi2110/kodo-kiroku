-- 足りなかった小さな項目（2026-11-07）。
-- 1. インターバル・時間サンプリングの観察にも、場所の名前を残す（6.3.3。ほかの記録と同じく名前だけ。緯度経度は残さない）。
-- 2. メンバーの「職種」（例: サービス管理責任者・支援員・担任）。書きかえられるのは、メンバーを直せる人（支援リーダー以上）。
-- 3. 招待コードの中身を、チームに入る前に確かめる（ワイヤーフレーム「ログイン / 招待受諾」、発注者回答 2026-11-07）。
--    ログインしていなくても見られるのは、役割・招待した人の名前・期限だけ。チームの名前（対象者の呼び名）はログインしてから。
-- 4. メンバーが自分からチームを抜ける（7.6、発注者回答 2026-11-07）。抜けても、付けた記録はチームに残る。
--    管理者は抜けられない（管理者の引き継ぎをしてから）。アカウント（メール）の削除は運営者に頼む。
-- 使い方: 0018 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

alter table observations add column place_name text check (place_name is null or length(place_name) <= 100);
alter table team_members add column job_title text not null default '' check (length(job_title) <= 40);

-- ---------- 招待コードの中身（ログイン前でも呼べる） ----------
-- 使えないコードのときは null。開始コードのときは種類と期限だけ。
create function invite_preview(p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  c text := upper(trim(coalesce(p_code, '')));
  i invites;
  s start_codes;
begin
  select * into i from invites where code = c and used_at is null and revoked_at is null and expires_at > now();
  if found then
    return json_build_object(
      'kind', 'invite',
      'role', i.role,
      'family_mark', i.family_mark,
      'expires_at', i.expires_at,
      'inviter', (select display_name from team_members where person_id = i.person_id and user_id = i.created_by and deleted_at is null limit 1),
      'team', case when auth.uid() is not null then (select display_name from persons where id = i.person_id) end);
  end if;
  select * into s from start_codes where code = c and used_at is null and disabled_at is null and expires_at > now();
  if found then
    return json_build_object('kind', 'start', 'expires_at', s.expires_at);
  end if;
  return null;
end $$;

-- ---------- 自分からチームを抜ける ----------
create function leave_team(p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m team_members;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select * into m from team_members where person_id = p_person and user_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'このチームのメンバーではありません'; end if;
  if m.role = 'admin' then raise exception '管理者は、管理者を引き継いでからチームを抜けてください'; end if;
  perform set_config('app.leave_team', 'on', true);
  update team_members set deleted_at = now(), updated_at = greatest(now(), m.updated_at) where id = m.id;
  perform set_config('app.leave_team', 'off', true);
end $$;

-- ---------- メンバーの決まり（0018 の作り直し。自分で抜けるときだけ、自分の行に「削除」を付けられる） ----------
create or replace function members_rules() returns trigger
language plpgsql set search_path = public as $$
declare
  handover boolean := coalesce(current_setting('app.owner_transfer', true), '') = 'on' and current_user <> 'authenticated';
  -- leave_team の中（関数の持ち主の権限で動いているとき）だけ。画面から直接は付けられない
  leaving boolean := coalesce(current_setting('app.leave_team', true), '') = 'on' and current_user <> 'authenticated'
    and old.user_id = auth.uid() and old.role <> 'admin'
    and (new.role, new.approved_at, new.suspended_at) is not distinct from (old.role, old.approved_at, old.suspended_at)
    and old.deleted_at is null and new.deleted_at is not null;
begin
  if not handover and not leaving
     and (new.role in ('admin', 'subadmin') or old.role in ('admin', 'subadmin'))
     and (new.role, new.approved_at, new.suspended_at, new.deleted_at)
         is distinct from (old.role, old.approved_at, old.suspended_at, old.deleted_at)
     and my_role(old.person_id) is distinct from 'admin' then
    raise exception '管理者・副管理者にかかわる変更は管理者だけができます';
  end if;
  if not handover and (old.role = 'admin') is distinct from (new.role = 'admin') then
    raise exception '管理者は、管理者の引き継ぎでだけ変わります';
  end if;
  if not leaving and old.user_id = auth.uid()
     and (new.suspended_at, new.deleted_at) is distinct from (old.suspended_at, old.deleted_at) then
    raise exception '自分を停止・削除することはできません（チームを抜けるときは「チームを抜ける」から）';
  end if;
  -- 「家族」の印と「睡眠の入力を許可」は管理者だけ（6.3.4）。ほかの人の変更は前の値に戻す
  if my_role(old.person_id) is distinct from 'admin' then
    new.family_mark := old.family_mark;
    new.sleep_input_allowed := old.sleep_input_allowed;
  end if;
  return new;
end $$;

-- ---------- 使ってよい操作 ----------
revoke execute on function invite_preview(text) from public;
grant execute on function invite_preview(text) to anon, authenticated;
revoke execute on function leave_team(uuid) from public, anon;
grant execute on function leave_team(uuid) to authenticated;
