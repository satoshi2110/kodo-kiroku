-- 管理者の引き継ぎ（6.9、データモデル OwnerTransfer）。
-- ・管理者が自分で引き継ぐ: 管理者が副管理者か「家族」の印がある人を指名し、指名された人が受けたら入れかわる。
-- ・管理者が操作できない: 副管理者が申し込み、14日のあいだ管理者が断らなければ、副管理者が管理者になる。
--   管理者はその間に断れる（期限の前だけ）。早く受けることもできる。
-- ・入れかわるときは、元の管理者は副管理者になる。ほかにもう副管理者がいるときは支援リーダーになる（副管理者は1人、決定39）。【暫定】
-- ・申し込み・返事・入れかわりは、表への書き込みとして監査ログに残る（0010 のトリガー）。
-- 管理者の役割は、ここの関数の中からだけ変えられる（members_rules を作り直す）。
-- 使い方: 0011 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

create table owner_transfers (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references persons(id),
  method text not null check (method in ('nominate', 'subadmin_request')), -- 本人指名 / 副管理者申請（運営窓口はアプリの外）
  requested_by uuid not null references auth.users(id),
  from_user uuid not null references auth.users(id), -- 旧管理者
  to_user uuid not null references auth.users(id),   -- 新管理者
  requested_at timestamptz not null default now(),
  due_at timestamptz, -- 副管理者申請だけ。この時刻を過ぎたら副管理者が管理者になれる
  result text not null default 'pending' check (result in ('pending', 'completed', 'declined', 'rejected', 'cancelled')),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_at timestamptz not null default clock_timestamp()
);
-- 進んでいる引き継ぎは、チームに1つだけ
create unique index one_open_transfer_per_team on owner_transfers (person_id) where result = 'pending';
alter table owner_transfers enable row level security;
-- 見られるのは 支援リーダー以上（知らせる相手、6.9）と、かかわっている本人だけ。書き込みは下の関数からだけ
create policy transfers_select on owner_transfers for select
  using (role_at_least(person_id, 'leader')
         or (my_role(person_id) is not null and auth.uid() in (requested_by, from_user, to_user)));
create trigger transfers_sync before insert or update on owner_transfers for each row execute function sync_guard();
create trigger transfers_audit after insert or update on owner_transfers for each row execute function audit_row();

-- ---------- メンバーの決まり（0008 の作り直し） ----------
-- 管理者の役割を変える・だれかを管理者にするのは、引き継ぎの関数の中（app.owner_transfer = on）だけ。
-- この印は関数の中でだけ付けて外す。画面（PostgREST）からは付けられず、付けても authenticated のままでは効かない。
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
  return new;
end $$;

-- 新しい管理者になれる人か（承認済み・停止されていない・外されていない。副管理者申請は副管理者、指名は副管理者か「家族」の印）
create function transfer_target_ok(p_person uuid, p_user uuid, p_method text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where person_id = p_person and user_id = p_user and role <> 'admin'
      and approved_at is not null and suspended_at is null and deleted_at is null
      and (role = 'subadmin' or (p_method = 'nominate' and family_mark)));
$$;

