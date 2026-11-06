-- アプリ全体の AI の回数の上限（14.2 #36 (2)）。月80ドルまでを、1回 約0.05ドルとして 月1600回で数える。
-- すべてのチームの分を合わせて、日本時間の月で区切る。超えたら翌月まで、どのチームも AI を使えない。
-- Anthropic の Console にも利用額の上限を設定しておく（こちらは実際の金額で止まる）。
-- 使い方: 0010 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

create index ai_runs_at on ai_runs (created_at);

create or replace function take_ai_run(p_person uuid, p_kind text) returns json
language plpgsql security definer set search_path = public as $$
declare
  r member_role := my_role(p_person);
  day_from timestamptz := date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
  month_from timestamptz := date_trunc('month', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
  is_lead boolean := r in ('admin', 'subadmin', 'leader');
  user_day int; user_month int; team_day int; team_month int; app_month int;
begin
  if auth.uid() is null or r is null then return json_build_object('ok', false, 'reason', 'not_member'); end if;
  if r = 'viewer' then return json_build_object('ok', false, 'reason', 'viewer'); end if;
  if p_kind is null or p_kind not in ('analyze', 'suggest', 'summarize') then return json_build_object('ok', false, 'reason', 'bad_kind'); end if;
  if not coalesce((select ai_enabled from team_settings where id = p_person), false) then
    return json_build_object('ok', false, 'reason', 'ai_off');
  end if;

  -- 同時に押されても上限を超えないように、アプリ全体・本人・チームの順で待ち合わせる
  perform pg_advisory_xact_lock(hashtext('ai_runs:app'));
  perform pg_advisory_xact_lock(hashtext('ai_runs:user:' || auth.uid()::text));
  perform pg_advisory_xact_lock(hashtext('ai_runs:team:' || p_person::text));

  select count(*) filter (where created_at >= day_from), count(*) into user_day, user_month
    from ai_runs where user_id = auth.uid() and created_at >= month_from;
  select count(*) filter (where created_at >= day_from), count(*) into team_day, team_month
    from ai_runs where person_id = p_person and created_at >= month_from;

  select count(*) into app_month from ai_runs where created_at >= month_from;
  if app_month >= 1600 then return json_build_object('ok', false, 'reason', 'app_month'); end if;
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
