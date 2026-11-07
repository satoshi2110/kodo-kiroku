-- 端末ごとのログインと、遠隔ログアウト（7.4.2 #1・#5、決定62。詳細は【暫定】2026-11-07 の試作）。
-- ・端末は同期のたびに（5分に1回まで）device_heartbeat を呼び、「この端末・この人」の行を残す（端末名・最後に通信した時刻）。
--   端末名は画面で作る「iPhone・Safari」のような名前だけ。場所・IP は残さない。
-- ・本人は自分の端末を、管理者・副管理者・支援リーダーはチームのメンバーの端末を、遠隔でログアウトできる。
--   管理者・副管理者の端末をログアウトできるのは管理者だけ（0008 と同じ）。チームの人の端末を止めるには MFA が要る（0020）。
-- ・ログアウトを頼むと、その端末のいまのログイン（session_id）を無効にする。
--   無効にしたログインでは、どのチームのデータも読めず、書けない（my_role が役割を返さない）。端末が電波のない所にあっても、サーバーで止まる。
--   端末は次に通信したとき、端末の中のチームのデータを消して、ログアウトする（送れていない変更も消える）。
--   ほかのチームのデータもその端末から消える（その人がログインし直せば、また取ってくる）。
-- ・同じ人が新しい端末で初めてログインしたら、ほかの端末に「新しい端末からのログイン」を知らせる（決定62・決定101: 画面に出すだけ）。
-- 使い方: 0020 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

create table device_sessions (
  device_id uuid not null,               -- 端末が自分で作って持ち続ける番号（ログアウトしても変えない）
  user_id uuid not null references auth.users(id),
  label text not null default '' check (char_length(label) <= 60),
  shared boolean not null default false, -- 共用の端末か
  session_id uuid,                       -- いまのログイン
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  logout_requested_at timestamptz,       -- 遠隔ログアウトを頼まれた時刻（端末が消し終えて、ログインし直したら空に戻す）
  logout_requested_by uuid references auth.users(id),
  primary key (device_id, user_id)
);
create index device_sessions_user on device_sessions (user_id);

-- 無効にしたログイン（遠隔ログアウトしたもの）
create table revoked_sessions (
  session_id uuid primary key,
  revoked_at timestamptz not null default now()
);

alter table device_sessions enable row level security;
alter table revoked_sessions enable row level security;
-- 書くのは下の関数からだけ（insert・update・delete の権限は付けない）。revoked_sessions は誰も直接は読めない。
-- 読めるのは: 自分の端末。チームの支援リーダー以上は、そのチームのメンバー（削除されていない人）の端末。
create policy device_sessions_select on device_sessions for select using (
  user_id = auth.uid()
  or exists (select 1 from team_members m
             where m.user_id = device_sessions.user_id and m.deleted_at is null
               and role_at_least(m.person_id, 'leader')));

-- いまのログインが、遠隔ログアウトで無効にされたか
create function session_revoked() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from revoked_sessions r
                 where r.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid)
$$;

-- ---------- 役割（0001 の作り直し）: 無効にしたログインでは、どのチームの役割も返さない ----------
create or replace function my_role(p uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from team_members
  where person_id = p and user_id = auth.uid()
    and approved_at is not null and suspended_at is null and deleted_at is null
    and not session_revoked()
$$;

-- ---------- 端末から: 「この端末でログインしている」を残し、遠隔ログアウトを頼まれていないかを返す ----------
-- 返すもの: logout（ログアウトしてデータを消す）、new_devices（この端末より後に初めてログインした、自分のほかの端末）
create function device_heartbeat(p_device uuid, p_label text, p_shared boolean, p_seen timestamptz default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  d device_sessions;
  first boolean;
begin
  if uid is null or p_device is null then raise exception 'ログインしていません'; end if;
  if session_revoked() then
    return json_build_object('logout', true, 'new_devices', '[]'::json);
  end if;
  select * into d from device_sessions where device_id = p_device and user_id = uid;
  first := not found;
  if first then
    insert into device_sessions (device_id, user_id, label, shared, session_id)
      values (p_device, uid, left(coalesce(p_label, ''), 60), coalesce(p_shared, false), sid)
      returning * into d;
  else
    -- 遠隔ログアウトのあとにログインし直した（いまのログインは無効にされていない）ので、頼まれたことは終わった
    update device_sessions set
      label = left(coalesce(p_label, ''), 60), shared = coalesce(p_shared, false), session_id = sid,
      last_seen_at = now(), logout_requested_at = null, logout_requested_by = null
      where device_id = p_device and user_id = uid
      returning * into d;
  end if;
  return json_build_object(
    'logout', false,
    'first', first,
    'new_devices', coalesce((
      select json_agg(json_build_object('label', o.label, 'created_at', o.created_at) order by o.created_at)
      from device_sessions o
      where o.user_id = uid and o.device_id <> p_device
        and o.created_at > d.created_at
        and o.created_at > coalesce(p_seen, '-infinity')), '[]'::json));
end $$;

-- ---------- 遠隔ログアウトを頼む ----------
-- p_person: どのチームの立場で頼むか（自分の端末なら null でよい）
create function request_device_logout(p_device uuid, p_user uuid, p_person uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d device_sessions;
  target_role member_role;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  if session_revoked() then raise exception 'このログインは無効になっています'; end if;
  select * into d from device_sessions where device_id = p_device and user_id = p_user;
  if not found then raise exception 'その端末は見つかりません'; end if;
  if p_user <> uid then
    if p_person is null or not role_at_least(p_person, 'leader') then
      raise exception 'ほかの人の端末をログアウトできるのは、そのチームの管理者・副管理者・支援リーダーです';
    end if;
    select m.role into target_role from team_members m
      where m.person_id = p_person and m.user_id = p_user and m.deleted_at is null;
    if not found then raise exception 'その人はこのチームのメンバーではありません'; end if;
    if target_role in ('admin', 'subadmin') and my_role(p_person) is distinct from 'admin' then
      raise exception '管理者・副管理者の端末をログアウトできるのは管理者だけです';
    end if;
    if not mfa_ok(p_person) then raise exception 'MFA_REQUIRED: ほかの人の端末をログアウトするには多要素認証（MFA）が必要です'; end if;
  end if;
  update device_sessions set logout_requested_at = now(), logout_requested_by = uid
    where device_id = p_device and user_id = p_user;
  if d.session_id is not null then
    insert into revoked_sessions (session_id) values (d.session_id) on conflict do nothing;
  end if;
  if p_person is not null then
    insert into audit_logs (id, person_id, entity, entity_id, action, actor_id, after)
      values (gen_random_uuid(), p_person, 'device_logout', p_device, 'update', uid,
              jsonb_build_object('userId', p_user, 'label', d.label));
  end if;
end $$;

-- ---------- 使ってよい操作 ----------
revoke all on device_sessions, revoked_sessions from anon, authenticated;
grant select on device_sessions to authenticated;
revoke execute on function session_revoked(), device_heartbeat(uuid, text, boolean, timestamptz), request_device_logout(uuid, uuid, uuid) from public, anon;
grant execute on function session_revoked(), device_heartbeat(uuid, text, boolean, timestamptz), request_device_logout(uuid, uuid, uuid) to authenticated;
