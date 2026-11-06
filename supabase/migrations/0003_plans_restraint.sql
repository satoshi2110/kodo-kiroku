-- 支援計画・変更の履歴・合意（6.7）と身体拘束の記録（6.8）
-- 使い方: 0002 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- ---------- 共通の決まり: あとから変えられない列を足す ----------
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
    foreach k in array array['person_id', 'user_id', 'recorder_id', 'event_id', 'created_by', 'plan_id', 'saved_by', 'change_id', 'member_id'] loop
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

-- ---------- 支援計画（6.7）。対象者ごとに1つを上書きで保存する（決定67） ----------
create table support_plans (
  id uuid primary key,
  person_id uuid not null references persons(id),
  content jsonb not null,
  active_content jsonb,
  active_since date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
create unique index one_plan_per_person on support_plans (person_id) where deleted_at is null;

alter table support_plans enable row level security;
create policy plans_select on support_plans for select using (my_role(person_id) is not null);
-- 編集は 管理者・副管理者・支援リーダー（6.9）
create policy plans_insert on support_plans for insert with check (role_at_least(person_id, 'leader'));
create policy plans_update on support_plans for update
  using (role_at_least(person_id, 'leader')) with check (role_at_least(person_id, 'leader'));

-- 「実施中の内容」を変えられるのは管理者の合意だけ（決定68、試作では管理者のみ）。
-- ほかの人の保存では、実施中の内容はサーバーの値のまま残す（古い端末の内容で戻さない）
create function plan_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if my_role(new.person_id) is distinct from 'admin' then
    if tg_op = 'INSERT' then
      new.active_content := null;
      new.active_since := null;
    else
      new.active_content := old.active_content;
      new.active_since := old.active_since;
    end if;
  end if;
  return new;
end $$;
create trigger plans_sync before insert or update on support_plans for each row execute function sync_guard();
create trigger plans_rules before insert or update on support_plans for each row execute function plan_guard();

-- ---------- 計画の変更の履歴（決定67・68・69）。中身は誰も書きかえられず、状態だけが進む ----------
create table plan_changes (
  id uuid primary key,
  person_id uuid not null references persons(id),
  plan_id uuid not null references support_plans(id),
  saved_by uuid not null references auth.users(id),
  reason text not null,
  before jsonb,
  after jsonb not null,
  fields text[] not null,
  signer_member_ids uuid[] not null,
  status text not null check (status in ('pending', 'active', 'past', 'withdrawn', 'superseded')),
  active_since date,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz check (deleted_at is null),
  server_at timestamptz not null default clock_timestamp()
);

alter table plan_changes enable row level security;
create policy changes_select on plan_changes for select using (my_role(person_id) is not null);
-- 保存できるのは支援リーダー以上で、保存した人は自分。実施中・過去として送れるのは管理者だけ
create policy changes_insert on plan_changes for insert
  with check (
    role_at_least(person_id, 'leader') and saved_by = auth.uid()
    and (status not in ('active', 'past') or my_role(person_id) = 'admin')
  );
create policy changes_update on plan_changes for update
  using (role_at_least(person_id, 'leader')) with check (role_at_least(person_id, 'leader'));

-- 状態の進み方:
--   合意待ち → 実施中（管理者の合意）／取り下げ（保存した人か管理者・副管理者）／置きかわった（次の変更の保存）
--   実施中 → 過去（管理者が次の変更に合意したとき）
-- それ以外の変更や、中身の書きかえは受け付けない（端末は次の同期でサーバーの内容に戻る）
create function plan_change_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  r member_role := my_role(new.person_id);
begin
  if new.reason is distinct from old.reason or new.before is distinct from old.before
     or new.after is distinct from old.after or new.fields is distinct from old.fields
     or new.signer_member_ids is distinct from old.signer_member_ids then
    return null;
  end if;
  if new.status = old.status then
    if new.active_since is distinct from old.active_since or new.closed_by is distinct from old.closed_by then
      return null;
    end if;
    return new;
  end if;
  if old.status = 'pending' and new.status = 'active' and r = 'admin' then return new; end if;
  if old.status = 'active' and new.status = 'past' and r = 'admin' then return new; end if;
  if old.status = 'pending' and new.status = 'withdrawn'
     and (old.saved_by = auth.uid() or r in ('admin', 'subadmin')) then return new; end if;
  if old.status = 'pending' and new.status = 'superseded' then return new; end if;
  return null;
end $$;
create trigger changes_sync before insert or update on plan_changes for each row execute function sync_guard();
create trigger changes_rules before update on plan_changes for each row execute function plan_change_guard();

-- ---------- 合意（決定69）。頼まれた本人だけが、自分の返事を書ける ----------
create table plan_signoffs (
  id uuid primary key,
  person_id uuid not null references persons(id),
  change_id uuid not null references plan_changes(id),
  member_id uuid not null references team_members(id),
  state text not null check (state in ('agreed', 'opinion')),
  opinion text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
create unique index one_signoff_per_member on plan_signoffs (change_id, member_id) where deleted_at is null;

-- 自分のメンバーの行で、閲覧者ではなく、その変更の合意者に入っているか
create function can_signoff(p uuid, c uuid, m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members tm join plan_changes pc on pc.id = c and pc.person_id = p
    where tm.id = m and tm.person_id = p and tm.user_id = auth.uid()
      and tm.approved_at is not null and tm.suspended_at is null and tm.deleted_at is null
      and tm.role <> 'viewer' and m = any(pc.signer_member_ids)
  )
$$;

alter table plan_signoffs enable row level security;
create policy signoffs_select on plan_signoffs for select using (my_role(person_id) is not null);
create policy signoffs_insert on plan_signoffs for insert with check (can_signoff(person_id, change_id, member_id));
create policy signoffs_update on plan_signoffs for update
  using (can_signoff(person_id, change_id, member_id)) with check (can_signoff(person_id, change_id, member_id));
create trigger signoffs_sync before insert or update on plan_signoffs for each row execute function sync_guard();

-- ---------- 身体拘束の記録（6.8）。取り消し・削除はできない ----------
create table restraint_logs (
  id uuid primary key,
  person_id uuid not null references persons(id),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  local_date date not null,
  place_name text,
  activity text not null default '',
  situation text not null default '',
  checks jsonb not null,
  urgency text not null default '',
  non_alternative text not null default '',
  temporary text not null default '',
  performer text not null default '',
  decider text not null default '',
  method text not null default '',
  person_state text not null default '',
  family_reported boolean not null default false,
  family_report_note text not null default '',
  review text not null default '',
  recorder_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz check (deleted_at is null),
  server_at timestamptz not null default clock_timestamp()
);

alter table restraint_logs enable row level security;
create policy restraint_select on restraint_logs for select using (my_role(person_id) is not null);
-- 入力は支援者以上。修正は記録した人と、管理者・副管理者・支援リーダー（6.8）
create policy restraint_insert on restraint_logs for insert
  with check (role_at_least(person_id, 'supporter') and recorder_id = auth.uid());
create policy restraint_update on restraint_logs for update
  using ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'))
  with check ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'));
create trigger restraint_sync before insert or update on restraint_logs for each row execute function sync_guard();

-- ---------- 権限（ログインした人だけ。消す権限は付けない） ----------
revoke all on support_plans, plan_changes, plan_signoffs, restraint_logs from anon, authenticated;
revoke execute on function can_signoff(uuid, uuid, uuid) from public, anon, authenticated;
grant select, insert, update on support_plans, plan_changes, plan_signoffs, restraint_logs to authenticated;
grant execute on function can_signoff(uuid, uuid, uuid) to authenticated;