-- 入れかえる。元の管理者を先に下ろしてから新しい管理者を上げる（管理者が2人になる瞬間を作らない）
create function owner_transfer_swap(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t owner_transfers;
  others int;
begin
  select * into t from owner_transfers where id = p_id for update;
  if not transfer_target_ok(t.person_id, t.to_user, t.method) then
    raise exception '引き継ぐ人が、いまは管理者になれません（停止中・外れた・役割が変わったなど）';
  end if;
  if not exists (select 1 from team_members where person_id = t.person_id and user_id = t.from_user and role = 'admin' and deleted_at is null) then
    raise exception '元の管理者が変わっています';
  end if;
  select count(*) into others from team_members
    where person_id = t.person_id and role = 'subadmin' and deleted_at is null and user_id <> t.to_user;
  perform set_config('app.owner_transfer', 'on', true);
  update team_members
    set role = case when others = 0 then 'subadmin' else 'leader' end::member_role,
        updated_at = greatest(now(), updated_at + interval '1 millisecond')
    where person_id = t.person_id and user_id = t.from_user and role = 'admin';
  update team_members
    set role = 'admin', updated_at = greatest(now(), updated_at + interval '1 millisecond')
    where person_id = t.person_id and user_id = t.to_user;
  perform set_config('app.owner_transfer', 'off', true);
  update owner_transfers
    set result = 'completed', decided_at = now(), decided_by = auth.uid(), updated_at = greatest(now(), updated_at + interval '1 millisecond')
    where id = p_id;
end $$;

-- 管理者が、引き継ぐ人を指名する
create function nominate_admin(p_person uuid, p_to_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tid uuid := gen_random_uuid();
begin
  if uid is null then raise exception 'ログインが必要です'; end if;
  if my_role(p_person) is distinct from 'admin' then raise exception '引き継ぐ人を指名できるのは管理者だけです'; end if;
  if p_to_user = uid or not transfer_target_ok(p_person, p_to_user, 'nominate') then
    raise exception '指名できるのは、副管理者か「家族」の印がある人です';
  end if;
  if exists (select 1 from owner_transfers where person_id = p_person and result = 'pending') then
    raise exception 'すでに進んでいる引き継ぎがあります';
  end if;
  insert into owner_transfers (id, person_id, method, requested_by, from_user, to_user)
    values (tid, p_person, 'nominate', uid, uid, p_to_user);
  return tid;
end $$;

-- 管理者が操作できないとき、副管理者が申し込む。14日たてば管理者になれる
create function request_admin(p_person uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tid uuid := gen_random_uuid();
  admin_user uuid;
begin
  if uid is null then raise exception 'ログインが必要です'; end if;
  if my_role(p_person) is distinct from 'subadmin' then raise exception '申し込めるのは副管理者だけです'; end if;
  select user_id into admin_user from team_members where person_id = p_person and role = 'admin' and deleted_at is null;
  if admin_user is null then raise exception '管理者が見つかりません'; end if;
  if exists (select 1 from owner_transfers where person_id = p_person and result = 'pending') then
    raise exception 'すでに進んでいる引き継ぎがあります';
  end if;
  insert into owner_transfers (id, person_id, method, requested_by, from_user, to_user, due_at)
    values (tid, p_person, 'subadmin_request', uid, admin_user, uid, now() + interval '14 days');
  return tid;
end $$;

-- 返事をする。
-- 指名: 指名された人が 受ける（入れかわる）/ 断る。管理者は取り下げられる。
-- 副管理者申請: 管理者が 受ける（入れかわる）/ 断る（期限の前だけ）。申し込んだ副管理者は取り下げられる。
create function answer_owner_transfer(p_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t owner_transfers;
  res text;
begin
  if uid is null then raise exception 'ログインが必要です'; end if;
  select * into t from owner_transfers where id = p_id for update;
  if not found or my_role(t.person_id) is null then raise exception '引き継ぎが見つかりません'; end if;
  if t.result <> 'pending' then raise exception 'この引き継ぎはもう終わっています'; end if;
  if t.method = 'nominate' and uid = t.to_user then
    if p_accept then perform owner_transfer_swap(p_id); return 'completed'; end if;
    res := 'declined';
  elsif t.method = 'nominate' and uid = t.from_user and not p_accept then
    res := 'cancelled';
  elsif t.method = 'subadmin_request' and uid = t.from_user and my_role(t.person_id) = 'admin' then
    if p_accept then perform owner_transfer_swap(p_id); return 'completed'; end if;
    if now() >= t.due_at then raise exception '期限を過ぎたので、もう断れません'; end if;
    res := 'rejected';
  elsif t.method = 'subadmin_request' and uid = t.to_user and not p_accept then
    res := 'cancelled';
  else
    raise exception 'この引き継ぎに返事はできません';
  end if;
  update owner_transfers
    set result = res, decided_at = now(), decided_by = uid, updated_at = greatest(now(), updated_at + interval '1 millisecond')
    where id = p_id;
  return res;
end $$;

-- 副管理者申請で、14日たっても管理者が断らなかったとき、申し込んだ副管理者が管理者になる
create function finish_admin_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t owner_transfers;
begin
  if uid is null then raise exception 'ログインが必要です'; end if;
  select * into t from owner_transfers where id = p_id for update;
  if not found or t.method <> 'subadmin_request' or t.to_user <> uid or my_role(t.person_id) is distinct from 'subadmin' then
    raise exception 'この引き継ぎは進められません';
  end if;
  if t.result <> 'pending' then raise exception 'この引き継ぎはもう終わっています'; end if;
  if now() < t.due_at then raise exception '期限（申し込みから14日）までは、管理者の返事を待ちます'; end if;
  perform owner_transfer_swap(p_id);
end $$;

-- ---------- 権限（読むだけ。書き込みは関数から） ----------
revoke all on owner_transfers from anon, authenticated;
grant select on owner_transfers to authenticated;
revoke execute on function transfer_target_ok(uuid, uuid, text), owner_transfer_swap(uuid) from public, anon, authenticated;
revoke execute on function nominate_admin(uuid, uuid), request_admin(uuid), answer_owner_transfer(uuid, boolean), finish_admin_request(uuid) from public, anon;
grant execute on function nominate_admin(uuid, uuid), request_admin(uuid), answer_owner_transfer(uuid, boolean), finish_admin_request(uuid) to authenticated;
