-- AI を使った回数（決定60・63・84）。AI のサーバーの処理（functions/api/ai.ts）が、ログインした本人の資格で take_ai_run を呼び、
-- チームの一員か・AI「あり」か・回数が残っているかを確かめてから1回と数える。数えるのはボタン1回ごと（14.2 #39）。
-- 使い方: 0008 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

create table ai_runs (
  id bigint generated always as identity primary key,
  person_id uuid not null references persons(id),
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('analyze', 'suggest', 'summarize')),
  created_at timestamptz not null default now()
);
create index ai_runs_person on ai_runs (person_id, created_at);
create index ai_runs_user on ai_runs (user_id, created_at);
alter table ai_runs enable row level security;
-- チームの全員が見られる（残り回数の表示に使う）。書くのは take_ai_run だけで、直接の書き込み・変更・削除はだれにもできない
create policy ai_runs_select on ai_runs for select using (my_role(person_id) is not null);

-- 1回分を数える。使えないときは数えずに理由を返す。
-- 上限: 管理者・副管理者・支援リーダーは1人 1日10回・月100回、支援者は1人 1日3回・月30回（決定63）。閲覧者は使えない。
--       チームは 1日30回・月300回（決定60）。1人の回数は、その人がいるすべてのチームの分を合わせて数える（画面の数え方と同じ）。
--       日と月は日本時間で区切る。
create function take_ai_run(p_person uuid, p_kind text) returns json
language plpgsql security definer set search_path = public as $$
declare
  r member_role := my_role(p_person);
  day_from timestamptz := date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
  month_from timestamptz := date_trunc('month', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
  is_lead boolean := r in ('admin', 'subadmin', 'leader');
  user_day int; user_month int; team_day int; team_month int;
begin
  if auth.uid() is null or r is null then return json_build_object('ok', false, 'reason', 'not_member'); end if;
  if r = 'viewer' then return json_build_object('ok', false, 'reason', 'viewer'); end if;
  if p_kind is null or p_kind not in ('analyze', 'suggest', 'summarize') then return json_build_object('ok', false, 'reason', 'bad_kind'); end if;
  if not coalesce((select ai_enabled from team_settings where id = p_person), false) then
    return json_build_object('ok', false, 'reason', 'ai_off');
  end if;

  -- 同時に押されても上限を超えないように、本人とチームの順で待ち合わせる
  perform pg_advisory_xact_lock(hashtext('ai_runs:user:' || auth.uid()::text));
  perform pg_advisory_xact_lock(hashtext('ai_runs:team:' || p_person::text));

  select count(*) filter (where created_at >= day_from), count(*) into user_day, user_month
    from ai_runs where user_id = auth.uid() and created_at >= month_from;
  select count(*) filter (where created_at >= day_from), count(*) into team_day, team_month
    from ai_runs where person_id = p_person and created_at >= month_from;

  if team_month >= 300 then return json_build_object('ok', false, 'reason', 'team_month'); end if;
  if team_day >= 30 then return json_build_object('ok', false, 'reason', 'team_day'); end if;
  if user_month >= (case when is_lead then 100 else 30 end) then return json_build_object('ok', false, 'reason', 'user_month'); end if;
  if user_day >= (case when is_lead then 10 else 3 end) then return json_build_object('ok', false, 'reason', 'user_day'); end if;

  insert into ai_runs (person_id, user_id, kind) values (p_person, auth.uid(), p_kind);
  return json_build_object('ok', true,
    'day_left', (case when is_lead then 10 else 3 end) - user_day - 1,
    'month_left', (case when is_lead then 100 else 30 end) - user_month - 1,
    'team_day_left', 30 - team_day - 1,
    'team_month_left', 300 - team_month - 1);
end $$;

-- ---------- 権限（ログインした人だけ。表は見るだけ、数えるのは関数から） ----------
revoke all on ai_runs from anon, authenticated;
grant select on ai_runs to authenticated;
revoke all on function take_ai_run(uuid, text) from public, anon;
grant execute on function take_ai_run(uuid, text) to authenticated;
