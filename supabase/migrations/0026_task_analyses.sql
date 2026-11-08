-- 手順（課題分析・支援手順書）と、手順のチェック（データシート）（6.15、決定123〜130）
-- 使い方: 0025 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。
-- ・手順を作る・直す・チェックするのは支援者以上（決定127）。閲覧者は見るだけ。
-- ・手順を付けられるのは、望ましい行動と代替行動だけ（問題行動には付けない。決定123）。
-- ・行動・手順は同じチームのものだけを指せる（ほかのチームの行動に付けられない）。
-- ・消すのは論理削除（deleted_at）。消す権限（delete）は付けない。書き込みは監査ログに残る（0010 と同じ）。
-- ・端末の中では本文を暗号化しているが、サーバーへは同期のときに戻した形で送る（ほかの表と同じ）。

-- ---------- 手順（行動ごとに1つ。id は行動から決まる） ----------
create table task_analyses (
  id uuid primary key,
  person_id uuid not null references persons(id),
  behavior_id uuid not null references behaviors(id),
  version int not null default 1 check (version >= 1),
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 2 and 9),
  chain text not null default 'total' check (chain in ('total', 'forward', 'backward')),
  mastery_pct int not null default 100 check (mastery_pct between 50 and 100),
  mastery_runs int not null default 3 check (mastery_runs between 1 and 10),
  note text not null default '' check (char_length(note) <= 2000),
  created_by uuid not null references auth.users(id),  -- 最後に直した人
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
create unique index task_analyses_one_per_behavior on task_analyses (behavior_id);
alter table task_analyses enable row level security;
create policy task_analyses_select on task_analyses for select using (my_role(person_id) is not null);
-- 作る・直すのは支援者以上。保存した人は自分（最後に直した人を残すため、直すたびに自分になる）
create policy task_analyses_insert on task_analyses for insert
  with check (
    role_at_least(person_id, 'supporter') and created_by = auth.uid()
    and exists (select 1 from behaviors b where b.id = behavior_id and b.person_id = task_analyses.person_id and b.kind <> 'problem')
  );
create policy task_analyses_update on task_analyses for update
  using (role_at_least(person_id, 'supporter'))
  with check (
    role_at_least(person_id, 'supporter') and created_by = auth.uid()
    and exists (select 1 from behaviors b where b.id = behavior_id and b.person_id = task_analyses.person_id)
  );
-- （直すときは行動の種類を見ない。あとで行動が問題行動に変わっても、手順をやめる操作は送れるように）
-- created_by は「最後に直した人」なので変えてよい（上の決まりで、自分しか入れられない）
create trigger task_analyses_sync before insert or update on task_analyses for each row execute function sync_guard('created_by');
create trigger task_analyses_audit after insert or update on task_analyses for each row execute function audit_row();

-- ---------- 手順のチェック（1回の機会で1件。+1 は作らない。決定124） ----------
create table step_checks (
  id uuid primary key,
  person_id uuid not null references persons(id),
  behavior_id uuid not null references behaviors(id),
  task_id uuid not null references task_analyses(id),
  version int not null check (version >= 1),
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 9),
  results jsonb not null default '[]' check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) between 1 and 9),
  stopped boolean not null default false,
  occurred_at timestamptz not null,
  local_date date not null,
  place_name text check (char_length(place_name) <= 100),  -- 場所の名前だけ（緯度経度は持たない。決定42）
  activity text check (char_length(activity) <= 100),
  note text not null default '' check (char_length(note) <= 2000),
  recorder_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
create index step_checks_behavior on step_checks (person_id, behavior_id, local_date);
alter table step_checks enable row level security;
create policy step_checks_select on step_checks for select using (my_role(person_id) is not null);
-- 記録できるのは支援者以上で、記録者は自分だけ。直す・取り消すのは記録した本人と、支援リーダー以上（6.3.5 と同じ）
create policy step_checks_insert on step_checks for insert
  with check (
    role_at_least(person_id, 'supporter') and recorder_id = auth.uid()
    and exists (select 1 from task_analyses t where t.id = task_id and t.person_id = step_checks.person_id and t.behavior_id = step_checks.behavior_id)
  );
create policy step_checks_update on step_checks for update
  using ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'))
  with check (
    ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'))
    and exists (select 1 from task_analyses t where t.id = task_id and t.person_id = step_checks.person_id and t.behavior_id = step_checks.behavior_id)
  );
create trigger step_checks_sync before insert or update on step_checks for each row execute function sync_guard();
create trigger step_checks_audit after insert or update on step_checks for each row execute function audit_row();

-- ---------- 権限（ログインした人だけ。消す権限は付けない） ----------
revoke all on task_analyses, step_checks from anon, authenticated;
grant select, insert, update on task_analyses, step_checks to authenticated;

-- ---------- チームの削除（0023）で、この2つの表も消す（関数を作り直す。ほかは 0023 と同じ） ----------
create or replace function purge_team(p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  req timestamptz;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  if my_role(p_person) is null then raise exception 'このチームのメンバーではありません'; end if;
  select delete_requested_at into req from team_settings where person_id = p_person;
  if req is null then raise exception 'このチームは削除を申し込んでいません'; end if;
  if req + interval '30 days' > now() then
    raise exception 'チームを消せるのは、削除の申し込みから30日たってからです（% から）', req + interval '30 days';
  end if;

  insert into audit_logs (id, person_id, entity, entity_id, action, actor_id, after)
    values (gen_random_uuid(), p_person, 'person', p_person, 'delete', uid,
            jsonb_build_object('purged', true, 'requestedAt', req));

  -- 対象者の行は残し、名前などを消す（deleted_at は管理者しか変えられない［0001 の persons_rules］ので、そのまま。
  -- メンバーがいなくなるので、誰にも見えない）
  update persons set display_name = '（削除したチーム）', birth_month = null, notes = '', belongs = '', cautions = '',
         updated_at = greatest(now(), updated_at + interval '1 millisecond')
    where id = p_person;

  -- 消す（ほかの表が指している表は後に）
  delete from abc_details where person_id = p_person;
  delete from step_checks where person_id = p_person;
  delete from task_analyses where person_id = p_person;
  delete from ai_suggestions where person_id = p_person;
  delete from ai_analyses where person_id = p_person;
  delete from observations where person_id = p_person;
  delete from behavior_revisions where person_id = p_person;
  delete from proposals where person_id = p_person;
  delete from events where person_id = p_person;
  delete from not_observed_days where person_id = p_person;
  delete from sleep_logs where person_id = p_person;
  delete from choice_options where person_id = p_person;
  delete from plan_signoffs where person_id = p_person;
  delete from plan_changes where person_id = p_person;
  delete from support_plans where person_id = p_person;
  delete from meeting_notes where person_id = p_person;
  delete from comments where person_id = p_person;
  delete from reinforcer_photos where person_id = p_person;
  delete from reinforcers where person_id = p_person;
  delete from places where person_id = p_person;
  delete from user_schedules where person_id = p_person;
  delete from consents where person_id = p_person;
  delete from invites where person_id = p_person;
  delete from owner_transfers where person_id = p_person;
  delete from team_settings where person_id = p_person;
  delete from view_days where person_id = p_person;
  delete from behaviors where person_id = p_person;
  delete from team_members where person_id = p_person;
end $$;

revoke execute on function purge_team(uuid) from public, anon;
grant execute on function purge_team(uuid) to authenticated;
