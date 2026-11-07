-- チームの分離のテスト（7.4.3a、決定45）
-- 使い方: supabase/migrations の SQL（0001〜0020）をすべて順に適用したあと、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。
-- 結果: 最後に「すべて合格」と出れば合格。どこかで止まったら、エラーの文（「NG: …」）が不合格の項目。
-- テスト用の人・チームは最後の rollback で消えるので、本番のデータには何も残らない。

begin;

-- ---------- テスト用の人とチーム（管理者として作る。RLS はかからない） ----------
-- A: チーム1 の管理者 / B: チーム2 の管理者 / L: チーム1 の支援リーダー / V: チーム1 の閲覧者
-- D: チーム1 の副管理者 / P: チーム1 の承認待ち / S: チーム1 の停止中 / J: これから招待で参加する人 / N: どこにも入っていない人
-- アカウントはコードがないと作れない（0014）。テスト用の人は、この開始コードで作る（コードは確かめるだけで使われない）
insert into start_codes (code) values ('RLSSIGNUP01');
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-a@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rls-b@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'rls-l@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'rls-v@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'rls-p@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'rls-s@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'rls-d@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'rls-j@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'rls-n@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}');

insert into persons (id, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'テスト1'),
  ('10000000-0000-0000-0000-000000000002', 'テスト2');

insert into team_members (id, person_id, user_id, display_name, affiliation, role, approved_at, suspended_at) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'A', 'family', 'admin', now(), null),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'B', 'family', 'admin', now(), null),
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'L', 'facility', 'leader', now(), null),
  ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'V', 'school', 'viewer', now(), null),
  ('20000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'D', 'facility', 'subadmin', now(), null),
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'P', 'school', 'supporter', null, null),
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'S', 'facility', 'supporter', now(), now());

insert into behaviors (id, person_id, kind, name, method) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'problem', '行動1', 'frequency'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'problem', '行動2', 'frequency');

insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id, updated_at) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', now(), current_date, '00000000-0000-0000-0000-0000000000b1', now());

insert into choice_options (id, person_id, kind, name) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'antecedent', '選択肢1'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'antecedent', '選択肢2');

insert into abc_details (id, person_id, event_id, antecedent_ids, recorder_id, updated_at) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '{50000000-0000-0000-0000-000000000001}', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '{50000000-0000-0000-0000-000000000002}', '00000000-0000-0000-0000-0000000000b1', now());

insert into sleep_logs (id, person_id, wake_date, bed_time, wake_time, recorder_id, updated_at) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', current_date, '21:30', '06:30', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', current_date, '22:00', '07:00', '00000000-0000-0000-0000-0000000000b1', now());

insert into not_observed_days (id, person_id, behavior_id, local_date, recorder_id) values
  ('71000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', current_date - 1, '00000000-0000-0000-0000-0000000000a1'),
  ('71000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', current_date - 1, '00000000-0000-0000-0000-0000000000b1');

insert into places (id, person_id, name, kind, lat, lng, created_by, updated_at) values
  ('72000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '場所1', 'home', 35.0, 139.0, '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'),
  ('72000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '場所2', 'home', 36.0, 140.0, '00000000-0000-0000-0000-0000000000b1', now());

-- 計画・変更・合意・拘束記録（6.7、6.8）
insert into support_plans (id, person_id, content, updated_at) values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{"goal":"目標1"}', now() - interval '1 hour'),
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '{"goal":"目標2"}', now());

-- 81…01: L が保存した合意待ち（合意者 A・L・V）/ 81…03: A が保存した合意待ち / 81…02: チーム2
insert into plan_changes (id, person_id, plan_id, saved_by, reason, after, fields, signer_member_ids, status, updated_at) values
  ('81000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '理由1', '{"goal":"目標1"}', '{goal}',
     '{20000000-0000-0000-0000-0000000000a1,20000000-0000-0000-0000-0000000000c1,20000000-0000-0000-0000-0000000000d1}', 'pending', now() - interval '1 hour'),
  ('81000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '理由3', '{"goal":"目標3"}', '{goal}',
     '{20000000-0000-0000-0000-0000000000a1}', 'pending', now() - interval '1 hour'),
  ('81000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', '理由2', '{"goal":"目標2"}', '{goal}',
     '{20000000-0000-0000-0000-0000000000b1}', 'pending', now());

insert into plan_signoffs (id, person_id, change_id, member_id, state) values
  ('82000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000b1', 'agreed');

insert into restraint_logs (id, person_id, started_at, ended_at, local_date, checks, recorder_id, updated_at) values
  ('83000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', now(), now(), current_date, '{"urgency":true,"nonAlternative":true,"temporary":true}', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'),
  ('83000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', now(), now(), current_date, '{"urgency":true,"nonAlternative":true,"temporary":true}', '00000000-0000-0000-0000-0000000000b1', now());

-- 支援会議メモ・申し送り・コメント（6.10）
-- 84…01: チーム1 の会議メモ（A が書いた）/ 84…02: チーム2
insert into meeting_notes (id, person_id, held_at, recorder_id, updated_at) values
  ('84000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', now() - interval '1 day', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'),
  ('84000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', now() - interval '1 day', '00000000-0000-0000-0000-0000000000b1', now());
-- 85…01: A の申し送り / 85…03: L の申し送り / 85…02: チーム2
insert into comments (id, person_id, target, text, author_id, updated_at) values
  ('85000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'team', '申し送り1', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'),
  ('85000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'team', '申し送り3', '00000000-0000-0000-0000-0000000000c1', now() - interval '1 hour'),
  ('85000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'team', '申し送り2', '00000000-0000-0000-0000-0000000000b1', now());

-- チームの設定・好きなもの（写真）・インターバル記録（6.3.1、6.14）
insert into team_settings (id, person_id, updated_at) values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', now() - interval '1 hour'),
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', now());
insert into reinforcers (id, person_id, name, category, level, updated_at) values
  ('87000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '好きなもの1', 'thing', 3, now() - interval '1 hour'),
  ('87000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '好きなもの2', 'food', 4, now());
insert into reinforcer_photos (id, person_id, data) values
  ('87000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'data:image/jpeg;base64,/9j/AAAA');
insert into observations (id, person_id, behavior_id, method, interval_sec, started_at, local_date, results, recorder_id, updated_at) values
  ('88000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'interval', 10, now(), current_date, '["yes","no"]', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'),
  ('88000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'interval', 10, now(), current_date, '["no"]', '00000000-0000-0000-0000-0000000000b1', now());
-- わたしのいつもの時間（6.3.3）: A と L はチーム1、B はチーム2
insert into user_schedules (id, person_id, user_id, weekdays, start_time, end_time, updated_at) values
  ('89000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '{1,2,3,4,5}', '09:00', '16:00', now() - interval '1 hour'),
  ('89000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', '{0,6}', '10:00', '18:00', now()),
  ('89000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '{1,3}', '13:00', '17:00', now() - interval '1 hour');

insert into start_codes (code) values ('RLSTESTCODE1');

-- ---------- ログインしていない人（anon）は何もできない ----------
set local role anon;
do $$ begin
  begin
    perform 1 from persons;
    raise exception 'NG: ログインしていない人が対象者の表を読めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform 1 from restraint_logs;
    raise exception 'NG: ログインしていない人が拘束記録の表を読めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform 1 from reinforcer_photos;
    raise exception 'NG: ログインしていない人が好きなものの写真を読めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform 1 from comments;
    raise exception 'NG: ログインしていない人が申し送りの表を読めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform create_team('RLSTESTCODE1', 'x', null, '', '', 'x', 'family', 'v');
    raise exception 'NG: ログインしていない人がチームを作る関数を呼べた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- ---------- A（チーム1 の管理者）から見て、チーム2 は読めない・書けない・消せない ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from persons;
  if n <> 1 then raise exception 'NG: A に見える対象者が % 人（1人のはず）', n; end if;
  select count(*) into n from persons where id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 の対象者を読めた'; end if;
  select count(*) into n from team_members where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 のメンバーを読めた'; end if;
  select count(*) into n from behaviors where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 の行動を読めた'; end if;
  select count(*) into n from events where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 の記録を読めた'; end if;
  select count(*) into n from events where person_id = '10000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'NG: A が自分のチームの記録を読めない'; end if;

  begin
    insert into behaviors (id, person_id, kind, name, method)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', 'problem', 'x', 'frequency');
    raise exception 'NG: A がチーム2 に行動を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', now(), current_date, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 に記録を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000c1');
    raise exception 'NG: A が他人（L）を記録者にして書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  update events set count = 99 where id = '40000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の記録を書きかえた'; end if;

  update persons set display_name = 'x' where id = '10000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の対象者を書きかえた'; end if;

  update team_members set role = 'viewer' where id = '20000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 のメンバーを書きかえた'; end if;

  begin
    update events set person_id = '10000000-0000-0000-0000-000000000002', updated_at = now()
      where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'NG: A が自分の記録をチーム2 に移せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    delete from events where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'NG: 記録を消せた（論理削除のみのはず）';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    delete from audit_logs;
    raise exception 'NG: 監査ログを消せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    insert into audit_logs (id, person_id, entity, entity_id, action, actor_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', 'event', gen_random_uuid(), 'create', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 の監査ログを書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    perform create_invite('10000000-0000-0000-0000-000000000002', 'supporter');
    raise exception 'NG: A がチーム2 の招待コードを作れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    perform 1 from start_codes;
    raise exception 'NG: 開始コードの表を画面側から読めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  -- ABC記録と選択肢（6.3.2）
  select count(*) into n from choice_options where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 のABCの選択肢を読めた'; end if;
  select count(*) into n from abc_details where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 のABC記録を読めた'; end if;
  select count(*) into n from abc_details;
  if n <> 1 then raise exception 'NG: A が自分のチームのABC記録を読めない'; end if;

  begin
    insert into choice_options (id, person_id, kind, name)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', 'antecedent', 'x');
    raise exception 'NG: A がチーム2 にABCの選択肢を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    insert into abc_details (id, person_id, event_id, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 にABC記録を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    insert into abc_details (id, person_id, event_id, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'NG: A が他人（L）を記録者にしてABC記録を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  update abc_details set note = 'x', updated_at = now() where id = '60000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 のABC記録を書きかえた'; end if;

  update choice_options set name = 'x', updated_at = now() where id = '50000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 のABCの選択肢を書きかえた'; end if;

  begin
    update abc_details set person_id = '10000000-0000-0000-0000-000000000002', updated_at = now()
      where id = '60000000-0000-0000-0000-000000000001';
    raise exception 'NG: A が自分のABC記録をチーム2 に移せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    delete from abc_details where id = '60000000-0000-0000-0000-000000000001';
    raise exception 'NG: ABC記録を消せた（論理削除のみのはず）';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  -- 睡眠・観察していなかった日・場所（6.3.3、6.3.4）
  select count(*) into n from sleep_logs where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 の睡眠を読めた'; end if;
  select count(*) into n from not_observed_days where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 の「観察していなかった日」を読めた'; end if;
  select count(*) into n from places where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 の場所を読めた'; end if;
  select count(*) into n from places;
  if n <> 1 then raise exception 'NG: A が自分のチームの場所を読めない'; end if;

  begin
    insert into sleep_logs (id, person_id, wake_date, bed_time, wake_time, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', current_date - 1, '21:00', '06:00', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 に睡眠を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    insert into places (id, person_id, name, kind, created_by)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', 'x', 'other', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 に場所を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    insert into not_observed_days (id, person_id, behavior_id, local_date, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', current_date - 2, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 に「観察していなかった日」を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  update sleep_logs set note = 'x', updated_at = now() where id = '70000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の睡眠を書きかえた'; end if;

  update places set name = 'x', updated_at = now() where id = '72000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の場所を書きかえた'; end if;

  begin
    update places set person_id = '10000000-0000-0000-0000-000000000002', updated_at = now()
      where id = '72000000-0000-0000-0000-000000000001';
    raise exception 'NG: A が自分の場所をチーム2 に移せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    insert into sleep_logs (id, person_id, wake_date, bed_time, wake_time, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', current_date, '20:00', '05:00', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: 同じ日の睡眠が2件入った';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  begin
    delete from places where id = '72000000-0000-0000-0000-000000000001';
    raise exception 'NG: 場所を消せた（非表示のみのはず）';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  update sleep_logs set wakings = 1, updated_at = now() where id = '70000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 管理者が睡眠を直せない'; end if;

  -- 支援計画・合意・拘束記録（6.7、6.8）
  select count(*) into n from support_plans where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 の支援計画を読めた'; end if;
  select count(*) into n from plan_changes where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: A がチーム2 の計画の変更を読めた'; end if;
  select count(*) into n from plan_signoffs;
  if n <> 0 then raise exception 'NG: A がチーム2 の合意を読めた'; end if;
  select count(*) into n from restraint_logs;
  if n <> 1 then raise exception 'NG: A に見える拘束記録が自分のチームの1件ではない'; end if;

  begin
    insert into restraint_logs (id, person_id, started_at, ended_at, local_date, checks, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', now(), now(), current_date, '{}', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 に拘束記録を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into support_plans (id, person_id, content)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', '{}');
    raise exception 'NG: A がチーム2 に支援計画を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update restraint_logs set review = 'x', updated_at = now() where id = '83000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の拘束記録を書きかえた'; end if;
  update plan_changes set status = 'withdrawn', updated_at = now() where id = '81000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の計画の変更を取り下げた'; end if;

  -- 拘束記録は取り消し・削除できない（6.8）
  begin
    delete from restraint_logs where id = '83000000-0000-0000-0000-000000000001';
    raise exception 'NG: 拘束記録を消せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update restraint_logs set deleted_at = now(), updated_at = now() where id = '83000000-0000-0000-0000-000000000001';
    raise exception 'NG: 拘束記録を取り消せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update restraint_logs set recorder_id = '00000000-0000-0000-0000-0000000000c1', updated_at = now() where id = '83000000-0000-0000-0000-000000000001';
    raise exception 'NG: 拘束記録の記録者を変えられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  -- 合意は本人の分だけ（ほかの人の名前では書けない）
  begin
    insert into plan_signoffs (id, person_id, change_id, member_id, state)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000c1', 'agreed');
    raise exception 'NG: A が L の名前で合意できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  insert into plan_signoffs (id, person_id, change_id, member_id, state)
    values ('82000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'agreed');

  -- 変更の中身（履歴）は書きかえられない（決定67）
  update plan_changes set reason = '書きかえ', updated_at = now() where id = '81000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 計画の変更の履歴を書きかえられた'; end if;
  begin
    delete from plan_changes where id = '81000000-0000-0000-0000-000000000001';
    raise exception 'NG: 計画の変更の履歴を消せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  -- 管理者の合意で実施中になる（決定68）。実施中から合意待ちには戻せない
  update plan_changes set status = 'active', active_since = current_date, updated_at = now() where id = '81000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 管理者が変更を実施中にできない'; end if;
  update support_plans set active_content = '{"goal":"目標1"}', active_since = current_date, updated_at = now() where id = '80000000-0000-0000-0000-000000000001';
  select count(*) into n from support_plans where id = '80000000-0000-0000-0000-000000000001' and active_content is not null;
  if n <> 1 then raise exception 'NG: 管理者が実施中の内容を入れられない'; end if;
  update plan_changes set status = 'pending', updated_at = now() + interval '1 second' where id = '81000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 実施中の変更を合意待ちに戻せた'; end if;

  -- 会議メモ・申し送り（6.10）: チーム2 は読めない・書けない
  select count(*) into n from meeting_notes;
  if n <> 1 then raise exception 'NG: A に見える会議メモが自分のチームの1件ではない'; end if;
  select count(*) into n from comments;
  if n <> 2 then raise exception 'NG: A に見える申し送りが自分のチームの2件ではない'; end if;
  begin
    insert into meeting_notes (id, person_id, held_at, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', now(), '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 に会議メモを書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into comments (id, person_id, target, text, author_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', 'team', 'x', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 に申し送りを書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into comments (id, person_id, target, target_id, text, author_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'meeting', '84000000-0000-0000-0000-000000000002', 'x', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 の会議メモにコメントを付けられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update meeting_notes set results = 'x', updated_at = now() where id = '84000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の会議メモを書きかえた'; end if;
  update comments set deleted_at = now(), updated_at = now() where id = '85000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の申し送りを消した'; end if;

  -- 会議メモの日時と、会議の日のグラフは変わらない。ほかの欄は直せる
  update meeting_notes set results = '成果', held_at = now(), charts = '[{"title":"x"}]', updated_at = now() where id = '84000000-0000-0000-0000-000000000001';
  select count(*) into n from meeting_notes where id = '84000000-0000-0000-0000-000000000001' and results = '成果' and held_at = now() - interval '1 day' and charts = '[]';
  if n <> 1 then raise exception 'NG: 会議メモの日時かグラフが変わった（または成果を直せない）'; end if;

  -- 申し送りは、書いた人の名前を変えたり、中身を書きかえたりできない。消せるのは書いた人だけ
  begin
    insert into comments (id, person_id, target, text, author_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'team', 'x', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'NG: A が L の名前で申し送りを書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update comments set text = '書きかえ', updated_at = now() where id = '85000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 申し送りの中身を書きかえられた'; end if;
  update comments set deleted_at = now(), updated_at = now() where id = '85000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 管理者がほかの人の申し送りを消せた'; end if;
  update comments set deleted_at = now(), updated_at = now() where id = '85000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 自分の申し送りを消せない'; end if;
  begin
    delete from comments where id = '85000000-0000-0000-0000-000000000003';
    raise exception 'NG: 申し送りを本当に消せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  insert into comments (id, person_id, target, target_id, text, author_id)
    values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'meeting', '84000000-0000-0000-0000-000000000001', 'コメント', '00000000-0000-0000-0000-0000000000a1');

  -- 設定・好きなもの・写真・インターバル記録: チーム2 は読めない・書けない
  select count(*) into n from team_settings;
  if n <> 1 then raise exception 'NG: A に見えるチームの設定が自分のチームの1件ではない'; end if;
  select count(*) into n from reinforcers;
  if n <> 1 then raise exception 'NG: A に見える好きなものが自分のチームの1件ではない'; end if;
  select count(*) into n from reinforcer_photos;
  if n <> 0 then raise exception 'NG: A にチーム2 の好きなものの写真が見えた'; end if;
  select count(*) into n from observations;
  if n <> 1 then raise exception 'NG: A に見えるインターバル記録が自分のチームの1件ではない'; end if;
  update team_settings set ai_enabled = true, updated_at = now() where id = '10000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の設定を変えた'; end if;
  begin
    insert into reinforcers (id, person_id, name, category, level)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', 'x', 'thing', 1);
    raise exception 'NG: A がチーム2 に好きなものを書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update reinforcers set level = 1, updated_at = now() where id = '87000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の好きなものを書きかえた'; end if;
  update reinforcer_photos set data = '', updated_at = now() where id = '87000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 の写真を消した'; end if;
  begin
    insert into reinforcer_photos (id, person_id, data)
      values ('87000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'data:image/jpeg;base64,/9j/AAAA');
    raise exception 'NG: A がチーム2 の好きなものに写真を付けられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into observations (id, person_id, behavior_id, method, interval_sec, started_at, local_date, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'interval', 10, now(), current_date, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: A がチーム2 にインターバル記録を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update observations set results = '[]', updated_at = now() where id = '88000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 のインターバル記録を書きかえた'; end if;

  -- いつもの時間: 自分のチームの分（A と L）だけ見える。直せるのは自分の分だけ
  select count(*) into n from user_schedules;
  if n <> 2 then raise exception 'NG: A に見えるいつもの時間が自分のチームの2件ではない'; end if;
  begin
    insert into user_schedules (id, person_id, user_id, weekdays, start_time, end_time)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '{1}', '09:00', '10:00');
    raise exception 'NG: A がチーム2 にいつもの時間を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update user_schedules set start_time = '08:00', updated_at = now() where id = '89000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: A がチーム2 のいつもの時間を書きかえた'; end if;
  update user_schedules set start_time = '08:00', updated_at = now() where id = '89000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 管理者が同じチームのほかの人（L）のいつもの時間を書きかえた'; end if;
  begin
    insert into user_schedules (id, person_id, user_id, weekdays, start_time, end_time)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '{1}', '09:00', '10:00');
    raise exception 'NG: A がほかの人（L）の名前でいつもの時間を作れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into user_schedules (id, person_id, user_id, weekdays, start_time, end_time)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '{1}', '16:00', '09:00');
    raise exception 'NG: おわりがはじめより前のいつもの時間を保存できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update user_schedules set end_time = '17:00', updated_at = now() where id = '89000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 自分のいつもの時間を直せない'; end if;
  begin
    delete from user_schedules where id = '89000000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NG: いつもの時間を本当に消せた（論理削除だけのはず）'; end if;
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;

  -- 写真は JPEG の文字だけ。それ以外の形は受け付けない
  begin
    insert into reinforcer_photos (id, person_id, data)
      values ('87000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'data:image/svg+xml;base64,AAAA');
    raise exception 'NG: JPEG 以外の写真を保存できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  insert into reinforcer_photos (id, person_id, data)
    values ('87000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'data:image/jpeg;base64,/9j/AAAA');

  -- AI を「あり」にするには、管理者自身の同意が要る（7.5、0013）。同意がないと「なし」のまま
  update team_settings set ai_enabled = true, updated_at = now() where id = '10000000-0000-0000-0000-000000000001';
  select count(*) into n from team_settings where id = '10000000-0000-0000-0000-000000000001' and ai_enabled;
  if n <> 0 then raise exception 'NG: 同意がないのに AI を「あり」にできた'; end if;
  insert into consents (id, person_id, user_id, kind, text_version)
    values ('4b000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'ai_overseas', 'test');
  -- AI の あり／なし は管理者が変えられる。変えた人はサーバーが送った人にする
  update team_settings set ai_enabled = true, updated_by = '00000000-0000-0000-0000-0000000000d1', updated_at = now() where id = '10000000-0000-0000-0000-000000000001';
  select count(*) into n from team_settings where id = '10000000-0000-0000-0000-000000000001' and ai_enabled and updated_by = '00000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'NG: 管理者が AI を「あり」にできない（または変えた人が送った人にならない）'; end if;

  -- 古い変更は捨てられる（後から届いた古い記録で上書きしない）
  update events set count = 5, updated_at = now() - interval '2 hours' where id = '40000000-0000-0000-0000-000000000001';
  select count into n from events where id = '40000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'NG: 古い変更で記録が上書きされた'; end if;
end $$;
reset role;

-- ---------- 承認待ち（P）と停止中（S）の人には、チームのデータが見えない ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from persons;
  if n <> 0 then raise exception 'NG: 承認待ちの人に対象者が見えた'; end if;
  select count(*) into n from events;
  if n <> 0 then raise exception 'NG: 承認待ちの人に記録が見えた'; end if;
  select count(*) into n from abc_details;
  if n <> 0 then raise exception 'NG: 承認待ちの人にABC記録が見えた'; end if;
  select count(*) into n from sleep_logs;
  if n <> 0 then raise exception 'NG: 承認待ちの人に睡眠が見えた'; end if;
  select count(*) into n from places;
  if n <> 0 then raise exception 'NG: 承認待ちの人に場所が見えた'; end if;
  select count(*) into n from support_plans;
  if n <> 0 then raise exception 'NG: 承認待ちの人に支援計画が見えた'; end if;
  select count(*) into n from restraint_logs;
  if n <> 0 then raise exception 'NG: 承認待ちの人に拘束記録が見えた'; end if;
  select count(*) into n from meeting_notes;
  if n <> 0 then raise exception 'NG: 承認待ちの人に会議メモが見えた'; end if;
  select count(*) into n from comments;
  if n <> 0 then raise exception 'NG: 承認待ちの人に申し送りが見えた'; end if;
  select count(*) into n from team_settings;
  if n <> 0 then raise exception 'NG: 承認待ちの人にチームの設定が見えた'; end if;
  select count(*) into n from reinforcers;
  if n <> 0 then raise exception 'NG: 承認待ちの人に好きなものが見えた'; end if;
  select count(*) into n from observations;
  if n <> 0 then raise exception 'NG: 承認待ちの人にインターバル記録が見えた'; end if;
  select count(*) into n from user_schedules;
  if n <> 0 then raise exception 'NG: 承認待ちの人にいつもの時間が見えた'; end if;
  select count(*) into n from choice_options;
  if n <> 0 then raise exception 'NG: 承認待ちの人にABCの選択肢が見えた'; end if;
  select count(*) into n from team_members;
  if n <> 1 then raise exception 'NG: 承認待ちの人に、自分以外のメンバーが見えた（または自分が見えない）'; end if;
  begin
    insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000e1');
    raise exception 'NG: 承認待ちの人が記録を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update team_members set approved_at = now(), updated_at = now() where id = '20000000-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 承認待ちの人が自分で承認できた'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from persons;
  if n <> 0 then raise exception 'NG: 停止中の人に対象者が見えた'; end if;
  select count(*) into n from events;
  if n <> 0 then raise exception 'NG: 停止中の人に記録が見えた'; end if;
  select count(*) into n from restraint_logs;
  if n <> 0 then raise exception 'NG: 停止中の人に拘束記録が見えた'; end if;
  select count(*) into n from comments;
  if n <> 0 then raise exception 'NG: 停止中の人に申し送りが見えた'; end if;
  select count(*) into n from reinforcer_photos;
  if n <> 0 then raise exception 'NG: 停止中の人に好きなものの写真が見えた'; end if;
  select count(*) into n from user_schedules;
  if n <> 0 then raise exception 'NG: 停止中の人にいつもの時間が見えた'; end if;
end $$;
reset role;

-- ---------- 閲覧者（V）は見るだけ ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from events;
  if n <> 1 then raise exception 'NG: 閲覧者に自分のチームの記録が見えない'; end if;
  begin
    insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000d1');
    raise exception 'NG: 閲覧者が記録を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  select count(*) into n from abc_details;
  if n <> 1 then raise exception 'NG: 閲覧者に自分のチームのABC記録が見えない'; end if;
  begin
    insert into choice_options (id, person_id, kind, name)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'antecedent', 'x');
    raise exception 'NG: 閲覧者がABCの選択肢を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update abc_details set note = 'x', updated_at = now() where id = '60000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者がABC記録を書きかえた'; end if;
  select count(*) into n from sleep_logs;
  if n <> 1 then raise exception 'NG: 閲覧者に自分のチームの睡眠が見えない'; end if;
  select count(*) into n from restraint_logs;
  if n <> 1 then raise exception 'NG: 閲覧者に自分のチームの拘束記録が見えない'; end if;
  begin
    insert into restraint_logs (id, person_id, started_at, ended_at, local_date, checks, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', now(), now(), current_date, '{}', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'NG: 閲覧者が拘束記録を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update support_plans set content = '{"goal":"x"}', updated_at = now() where id = '80000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が支援計画を書きかえた'; end if;
  -- 閲覧者は合意者に入っていても合意できない（決定69）
  begin
    insert into plan_signoffs (id, person_id, change_id, member_id, state)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000d1', 'agreed');
    raise exception 'NG: 閲覧者が合意できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update sleep_logs set note = 'x', recorder_id = '00000000-0000-0000-0000-0000000000d1', updated_at = now() where id = '70000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が睡眠を書きかえた'; end if;
  begin
    insert into places (id, person_id, name, kind, created_by)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'x', 'other', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'NG: 閲覧者が場所を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  select count(*) into n from meeting_notes;
  if n <> 1 then raise exception 'NG: 閲覧者に自分のチームの会議メモが見えない'; end if;
  update meeting_notes set results = 'x', updated_at = now() + interval '1 second' where id = '84000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が会議メモを書きかえた'; end if;
  begin
    insert into comments (id, person_id, target, text, author_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'team', 'x', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'NG: 閲覧者が申し送りを書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  select count(*) into n from reinforcers;
  if n <> 1 then raise exception 'NG: 閲覧者に自分のチームの好きなものが見えない'; end if;
  begin
    insert into reinforcers (id, person_id, name, category, level)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'x', 'thing', 1);
    raise exception 'NG: 閲覧者が好きなものを書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update reinforcers set level = 1, updated_at = now() + interval '1 second' where id = '87000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が好きなものを書きかえた'; end if;
  update reinforcer_photos set data = '', updated_at = now() + interval '1 second' where id = '87000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が写真を消した'; end if;
  begin
    insert into observations (id, person_id, behavior_id, method, interval_sec, started_at, local_date, recorder_id)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'interval', 10, now(), current_date, '00000000-0000-0000-0000-0000000000d1');
    raise exception 'NG: 閲覧者がインターバル記録を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update team_settings set short_sleep_under_hours = 5, updated_at = now() + interval '1 second' where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者がチームの設定を変えた'; end if;
  update events set count = 7, updated_at = now() where id = '40000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が記録を書きかえた'; end if;
  select count(*) into n from user_schedules;
  if n <> 2 then raise exception 'NG: 閲覧者に自分のチームのいつもの時間が見えない'; end if;
  begin
    insert into user_schedules (id, person_id, user_id, weekdays, start_time, end_time)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '{1}', '09:00', '10:00');
    raise exception 'NG: 閲覧者がいつもの時間を書き込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- ---------- 支援リーダー（L）は、管理者・副管理者にかかわる変更ができない ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare code text; n int;
begin
  begin
    update team_members set role = 'subadmin', updated_at = now() where id = '20000000-0000-0000-0000-0000000000c1';
    raise exception 'NG: 支援リーダーが自分を副管理者にできた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update team_members set suspended_at = now(), updated_at = now() where id = '20000000-0000-0000-0000-0000000000a1';
    raise exception 'NG: 支援リーダーが管理者を停止できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform create_invite('10000000-0000-0000-0000-000000000001', 'subadmin');
    raise exception 'NG: 支援リーダーが副管理者として招待できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update persons set deleted_at = now(), updated_at = now() where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'NG: 支援リーダーがチームの削除を申し込めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  -- 支援リーダーは、ほかの人が書いたABC記録を直せる
  update abc_details set note = 'リーダーが修正', updated_at = now() where id = '60000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーがチームのABC記録を直せない'; end if;
  -- 「家族」の印がない支援リーダーは、睡眠を入力・変更できない（決定37）
  update sleep_logs set note = 'x', recorder_id = '00000000-0000-0000-0000-0000000000c1', updated_at = now() where id = '70000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 家族の印がない支援リーダーが睡眠を書きかえた'; end if;
  -- 場所の追加と、ほかの人が書いた睡眠以外の共有の印は支援者以上ならできる
  insert into places (id, person_id, name, kind, created_by)
    values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'リーダーが追加', 'school', '00000000-0000-0000-0000-0000000000c1');
  update not_observed_days set deleted_at = now(), recorder_id = '00000000-0000-0000-0000-0000000000c1', updated_at = now()
    where id = '71000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが「観察していなかった」を戻せない'; end if;
  -- 支援計画: 支援リーダーは中身を直せるが、実施中の内容は変えられない（決定68）
  update support_plans set content = '{"goal":"リーダーが修正"}', active_content = '{"goal":"勝手に実施"}', updated_at = now() + interval '2 seconds'
    where id = '80000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが支援計画を直せない'; end if;
  select count(*) into n from support_plans where id = '80000000-0000-0000-0000-000000000001' and active_content ->> 'goal' = '目標1' and content ->> 'goal' = 'リーダーが修正';
  if n <> 1 then raise exception 'NG: 支援リーダーが実施中の内容を変えられた'; end if;
  begin
    insert into plan_changes (id, person_id, plan_id, saved_by, reason, after, fields, signer_member_ids, status)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'x', '{}', '{goal}', '{}', 'active');
    raise exception 'NG: 支援リーダーが実施中の変更を作れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into plan_changes (id, person_id, plan_id, saved_by, reason, after, fields, signer_member_ids, status)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'x', '{}', '{goal}', '{}', 'pending');
    raise exception 'NG: 支援リーダーが管理者の名前で変更を保存できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  insert into plan_changes (id, person_id, plan_id, saved_by, reason, after, fields, signer_member_ids, status)
    values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'リーダーの変更', '{}', '{goal}', '{20000000-0000-0000-0000-0000000000a1}', 'pending');
  -- ほかの人（管理者）が保存した合意待ちは、支援リーダーには取り下げられない
  update plan_changes set status = 'withdrawn', closed_by = '00000000-0000-0000-0000-0000000000c1', updated_at = now()
    where id = '81000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 支援リーダーがほかの人の変更を取り下げた'; end if;
  -- 支援リーダーは、合意待ちの変更を実施中にできない（決定68。管理者と副管理者だけ、0015）
  update plan_changes set status = 'active', active_since = current_date, updated_at = now() + interval '1 second'
    where id = '81000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 支援リーダーが変更を実施中にできた'; end if;
  -- 合意者に入っている自分の分は合意できる
  insert into plan_signoffs (id, person_id, change_id, member_id, state, opinion)
    values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000c1', 'opinion', '意見');
  -- 拘束記録: 支援リーダーは、ほかの人が書いた記録を直せる（6.8）
  update restraint_logs set review = '組織で検討した', updated_at = now() where id = '83000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが拘束記録を直せない'; end if;
  -- 会議メモ: 支援リーダーは、ほかの人が書いたメモを直せる（6.10）
  update meeting_notes set decisions = '決めたこと', updated_at = now() + interval '2 seconds' where id = '84000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが会議メモを直せない'; end if;
  -- 設定は副管理者から。支援リーダーは変えられない
  update team_settings set short_sleep_under_hours = 5, updated_at = now() + interval '2 seconds' where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 支援リーダーがチームの設定を変えた'; end if;
  -- 好きなものは支援者以上なら直せる。インターバル記録は、ほかの人が記録したものも直せる
  update reinforcers set level = 5, updated_at = now() + interval '2 seconds' where id = '87000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが好きなものを直せない'; end if;
  update observations set results = '["yes"]', updated_at = now() + interval '2 seconds' where id = '88000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーがインターバル記録を直せない'; end if;
  begin
    update observations set recorder_id = '00000000-0000-0000-0000-0000000000c1', updated_at = now() + interval '3 seconds' where id = '88000000-0000-0000-0000-000000000001';
    raise exception 'NG: インターバル記録の記録者を変えられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  -- いつもの時間: 自分の分は直せる。持ち主は変えられない
  update user_schedules set weekdays = '{1,3,5}', updated_at = now() where id = '89000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが自分のいつもの時間を直せない'; end if;
  begin
    update user_schedules set user_id = '00000000-0000-0000-0000-0000000000a1', updated_at = now() + interval '1 second' where id = '89000000-0000-0000-0000-000000000003';
    raise exception 'NG: いつもの時間の持ち主を変えられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  -- 支援者としての招待はできる。コードは次の J のテストで使う
  code := create_invite('10000000-0000-0000-0000-000000000001', 'supporter');
  perform set_config('rls_test.invite', code, true);
end $$;
reset role;
-- 使える招待コードがあれば、アカウントを作れる（0014）。コードは使われず、次の J のテストでそのまま使える
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a8', 'rls-invited@test.invalid', 'authenticated', 'authenticated',
   jsonb_build_object('invite_code', lower(current_setting('rls_test.invite'))));

-- ---------- 副管理者（D）は設定を変えられるが、AI と チームの削除 は管理者だけ ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update team_settings set short_sleep_under_hours = 6, ai_enabled = false, delete_requested_at = now(), updated_at = now() + interval '5 seconds' where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 副管理者がチームの設定を変えられない'; end if;
  select count(*) into n from team_settings where id = '10000000-0000-0000-0000-000000000001' and short_sleep_under_hours = 6 and ai_enabled and delete_requested_at is null;
  if n <> 1 then raise exception 'NG: 副管理者が AI の あり／なし か チームの削除 を変えられた'; end if;
  select count(*) into n from consents where id = '4b000000-0000-0000-0000-000000000010' and revoked_at is null;
  if n <> 1 then raise exception 'NG: 副管理者の保存で AI の同意が取り消された'; end if;

  -- 副管理者は、管理者の代わりに変更を実施中にできる（決定68、0015）。前の実施中は「過去」になる
  update plan_changes set status = 'past', updated_at = now() + interval '6 seconds' where id = '81000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 副管理者が実施中の変更を過去にできない'; end if;
  update plan_changes set status = 'active', active_since = current_date, closed_by = '00000000-0000-0000-0000-0000000000b2', updated_at = now() + interval '6 seconds'
    where id = '81000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 副管理者が変更を実施中にできない'; end if;
  update support_plans set active_content = '{"goal":"目標3"}', active_since = current_date, updated_at = now() + interval '6 seconds'
    where id = '80000000-0000-0000-0000-000000000001';
  select count(*) into n from support_plans where id = '80000000-0000-0000-0000-000000000001' and active_content ->> 'goal' = '目標3';
  if n <> 1 then raise exception 'NG: 副管理者が実施中の内容を入れられない'; end if;
  -- 端末で保存と同時に実施中にしたものを、まとめて送れる
  insert into plan_changes (id, person_id, plan_id, saved_by, reason, after, fields, signer_member_ids, status, active_since, closed_by)
    values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2',
            '副管理者の変更', '{}', '{goal}', '{20000000-0000-0000-0000-0000000000a1}', 'active', current_date, '00000000-0000-0000-0000-0000000000b2');
  -- 実施中から合意待ちには戻せない。チーム2 の変更は実施中にできない（見えない）
  update plan_changes set status = 'pending', updated_at = now() + interval '7 seconds' where id = '81000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 副管理者が実施中の変更を合意待ちに戻せた'; end if;
  update plan_changes set status = 'active', active_since = current_date, updated_at = now() + interval '6 seconds'
    where id = '81000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 副管理者がチーム2 の変更を実施中にできた'; end if;
end $$;
reset role;

-- ---------- 招待コードで参加した人（J）は、承認されるまで何も見えない ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  perform join_team(current_setting('rls_test.invite'), 'J', 'school', 'v');
  select count(*) into n from persons;
  if n <> 0 then raise exception 'NG: 招待で参加した直後（承認前）に対象者が見えた'; end if;
  begin
    perform join_team(current_setting('rls_test.invite'), 'J', 'school', 'v');
    raise exception 'NG: 使用済みの招待コードがもう一度使えた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- ---------- 役割の変更と停止（7章 #2、0008） ----------
-- 支援リーダー（L）は閲覧者・支援者・支援リーダーの役割を変えられ、停止もできる。自分は停止できない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update team_members set role = 'supporter', updated_at = now() where id = '20000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが閲覧者を支援者にできない'; end if;
  begin
    update team_members set role = 'subadmin', updated_at = now() where id = '20000000-0000-0000-0000-0000000000d1';
    raise exception 'NG: 支援リーダーがほかの人を副管理者にできた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update team_members set suspended_at = now(), updated_at = now() where id = '20000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーがメンバーを停止できない'; end if;
  begin
    update team_members set suspended_at = now(), updated_at = now() where id = '20000000-0000-0000-0000-0000000000c1';
    raise exception 'NG: 支援リーダーが自分を停止できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update team_members set role = 'leader', updated_at = now() where id = '20000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 支援リーダーがチーム2 のメンバーの役割を変えた'; end if;
end $$;
reset role;

-- 停止された V は、その場でチームのものが何も見えず、自分で停止を外せない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from persons;
  if n <> 0 then raise exception 'NG: 停止した直後の人に対象者が見えた'; end if;
  select count(*) into n from events;
  if n <> 0 then raise exception 'NG: 停止した直後の人に記録が見えた'; end if;
  update team_members set suspended_at = null, updated_at = now() where id = '20000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 停止された人が自分で停止を外せた'; end if;
end $$;
reset role;

-- 停止中の S も、自分の停止を外せない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update team_members set suspended_at = null, updated_at = now() where id = '20000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 停止中の人が自分で停止を外せた'; end if;
end $$;
reset role;

-- 管理者（A）も自分は停止できない。停止を外すことはできる
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  begin
    update team_members set suspended_at = now(), updated_at = now() where id = '20000000-0000-0000-0000-0000000000a1';
    raise exception 'NG: 管理者が自分を停止できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update team_members set suspended_at = null, role = 'viewer', updated_at = now() where id = '20000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 管理者が停止を外せない'; end if;
end $$;
reset role;

-- 停止を外された V は、また見られる。閲覧者はメンバーの行を変えられない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from persons;
  if n <> 1 then raise exception 'NG: 停止を外したのに対象者が見えない'; end if;
  update team_members set role = 'leader', updated_at = now() where id = '20000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が自分の役割を変えた'; end if;
  update team_members set suspended_at = now(), updated_at = now() where id = '20000000-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者がほかの人を停止した'; end if;
end $$;
reset role;

-- ---------- AI の回数（決定60・63・84、0009） ----------
-- チーム1 に支援者 X を足す（管理者として作る。RLS はかからない）
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', 'rls-x@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}');
insert into team_members (id, person_id, user_id, display_name, affiliation, role, approved_at) values
  ('20000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'X', 'facility', 'supporter', now());

-- 管理者（A）: AI「なし」のあいだは数えない。「あり」に戻すと使える
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update team_settings set ai_enabled = false, updated_at = now() + interval '10 seconds' where id = '10000000-0000-0000-0000-000000000001';
  -- 「なし」に戻すと、そのチームの AI の同意が取り消される（7.5、0013）
  select count(*) into n from consents where id = '4b000000-0000-0000-0000-000000000010' and revoked_at is not null;
  if n <> 1 then raise exception 'NG: AI を「なし」に戻しても同意が取り消されない'; end if;
  if take_ai_run('10000000-0000-0000-0000-000000000001', 'analyze') ->> 'reason' is distinct from 'ai_off' then
    raise exception 'NG: AI「なし」のチームで AI の回数を使えた';
  end if;
  -- 取り消した同意では「あり」に戻せない。同意を取り直すと戻せる
  update team_settings set ai_enabled = true, updated_at = now() + interval '11 seconds' where id = '10000000-0000-0000-0000-000000000001';
  select count(*) into n from team_settings where id = '10000000-0000-0000-0000-000000000001' and ai_enabled;
  if n <> 0 then raise exception 'NG: 取り消した同意のまま AI を「あり」にできた'; end if;
  insert into consents (id, person_id, user_id, kind, text_version)
    values ('4b000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'ai_overseas', 'test');
  update team_settings set ai_enabled = true, updated_at = now() + interval '12 seconds' where id = '10000000-0000-0000-0000-000000000001';
  if (take_ai_run('10000000-0000-0000-0000-000000000001', 'analyze') ->> 'ok')::boolean is not true then
    raise exception 'NG: AI「あり」のチームの管理者が AI を使えない';
  end if;
  if take_ai_run('10000000-0000-0000-0000-000000000001', 'other') ->> 'reason' is distinct from 'bad_kind' then
    raise exception 'NG: 決まっていない種類で AI の回数を使えた';
  end if;
  -- 自分では書けない（数えるのは関数だけ）
  begin
    insert into ai_runs (person_id, user_id, kind) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'analyze');
    raise exception 'NG: AI の回数の表に直接書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    delete from ai_runs;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NG: AI の回数を消せた'; end if;
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- 支援者（X）: 1日3回まで。チーム2 の分は使えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; r json;
begin
  for i in 1..3 loop
    r := take_ai_run('10000000-0000-0000-0000-000000000001', 'suggest');
    if (r ->> 'ok')::boolean is not true then raise exception 'NG: 支援者が %回目の AI を使えない（%）', i, r; end if;
  end loop;
  if (r ->> 'day_left')::int <> 0 or (r ->> 'team_day_left')::int <> 26 then raise exception 'NG: 残り回数がちがう（%）', r; end if;
  if take_ai_run('10000000-0000-0000-0000-000000000001', 'suggest') ->> 'reason' is distinct from 'user_day' then
    raise exception 'NG: 支援者が1日に4回 AI を使えた';
  end if;
  if take_ai_run('10000000-0000-0000-0000-000000000002', 'analyze') ->> 'reason' is distinct from 'not_member' then
    raise exception 'NG: 支援者がほかのチームの AI の回数を使えた';
  end if;
  select count(*) into n from ai_runs;
  if n <> 4 then raise exception 'NG: 自分のチームの AI の回数が見えない（% 件）', n; end if;
end $$;
reset role;

-- 閲覧者（V）は使えない。どこにも入っていない人（N）とチーム2 の管理者（B）は、使えず見えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if take_ai_run('10000000-0000-0000-0000-000000000001', 'analyze') ->> 'reason' is distinct from 'viewer' then
    raise exception 'NG: 閲覧者が AI を使えた';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  if take_ai_run('10000000-0000-0000-0000-000000000001', 'analyze') ->> 'reason' is distinct from 'not_member' then
    raise exception 'NG: どこにも入っていない人が AI を使えた';
  end if;
  select count(*) into n from ai_runs;
  if n <> 0 then raise exception 'NG: どこにも入っていない人に AI の回数が見えた'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  if take_ai_run('10000000-0000-0000-0000-000000000001', 'analyze') ->> 'reason' is distinct from 'not_member' then
    raise exception 'NG: チーム2 の管理者がチーム1 の AI を使えた';
  end if;
  select count(*) into n from ai_runs;
  if n <> 0 then raise exception 'NG: チーム2 の管理者にチーム1 の AI の回数が見えた'; end if;
end $$;
reset role;

-- チームの1日30回: ほかの人の分で 30回になったら、管理者（A）もその日は使えない
insert into ai_runs (person_id, user_id, kind)
  select '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'analyze' from generate_series(1, 26);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if take_ai_run('10000000-0000-0000-0000-000000000001', 'analyze') ->> 'reason' is distinct from 'team_day' then
    raise exception 'NG: チームの1日30回を超えて AI を使えた';
  end if;
end $$;
reset role;

-- アプリ全体の月1600回（14.2 #36、0011）: すべてのチームの分で 1600回になったら、だれも使えない
insert into ai_runs (person_id, user_id, kind)
  select '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'analyze' from generate_series(1, 1600);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if take_ai_run('10000000-0000-0000-0000-000000000001', 'analyze') ->> 'reason' is distinct from 'app_month' then
    raise exception 'NG: アプリ全体の月1600回を超えて AI を使えた';
  end if;
end $$;
reset role;

-- ---------- 監査ログを データベースが自分で残す（7.4.1、0010） ----------
-- 管理者（A）: 記録を作る・送り直す・取り消す・元に戻すと、そのたびに残る。送り直しでは増えない。自分では by_server の行を書けない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; t timestamptz := now() + interval '1 minute';
begin
  insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id, updated_at)
    values ('4a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000a1', t);
  select count(*) into n from audit_logs where entity_id = '4a000000-0000-0000-0000-000000000001' and by_server
    and entity = 'events' and action = 'create' and actor_id = '00000000-0000-0000-0000-0000000000a1' and before is null and after ->> 'recorder_id' = '00000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'NG: 記録を作ったのに監査ログが残らない'; end if;
  -- 同期で同じ内容を送り直す
  update events set updated_at = t where id = '4a000000-0000-0000-0000-000000000001';
  select count(*) into n from audit_logs where entity_id = '4a000000-0000-0000-0000-000000000001' and by_server;
  if n <> 1 then raise exception 'NG: 同じ内容の送り直しで監査ログが増えた（% 件）', n; end if;
  update events set deleted_at = now(), updated_at = t + interval '1 second' where id = '4a000000-0000-0000-0000-000000000001';
  update events set deleted_at = null, updated_at = t + interval '2 seconds' where id = '4a000000-0000-0000-0000-000000000001';
  select count(*) into n from audit_logs where entity_id = '4a000000-0000-0000-0000-000000000001' and by_server
    and ((action = 'delete' and before ->> 'deleted_at' is null and after ->> 'deleted_at' is not null) or (action = 'restore' and after ->> 'deleted_at' is null));
  if n <> 2 then raise exception 'NG: 取り消し・元に戻すが監査ログに残らない'; end if;
  -- 好きなものの写真は、中身を監査ログに入れない
  insert into reinforcers (id, person_id, name, category, level) values ('4a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '監査用', 'thing', 3);
  insert into reinforcer_photos (id, person_id, data) values ('4a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'data:image/jpeg;base64,/9j/AAAA');
  select count(*) into n from audit_logs where entity_id = '4a000000-0000-0000-0000-000000000002' and entity = 'reinforcer_photos' and by_server and not (after ? 'data');
  if n <> 1 then raise exception 'NG: 写真の監査ログがない、または写真の中身が入った'; end if;
  begin
    insert into audit_logs (id, person_id, entity, entity_id, action, actor_id, by_server)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'events', gen_random_uuid(), 'create', '00000000-0000-0000-0000-0000000000a1', true);
    raise exception 'NG: 端末から by_server の監査ログを書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update audit_logs set action = 'update' where entity_id = '4a000000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NG: 監査ログを書きかえられた'; end if;
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- チーム2 の管理者（B）には、チーム1 の監査ログが見えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from audit_logs where entity_id = '4a000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'NG: ほかのチームの監査ログが見えた'; end if;
end $$;
reset role;

-- ---------- 同意の記録（7.5、0001。端末から同期する） ----------
-- A は自分の同意をチーム1 に書ける。他人の名前・チーム2 には書けない。書いたあとは変えられない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  insert into consents (id, person_id, user_id, kind, text_version)
    values ('4b000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'ai_overseas', 'test');
  -- 同期で送り直しても（重なったら何もしない）エラーにならず、増えない
  insert into consents (id, person_id, user_id, kind, text_version)
    values ('4b000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'ai_overseas', 'test')
    on conflict (id) do nothing;
  select count(*) into n from consents where id = '4b000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'NG: 同意を送り直すと % 件になった', n; end if;
  begin
    insert into consents (id, person_id, user_id, kind, text_version)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'ai_overseas', 'test');
    raise exception 'NG: A が他人（L）の同意を書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into consents (id, person_id, user_id, kind, text_version)
      values (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'ai_overseas', 'test');
    raise exception 'NG: A がチーム2 に同意を書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update consents set text_version = 'x' where id = '4b000000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NG: 同意を書きかえられた'; end if;
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update consents set revoked_at = null where id = '4b000000-0000-0000-0000-000000000010';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NG: 取り消した同意を元に戻せた'; end if;
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    delete from consents where id = '4b000000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NG: 同意を消せた'; end if;
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- 副管理者（D）にはチームの同意が見える。支援リーダー（L）には他人の同意は見えない。チーム2 の B には見えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from consents where id = '4b000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'NG: 副管理者（D）にチームの同意が見えない';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from consents where user_id <> '00000000-0000-0000-0000-0000000000c1') <> 0 then
    raise exception 'NG: 支援リーダー（L）に他人の同意が見えた';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from consents where person_id = '10000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'NG: チーム2 の B にチーム1 の同意が見えた';
  end if;
end $$;
reset role;

-- ---------- 管理者の引き継ぎ（6.9、0012） ----------
-- 管理者の役割は、引き継ぎの関数の外からは変えられない（管理者でも、副管理者でも）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    update team_members set role = 'admin', updated_at = now() where id = '20000000-0000-0000-0000-0000000000b2';
    raise exception 'NG: 副管理者が自分を管理者にできた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update team_members set role = 'subadmin', updated_at = now() where id = '20000000-0000-0000-0000-0000000000a1';
    raise exception 'NG: 副管理者が管理者を下ろせた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform set_config('app.owner_transfer', 'on', true);
    update team_members set role = 'admin', updated_at = now() where id = '20000000-0000-0000-0000-0000000000b2';
    raise exception 'NG: 印を自分で付けた副管理者が管理者になれた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  perform set_config('app.owner_transfer', 'off', true);
  begin
    perform owner_transfer_swap(gen_random_uuid());
    raise exception 'NG: 入れかえの関数を直接呼べた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare t uuid;
begin
  begin
    update team_members set role = 'admin', updated_at = now() where id = '20000000-0000-0000-0000-0000000000b2';
    raise exception 'NG: 管理者がほかの人を直接管理者にできた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update team_members set role = 'subadmin', updated_at = now() where id = '20000000-0000-0000-0000-0000000000a1';
    raise exception 'NG: 管理者が自分の役割を直接下げられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform set_config('app.owner_transfer', 'on', true);
    update team_members set role = 'subadmin', updated_at = now() where id = '20000000-0000-0000-0000-0000000000a1';
    raise exception 'NG: 印を自分で付けた管理者が、関数の外で役割を下げられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  perform set_config('app.owner_transfer', 'off', true);
  -- 「家族」の印がない閲覧者・チーム2 の人・自分は指名できない
  begin
    perform nominate_admin('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'NG: 「家族」の印がない閲覧者を指名できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform nominate_admin('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1');
    raise exception 'NG: チーム2 の人を指名できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform nominate_admin('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2');
    raise exception 'NG: A がチーム2 の引き継ぎを指名できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  -- 副管理者（D）を指名できる。進んでいる引き継ぎは1つだけ
  t := nominate_admin('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2');
  perform set_config('test.t1', t::text, true);
  begin
    perform nominate_admin('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2');
    raise exception 'NG: 引き継ぎを2つ同時に作れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into owner_transfers (person_id, method, requested_by, from_user, to_user)
      values ('10000000-0000-0000-0000-000000000001', 'nominate', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'NG: 引き継ぎの表に直接書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- 支援リーダー（L）には見えるが、指名・申し込み・返事はできない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from owner_transfers;
  if n <> 1 then raise exception 'NG: 支援リーダーに引き継ぎが見えない（% 件）', n; end if;
  begin
    perform nominate_admin('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'NG: 支援リーダーが指名できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform request_admin('10000000-0000-0000-0000-000000000001');
    raise exception 'NG: 支援リーダーが管理者になる申し込みをできた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform answer_owner_transfer(current_setting('test.t1')::uuid, true);
    raise exception 'NG: 支援リーダーが指名を受けられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    update owner_transfers set result = 'completed' where id = current_setting('test.t1')::uuid;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NG: 支援リーダーが引き継ぎの表を書きかえた'; end if;
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- 閲覧者（V、かかわっていない）とチーム2 の B には見えない。B は返事もできない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from owner_transfers) <> 0 then raise exception 'NG: かかわっていない閲覧者に引き継ぎが見えた'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from owner_transfers) <> 0 then raise exception 'NG: チーム2 の B にチーム1 の引き継ぎが見えた'; end if;
  begin
    perform answer_owner_transfer(current_setting('test.t1')::uuid, false);
    raise exception 'NG: チーム2 の B がチーム1 の引き継ぎに返事できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- 指名された D は断れる。そのあと D が申し込み、期限の前は自分で管理者になれず、A は断れる
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare t uuid; r text;
begin
  r := answer_owner_transfer(current_setting('test.t1')::uuid, false);
  if r <> 'declined' then raise exception 'NG: 指名を断ったのに %', r; end if;
  t := request_admin('10000000-0000-0000-0000-000000000001');
  perform set_config('test.t2', t::text, true);
  begin
    perform finish_admin_request(t);
    raise exception 'NG: 14日たつ前に副管理者が管理者になれた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r text;
begin
  r := answer_owner_transfer(current_setting('test.t2')::uuid, false);
  if r <> 'rejected' then raise exception 'NG: 管理者が申し込みを断ったのに %', r; end if;
end $$;
reset role;

-- 14日たった申し込み（ここでは期限を過ぎた行を直接作る）。A はもう断れず、D が管理者になる。A は副管理者になる
insert into owner_transfers (id, person_id, method, requested_by, from_user, to_user, due_at) values
  ('4c000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'subadmin_request',
   '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', now() - interval '1 day');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform answer_owner_transfer('4c000000-0000-0000-0000-000000000003', false);
    raise exception 'NG: 期限を過ぎたのに管理者が断れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform finish_admin_request('4c000000-0000-0000-0000-000000000003');
end $$;
reset role;
do $$ begin
  if (select role from team_members where id = '20000000-0000-0000-0000-0000000000b2') <> 'admin' then raise exception 'NG: 期限のあと D が管理者にならない'; end if;
  if (select role from team_members where id = '20000000-0000-0000-0000-0000000000a1') <> 'subadmin' then raise exception 'NG: 元の管理者 A が副管理者にならない'; end if;
  if (select count(*) from team_members where person_id = '10000000-0000-0000-0000-000000000001' and role = 'admin' and deleted_at is null) <> 1 then
    raise exception 'NG: 入れかわったあと、管理者が1人ではない';
  end if;
  if (select result from owner_transfers where id = '4c000000-0000-0000-0000-000000000003') <> 'completed' then raise exception 'NG: 引き継ぎが終わったことになっていない'; end if;
  if (select count(*) from audit_logs where entity = 'owner_transfers' and by_server) < 4 then raise exception 'NG: 引き継ぎが監査ログに残っていない'; end if;
  if not exists (select 1 from audit_logs where entity = 'team_members' and entity_id = '20000000-0000-0000-0000-0000000000b2' and after ->> 'role' = 'admin') then
    raise exception 'NG: 管理者になったことが監査ログに残っていない';
  end if;
end $$;

-- 新しい管理者 D が A を指名し、A が受けると元に戻る（指名の流れ）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform set_config('test.t4', nominate_admin('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1')::text, true);
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r text;
begin
  r := answer_owner_transfer(current_setting('test.t4')::uuid, true);
  if r <> 'completed' then raise exception 'NG: 指名を受けたのに %', r; end if;
  if my_role('10000000-0000-0000-0000-000000000001') <> 'admin' then raise exception 'NG: 指名を受けた A が管理者にならない'; end if;
end $$;
reset role;
do $$ begin
  if (select role from team_members where id = '20000000-0000-0000-0000-0000000000b2') <> 'subadmin' then raise exception 'NG: 指名で入れかわったあと D が副管理者にならない'; end if;
end $$;

-- ---------- 開始コードは1回だけ使える ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare pid uuid; n int;
begin
  select count(*) into n from restraint_logs;
  if n <> 0 then raise exception 'NG: どこにも入っていない人に拘束記録が見えた'; end if;
  select count(*) into n from comments;
  if n <> 0 then raise exception 'NG: どこにも入っていない人に申し送りが見えた'; end if;
  begin
    perform create_team('WRONGCODE', 'x', null, '', '', 'N', 'family', 'v');
    raise exception 'NG: まちがった開始コードでチームを作れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  pid := create_team('rlstestcode1', '新しい人', null, '', '', 'N', 'family', 'v');
  select count(*) into n from persons;
  if n <> 1 then raise exception 'NG: 作ったチームの対象者が見えない、またはほかのチームが見えた'; end if;
  begin
    perform create_team('RLSTESTCODE1', 'y', null, '', '', 'N', 'family', 'v');
    raise exception 'NG: 使用済みの開始コードがもう一度使えた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- ---------- コードがないとアカウントを作れない（決定44、0014） ----------
do $$
begin
  begin
    insert into auth.users (id, email, aud, role) values
      ('00000000-0000-0000-0000-0000000000a5', 'rls-nocode@test.invalid', 'authenticated', 'authenticated');
    raise exception 'NG: コードなしでアカウントを作れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into auth.users (id, email, aud, role, raw_user_meta_data) values
      ('00000000-0000-0000-0000-0000000000a6', 'rls-wrongcode@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"WRONGCODE"}');
    raise exception 'NG: まちがったコードでアカウントを作れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    -- 使用済みの開始コード（上で使った）
    insert into auth.users (id, email, aud, role, raw_user_meta_data) values
      ('00000000-0000-0000-0000-0000000000a7', 'rls-usedcode@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"rlstestcode1"}');
    raise exception 'NG: 使用済みの開始コードでアカウントを作れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
-- ログイン前（anon）でも、コードが使えるかだけは確かめられる。中身（どのチームか）は分からない
set local role anon;
do $$
begin
  if not signup_code_ok(' rlssignup01 ') then raise exception 'NG: 使える開始コードが使えないと出た'; end if;
  if signup_code_ok('RLSTESTCODE1') then raise exception 'NG: 使用済みの開始コードが使えると出た'; end if;
  if signup_code_ok(null) then raise exception 'NG: 空のコードが使えると出た'; end if;
  begin
    perform 1 from start_codes;
    raise exception 'NG: ログイン前に開始コードの表が読めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- ---------- AI の分析・提案の結果と採否（決定63・70、0016） ----------
-- ほかのテストで役割が入れかわっているので、新しいチーム3 で確かめる。
-- X: チーム3 の管理者 / W: 支援リーダー / Y: 支援者 / Z: 閲覧者。チーム2 の分析（9a…02）は B が入れたもの
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c3', 'rls-ai-x@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000c4', 'rls-ai-y@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000c5', 'rls-ai-z@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000c6', 'rls-ai-w@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}');
insert into persons (id, display_name) values ('10000000-0000-0000-0000-000000000003', 'テスト3');
insert into team_members (id, person_id, user_id, display_name, affiliation, role, approved_at) values
  ('20000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3', 'X', 'family', 'admin', now()),
  ('20000000-0000-0000-0000-0000000000c4', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c4', 'Y', 'school', 'supporter', now()),
  ('20000000-0000-0000-0000-0000000000c5', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c5', 'Z', 'school', 'viewer', now()),
  ('20000000-0000-0000-0000-0000000000c6', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c6', 'W', 'facility', 'leader', now());
insert into behaviors (id, person_id, kind, name, method) values
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'problem', '行動3', 'frequency');
insert into ai_analyses (id, person_id, behavior_id, requested_by, input, output, model) values
  ('9a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', '{"behavior":{"name":"行動2"}}', '{"confidence":"low"}', 'm');
insert into ai_suggestions (id, person_id, analysis_id, requested_by, output, model) values
  ('9b000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', '{"alternatives":[]}', 'm');

-- 支援者（Y）は分析と提案を入れられるが、採否は決められない。ほかのチームには入れられない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  insert into ai_analyses (id, person_id, behavior_id, requested_by, input, output, model) values
    ('9a000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c4', '{"behavior":{"name":"行動3"}}', '{"confidence":"low"}', 'm');
  -- 採否を付けて送っても、支援者の分は空になる
  insert into ai_analyses (id, person_id, behavior_id, requested_by, input, output, model, decision, decided_by) values
    ('9a000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c4', '{}', null, 'm', 'adopted', '00000000-0000-0000-0000-0000000000c4');
  if (select decision from ai_analyses where id = '9a000000-0000-0000-0000-000000000004') is not null then
    raise exception 'NG: 支援者が採否を付けて分析を入れられた';
  end if;
  insert into ai_suggestions (id, person_id, analysis_id, requested_by, output, model) values
    ('9b000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c4', '{"alternatives":[]}', 'm');
  update ai_analyses set decision = 'adopted', decided_by = auth.uid(), updated_at = now() where id = '9a000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 支援者が分析の採否を決められた'; end if;
  update ai_suggestions set decision = 'adopted', updated_at = now() where id = '9b000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 支援者が提案の採否を決められた'; end if;
  begin
    insert into ai_analyses (id, person_id, behavior_id, requested_by, input, model) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3', '{}', 'm');
    raise exception 'NG: ほかの人が入れたことにして分析を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into ai_analyses (id, person_id, behavior_id, requested_by, input, model) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c4', '{}', 'm');
    raise exception 'NG: チーム2 に分析を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    -- チーム3 の分析として、チーム2 の行動を使う
    insert into ai_analyses (id, person_id, behavior_id, requested_by, input, model) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c4', '{}', 'm');
    raise exception 'NG: ほかのチームの行動で分析を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    -- チーム3 の提案として、チーム2 の分析を使う
    insert into ai_suggestions (id, person_id, analysis_id, requested_by, output, model) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c4', '{}', 'm');
    raise exception 'NG: ほかのチームの分析から提案を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  select count(*) into n from ai_analyses;
  if n <> 2 then raise exception 'NG: 支援者に、チームの分析が見えない、またはほかのチームの分析が見えた'; end if;
  select count(*) into n from ai_suggestions;
  if n <> 1 then raise exception 'NG: 支援者に、チームの提案が見えない、またはほかのチームの提案が見えた'; end if;
  begin
    delete from ai_analyses where id = '9a000000-0000-0000-0000-000000000003';
    raise exception 'NG: 分析を消せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- 閲覧者（Z）は結果と採否を見るだけ
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from ai_analyses;
  if n <> 2 then raise exception 'NG: 閲覧者にチームの分析が見えない'; end if;
  select count(*) into n from ai_suggestions;
  if n <> 1 then raise exception 'NG: 閲覧者にチームの提案が見えない'; end if;
  begin
    insert into ai_analyses (id, person_id, behavior_id, requested_by, input, model) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c5', '{}', 'm');
    raise exception 'NG: 閲覧者が分析を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update ai_analyses set decision = 'rejected', updated_at = now() where id = '9a000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が採否を決められた'; end if;
end $$;
reset role;

-- 支援リーダー（W）は採否を1回だけ決められる。決めた人はサーバーが書く。結果の中身は変えられない。ほかのチームは見えない・変えられない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c6","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  -- 決めた人を X と書いて送っても、W になる
  update ai_analyses set decision = 'modified', decision_note = '注目もありそう', decided_by = '00000000-0000-0000-0000-0000000000c3', updated_at = now()
    where id = '9a000000-0000-0000-0000-000000000003';
  if (select decision from ai_analyses where id = '9a000000-0000-0000-0000-000000000003') is distinct from 'modified' then
    raise exception 'NG: 支援リーダーが分析の採否を決められない';
  end if;
  if (select decided_by from ai_analyses where id = '9a000000-0000-0000-0000-000000000003') is distinct from '00000000-0000-0000-0000-0000000000c6' then
    raise exception 'NG: 採否を決めた人が、送った本人にならない';
  end if;
  update ai_suggestions set decision = 'adopted', updated_at = now() where id = '9b000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが提案の採否を決められない'; end if;
  -- 2回目は決められない
  update ai_analyses set decision = 'rejected', updated_at = now() + interval '1 second' where id = '9a000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 決めた採否を変えられた'; end if;
  -- 結果の中身と、消した印は変えられない
  update ai_analyses set output = '{"confidence":"high"}', updated_at = now() + interval '2 second' where id = '9a000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 分析の結果を書きかえられた'; end if;
  update ai_suggestions set output = '{"alternatives":[{"behavior":"x"}]}', updated_at = now() + interval '2 second' where id = '9b000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 提案の結果を書きかえられた'; end if;
  update ai_analyses set deleted_at = now(), updated_at = now() + interval '2 second' where id = '9a000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 分析を消した印を付けられた'; end if;
  -- 同じ内容の送り直しは通る（決めた人・時刻はそのまま）
  update ai_analyses set decided_by = null, decided_at = null, updated_at = now() + interval '3 second' where id = '9a000000-0000-0000-0000-000000000003';
  if (select decided_by from ai_analyses where id = '9a000000-0000-0000-0000-000000000003') is distinct from '00000000-0000-0000-0000-0000000000c6' then
    raise exception 'NG: 送り直しで、採否を決めた人が消えた';
  end if;
  -- チーム2
  select count(*) into n from ai_analyses where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: ほかのチームの分析が見えた'; end if;
  update ai_analyses set decision = 'adopted', updated_at = now() where id = '9a000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: ほかのチームの分析の採否を決められた'; end if;
  update ai_suggestions set decision = 'adopted', updated_at = now() where id = '9b000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: ほかのチームの提案の採否を決められた'; end if;
end $$;
reset role;
do $$ begin
  if (select decision from ai_analyses where id = '9a000000-0000-0000-0000-000000000002') is not null then raise exception 'NG: チーム2 の分析が変わった'; end if;
  if (select decision from ai_suggestions where id = '9b000000-0000-0000-0000-000000000002') is not null then raise exception 'NG: チーム2 の提案が変わった'; end if;
  if (select output ->> 'confidence' from ai_analyses where id = '9a000000-0000-0000-0000-000000000003') <> 'low' then raise exception 'NG: 分析の結果が変わった'; end if;
  if not exists (select 1 from audit_logs where entity = 'ai_analyses' and entity_id = '9a000000-0000-0000-0000-000000000003' and by_server and action = 'update') then
    raise exception 'NG: 採否を決めたことが監査ログに残らない';
  end if;
end $$;

-- 管理者（X）は端末で決めてから送った分析を、採否つきで入れられる。ほかのチームの管理者（N）には見えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into ai_analyses (id, person_id, behavior_id, requested_by, input, model, decision, decided_by) values
    ('9a000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3', '{}', 'm', 'rejected', '00000000-0000-0000-0000-0000000000c4');
  if (select decided_by from ai_analyses where id = '9a000000-0000-0000-0000-000000000005') is distinct from '00000000-0000-0000-0000-0000000000c3' then
    raise exception 'NG: 採否つきで入れた分析の、決めた人が送った本人にならない';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from ai_analyses;
  if n <> 0 then raise exception 'NG: ほかのチームの人に AI の分析が見えた'; end if;
  select count(*) into n from ai_suggestions;
  if n <> 0 then raise exception 'NG: ほかのチームの人に AI の提案が見えた'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from ai_analyses;
    raise exception 'NG: ログイン前に AI の分析が読めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- ---------- 0017 支援者の提案と、行動の定義の変更の記録 ----------
-- チーム2 の提案と定義の変更（ほかのチームから見えない・変えられないことを確かめる）
insert into proposals (id, person_id, kind, behavior_id, proposed_by, body) values
  ('9c000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'plan', null, '00000000-0000-0000-0000-0000000000b1', 'チーム2 の提案');
insert into behavior_revisions (id, person_id, behavior_id, user_id, fields) values
  ('9d000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', '{definition}');

-- 支援者（Y）は提案を出せるが、採用・見送りは決められない。定義の変更の記録は入れられない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  -- 採用済みにして送っても「まだ」になる
  insert into proposals (id, person_id, kind, behavior_id, proposed_by, body, status, decided_by) values
    ('9c000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'behavior', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c4', '「たたく」に、手のひらで机をたたくのも入れては', 'adopted', '00000000-0000-0000-0000-0000000000c4');
  if (select status from proposals where id = '9c000000-0000-0000-0000-000000000003') <> 'open' then
    raise exception 'NG: 支援者が採用済みの提案を入れられた';
  end if;
  insert into proposals (id, person_id, kind, proposed_by, body) values
    ('9c000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'plan', '00000000-0000-0000-0000-0000000000c4', '学校でも休憩カードを使いたい');
  update proposals set status = 'adopted', updated_at = now() where id = '9c000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 支援者が提案を採用できた'; end if;
  update proposals set body = '書きかえ', updated_at = now() where id = '9c000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 支援者が提案の文を書きかえられた'; end if;
  begin
    insert into proposals (id, person_id, kind, proposed_by, body) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', 'plan', '00000000-0000-0000-0000-0000000000c3', 'なりすまし');
    raise exception 'NG: ほかの人が出したことにして提案を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into proposals (id, person_id, kind, proposed_by, body) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', 'plan', '00000000-0000-0000-0000-0000000000c4', 'ほかのチーム');
    raise exception 'NG: チーム2 に提案を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into proposals (id, person_id, kind, behavior_id, proposed_by, body) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', 'behavior', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c4', 'ほかのチームの行動');
    raise exception 'NG: ほかのチームの行動への提案を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into behavior_revisions (id, person_id, behavior_id, user_id, fields) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c4', '{definition}');
    raise exception 'NG: 支援者が定義の変更の記録を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  select count(*) into n from proposals;
  if n <> 2 then raise exception 'NG: 支援者に、チームの提案が見えない、またはほかのチームの提案が見えた'; end if;
  select count(*) into n from behavior_revisions;
  if n <> 0 then raise exception 'NG: 支援者に、ほかのチームの定義の変更が見えた'; end if;
  begin
    delete from proposals where id = '9c000000-0000-0000-0000-000000000003';
    raise exception 'NG: 提案を消せた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- 閲覧者（Z）は見るだけ
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from proposals;
  if n <> 2 then raise exception 'NG: 閲覧者にチームの提案が見えない'; end if;
  begin
    insert into proposals (id, person_id, kind, proposed_by, body) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', 'plan', '00000000-0000-0000-0000-0000000000c5', '閲覧者の提案');
    raise exception 'NG: 閲覧者が提案を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update proposals set status = 'rejected', updated_at = now() where id = '9c000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が提案を見送りにできた'; end if;
end $$;
reset role;

-- 支援リーダー（W）は1回だけ決められる。決めた人はサーバーが書く。文は変えられない。定義の変更の記録を入れられる
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c6","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update proposals set status = 'adopted', decided_by = '00000000-0000-0000-0000-0000000000c3', updated_at = now()
    where id = '9c000000-0000-0000-0000-000000000003';
  if (select status from proposals where id = '9c000000-0000-0000-0000-000000000003') <> 'adopted' then
    raise exception 'NG: 支援リーダーが提案を採用できない';
  end if;
  if (select decided_by from proposals where id = '9c000000-0000-0000-0000-000000000003') is distinct from '00000000-0000-0000-0000-0000000000c6' then
    raise exception 'NG: 決めた人が、送った本人にならない';
  end if;
  update proposals set status = 'rejected', updated_at = now() + interval '1 second' where id = '9c000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 決めたことを変えられた'; end if;
  update proposals set status = 'open', updated_at = now() + interval '1 second' where id = '9c000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 決めたことを「まだ」に戻せた'; end if;
  update proposals set body = '書きかえ', updated_at = now() + interval '2 second' where id = '9c000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 提案の文を書きかえられた'; end if;
  update proposals set deleted_at = now(), updated_at = now() + interval '2 second' where id = '9c000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 提案を消した印を付けられた'; end if;
  -- 同じ内容の送り直しは通る（決めた人・時刻はそのまま）
  update proposals set decided_by = null, decided_at = null, updated_at = now() + interval '3 second' where id = '9c000000-0000-0000-0000-000000000003';
  if (select decided_by from proposals where id = '9c000000-0000-0000-0000-000000000003') is distinct from '00000000-0000-0000-0000-0000000000c6' then
    raise exception 'NG: 送り直しで、決めた人が消えた';
  end if;
  update proposals set status = 'rejected', updated_at = now() where id = '9c000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが提案を見送りにできない'; end if;
  -- 定義の変更の記録
  insert into behavior_revisions (id, person_id, behavior_id, user_id, fields) values
    ('9d000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c6', '{definition,examples}');
  -- 同じ記録の送り直しは重ならない（端末は ignoreDuplicates で送る）
  insert into behavior_revisions (id, person_id, behavior_id, user_id, fields) values
    ('9d000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c6', '{definition,examples}')
    on conflict (id) do nothing;
  begin
    update behavior_revisions set fields = '{method}' where id = '9d000000-0000-0000-0000-000000000003';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NG: 定義の変更の記録を書きかえられた'; end if;
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    delete from behavior_revisions where id = '9d000000-0000-0000-0000-000000000003';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NG: 定義の変更の記録を消せた'; end if;
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into behavior_revisions (id, person_id, behavior_id, user_id, fields) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3', '{definition}');
    raise exception 'NG: ほかの人が変えたことにして定義の変更の記録を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    insert into behavior_revisions (id, person_id, behavior_id, user_id, fields) values
      (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c6', '{definition}');
    raise exception 'NG: ほかのチームの行動の、定義の変更の記録を入れられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  -- チーム2
  select count(*) into n from proposals where person_id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'NG: ほかのチームの提案が見えた'; end if;
  update proposals set status = 'adopted', updated_at = now() where id = '9c000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: ほかのチームの提案を採用できた'; end if;
  select count(*) into n from behavior_revisions;
  if n <> 1 then raise exception 'NG: 定義の変更の記録が、チームの分だけ見えない'; end if;
end $$;
reset role;
do $$ begin
  if (select status from proposals where id = '9c000000-0000-0000-0000-000000000002') <> 'open' then raise exception 'NG: チーム2 の提案が変わった'; end if;
  if (select body from proposals where id = '9c000000-0000-0000-0000-000000000004') <> '学校でも休憩カードを使いたい' then raise exception 'NG: 提案の文が変わった'; end if;
  if (select fields from behavior_revisions where id = '9d000000-0000-0000-0000-000000000003') <> '{definition,examples}' then raise exception 'NG: 定義の変更の記録が変わった'; end if;
  if not exists (select 1 from audit_logs where entity = 'proposals' and entity_id = '9c000000-0000-0000-0000-000000000003' and by_server and action = 'update') then
    raise exception 'NG: 提案を採用したことが監査ログに残らない';
  end if;
end $$;

-- ほかのチームの管理者（N）には見えない。ログイン前は読めない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from proposals;
  if n <> 0 then raise exception 'NG: ほかのチームの人に提案が見えた'; end if;
  select count(*) into n from behavior_revisions;
  if n <> 0 then raise exception 'NG: ほかのチームの人に定義の変更の記録が見えた'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from proposals;
    raise exception 'NG: ログイン前に提案が読めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  begin
    perform 1 from behavior_revisions;
    raise exception 'NG: ログイン前に定義の変更の記録が読めた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- ---------- 0018 「家族」の印は管理者だけが付ける（6.3.4） ----------
-- 支援リーダー（L）と副管理者（D）は、印を付けて招待できない。メンバーの印・睡眠の許可を変えても前のまま
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  begin
    perform create_invite('10000000-0000-0000-0000-000000000001', 'supporter', true);
    raise exception 'NG: 支援リーダーが「家族」の印を付けて招待できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update team_members set family_mark = true, sleep_input_allowed = true, updated_at = now() + interval '20 seconds'
    where id = '20000000-0000-0000-0000-0000000000d1';
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000d1' and not family_mark and not sleep_input_allowed;
  if n <> 1 then raise exception 'NG: 支援リーダーがメンバーに「家族」の印か睡眠の許可を付けられた'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  begin
    perform create_invite('10000000-0000-0000-0000-000000000001', 'supporter', true);
    raise exception 'NG: 副管理者が「家族」の印を付けて招待できた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
  update team_members set family_mark = true, updated_at = now() + interval '21 seconds' where id = '20000000-0000-0000-0000-0000000000d1';
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000d1' and not family_mark;
  if n <> 1 then raise exception 'NG: 副管理者がメンバーに「家族」の印を付けられた'; end if;
end $$;
reset role;

-- 管理者（A）は、印を付けた招待と付けない招待を作れる。メンバーの印も変えられる
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  perform set_config('rls_test.fam_on', create_invite('10000000-0000-0000-0000-000000000001', 'supporter', true), true);
  perform set_config('rls_test.fam_off', create_invite('10000000-0000-0000-0000-000000000001', 'supporter'), true);
  update team_members set family_mark = true, updated_at = now() + interval '22 seconds' where id = '20000000-0000-0000-0000-0000000000d1';
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000d1' and family_mark;
  if n <> 1 then raise exception 'NG: 管理者がメンバーに「家族」の印を付けられない'; end if;
end $$;
reset role;
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a9', 'rls-fam1@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}'),
  ('00000000-0000-0000-0000-0000000000aa', 'rls-fam2@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}');
-- 所属を「家族」と選んでも、印のない招待では印は付かない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform join_team(current_setting('rls_test.fam_off'), 'F1', 'family', 'v'); end $$;
reset role;
-- 印を付けた招待では、所属が「家族」でなくても印が付く
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform join_team(current_setting('rls_test.fam_on'), 'F2', 'school', 'v'); end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from team_members where user_id = '00000000-0000-0000-0000-0000000000a9' and not family_mark;
  if n <> 1 then raise exception 'NG: 所属を「家族」と選んだだけで「家族」の印が付いた'; end if;
  select count(*) into n from team_members where user_id = '00000000-0000-0000-0000-0000000000aa' and family_mark;
  if n <> 1 then raise exception 'NG: 印を付けた招待で参加したのに「家族」の印が付かない'; end if;
  select count(*) into n from audit_logs where entity = 'invite' and (after ->> 'familyMark')::boolean;
  if n <> 1 then raise exception 'NG: 印を付けた招待が監査ログに残らない'; end if;
end $$;

-- ---------- 0019 観察の場所・職種・招待コードの中身・チームを抜ける ----------
-- 招待コードの中身: ログインしていなければ、チームの名前は出ない。使えないコードは null
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform set_config('rls_test.peek', create_invite('10000000-0000-0000-0000-000000000001', 'supporter'), true); end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare j json;
begin
  j := invite_preview(current_setting('rls_test.peek'));
  if j is null or j ->> 'role' <> 'supporter' or j ->> 'inviter' <> 'A' or j ->> 'expires_at' is null then
    raise exception 'NG: ログイン前に招待コードの役割・招待した人・期限が見られない';
  end if;
  if j ->> 'team' is not null then raise exception 'NG: ログイン前にチームの名前が見えた'; end if;
  if invite_preview('NOSUCHCODE') is not null then raise exception 'NG: 使えないコードで中身が返った'; end if;
  begin
    perform leave_team('10000000-0000-0000-0000-000000000001');
    raise exception 'NG: ログインしていない人が leave_team を呼べた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;
-- ログインした人（チームの外の N）には、チームの名前も出る
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if invite_preview(current_setting('rls_test.peek')) ->> 'team' is distinct from 'テスト1' then
    raise exception 'NG: ログインしたのにチームの名前が見えない';
  end if;
  -- チームの外の人は抜けられない（ほかの人の行は変えられない）
  begin
    perform leave_team('10000000-0000-0000-0000-000000000001');
    raise exception 'NG: チームの外の人が leave_team で何かを変えられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- 職種: 支援リーダー（L）は書ける。閲覧者（V）は書けない（行が変わらない）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
update team_members set job_title = '支援員', updated_at = now() + interval '30 seconds' where id = '20000000-0000-0000-0000-0000000000f1';
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
update team_members set job_title = '勝手に', updated_at = now() + interval '31 seconds' where id = '20000000-0000-0000-0000-0000000000c1';
-- 閲覧者は、自分の行に直接「削除」を付けて抜けることはできない（関数からだけ）
do $$
begin
  begin
    update team_members set deleted_at = now(), updated_at = now() + interval '32 seconds' where id = '20000000-0000-0000-0000-0000000000d1';
  exception when others then null; end;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000f1' and job_title = '支援員';
  if n <> 1 then raise exception 'NG: 支援リーダーがメンバーの職種を書けない'; end if;
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000c1' and job_title = '';
  if n <> 1 then raise exception 'NG: 閲覧者がメンバーの職種を書きかえられた'; end if;
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000d1' and deleted_at is null;
  if n <> 1 then raise exception 'NG: 自分の行に直接「削除」を付けて抜けられた'; end if;
end $$;

-- 観察の場所の名前が残る（チーム1 の管理者 A）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into observations (id, person_id, behavior_id, method, interval_sec, started_at, local_date, recorder_id, place_name)
  values ('a0190000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
          'interval', 60, now(), current_date, '00000000-0000-0000-0000-0000000000a1', '家');
-- 管理者は抜けられない
do $$
begin
  begin
    perform leave_team('10000000-0000-0000-0000-000000000001');
    raise exception 'NG: 管理者がチームを抜けられた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if; end;
end $$;
reset role;

-- 閲覧者（V）と副管理者（D）は、自分から抜けられる。抜けたあとはチームのデータが見えない。付けた記録は残る
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform leave_team('10000000-0000-0000-0000-000000000001'); end $$;
do $$
declare n int;
begin
  select count(*) into n from events where person_id = '10000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'NG: チームを抜けたあとも記録が見える'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform leave_team('10000000-0000-0000-0000-000000000001'); end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from team_members where id in ('20000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000b2') and deleted_at is not null;
  if n <> 2 then raise exception 'NG: 閲覧者か副管理者が、自分から抜けられない'; end if;
  select count(*) into n from observations where id = 'a0190000-0000-0000-0000-000000000001' and place_name = '家';
  if n <> 1 then raise exception 'NG: 観察に場所の名前が残らない'; end if;
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000a1' and deleted_at is null;
  if n <> 1 then raise exception 'NG: 管理者の行が変わった'; end if;
end $$;

-- ---------- 多要素認証（MFA）（0020） ----------
-- W: チーム1 の支援者（MFA のテスト用）
select set_config('request.jwt.claims', '', true);
reset role;
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000ab', 'rls-mfa-w@test.invalid', 'authenticated', 'authenticated', '{"invite_code":"RLSSIGNUP01"}');
insert into team_members (id, person_id, user_id, display_name, affiliation, role, approved_at)
  values ('20000000-0000-0000-0000-0000000000ab', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ab', 'W', 'school', 'supporter', now());

-- 必須になってすぐ（7日の猶予のうち）は、MFA を通していなくても書ける（支援リーダー L）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000c1'); end $$;

-- 猶予が過ぎたら（基準「支援リーダー以上」）
select set_config('request.jwt.claims', '', true);
reset role;
alter table team_settings disable trigger settings_mfa;
update team_settings set mfa_rule_at = now() - interval '8 days', updated_at = updated_at + interval '1 second' where id = '10000000-0000-0000-0000-000000000001';
alter table team_settings enable trigger settings_mfa;
alter table team_members disable trigger members_mfa;
update team_members set mfa_override_at = now() - interval '8 days', updated_at = updated_at + interval '1 second' where person_id = '10000000-0000-0000-0000-000000000001';
alter table team_members enable trigger members_mfa;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000c1');
    raise exception 'NG: 猶予のあと、MFA を通していない支援リーダーが記録を書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if;
    if sqlerrm not like 'MFA_REQUIRED%' then raise exception 'NG: 猶予のあと、MFA を通していない支援リーダーが記録を書けた（ちがうエラー: %）', sqlerrm; end if;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000c1'); end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: 猶予のあと、MFA を通していない管理者が記録を書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if;
    if sqlerrm not like 'MFA_REQUIRED%' then raise exception 'NG: 猶予のあと、MFA を通していない管理者が記録を書けた（ちがうエラー: %）', sqlerrm; end if;
  end;
end $$;

do $$
begin
  begin
    perform create_invite('10000000-0000-0000-0000-000000000001', 'supporter');
    raise exception 'NG: MFA を通していない管理者が招待コードを作れた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if;
    if sqlerrm not like 'MFA_REQUIRED%' then raise exception 'NG: MFA を通していない管理者が招待コードを作れた（ちがうエラー: %）', sqlerrm; end if;
  end;
end $$;

-- 支援者は「支援リーダー以上」の基準では要らない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated"}', true);
set local role authenticated;
do $$ begin insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000ab'); end $$;

-- 読むのはこれまでどおり（閲覧だけになる）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from events where person_id = '10000000-0000-0000-0000-000000000001';
  if n = 0 then raise exception 'NG: MFA がないと記録が読めなくなった'; end if;
end $$;

-- 管理者でない人は、基準と例外を変えられない（エラーにせず、前の値のまま）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
update team_members set mfa_override = 'exempt', updated_at = updated_at + interval '1 second' where id = '20000000-0000-0000-0000-0000000000c1';
select set_config('request.jwt.claims', '', true);
reset role;
do $$
declare n int;
begin
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000c1' and mfa_override is null;
  if n <> 1 then raise exception 'NG: 支援リーダーが自分の MFA を免除にできた'; end if;
end $$;
-- 副管理者（設定は保存できる）でも、基準は前の値のまま（保存そのものは通る）
-- 副管理者 D（b2）は前のテストで外したので、ここだけ戻す
alter table team_members disable trigger user;
update team_members set deleted_at = null where id = '20000000-0000-0000-0000-0000000000b2';
alter table team_members enable trigger user;
create temp table mfa_before as select updated_at from team_settings where id = '10000000-0000-0000-0000-000000000001';
grant select on mfa_before to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
update team_settings set mfa_rule = 'optional', updated_at = updated_at + interval '1 second' where id = '10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '', true);
reset role;
do $$
declare n int;
begin
  select count(*) into n from team_settings s where id = '10000000-0000-0000-0000-000000000001' and mfa_rule = 'leader'
    and s.updated_at > (select updated_at from mfa_before);
  if n <> 1 then raise exception 'NG: 副管理者が MFA の基準を変えられた（または保存そのものが通らない）'; end if;
end $$;
drop table mfa_before;
alter table team_members disable trigger user;
update team_members set deleted_at = now() where id = '20000000-0000-0000-0000-0000000000b2';
alter table team_members enable trigger user;

-- 管理者が「全員必須」にすると、支援者もいる（猶予のあと）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
update team_settings set mfa_rule = 'all', updated_at = updated_at + interval '1 second' where id = '10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '', true);
reset role;
do $$
declare n int;
begin
  select count(*) into n from team_settings where id = '10000000-0000-0000-0000-000000000001' and mfa_rule = 'all' and mfa_rule_at > now() - interval '1 minute';
  if n <> 1 then raise exception 'NG: 管理者が MFA の基準を変えられない（または時刻が付かない）'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated"}', true);
set local role authenticated;
do $$ begin insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000ab'); end $$;

select set_config('request.jwt.claims', '', true);
reset role;
alter table team_settings disable trigger settings_mfa;
update team_settings set mfa_rule_at = now() - interval '8 days', updated_at = updated_at + interval '1 second' where id = '10000000-0000-0000-0000-000000000001';
alter table team_settings enable trigger settings_mfa;
alter table team_members disable trigger members_mfa;
update team_members set mfa_override_at = now() - interval '8 days', updated_at = updated_at + interval '1 second' where person_id = '10000000-0000-0000-0000-000000000001';
alter table team_members enable trigger members_mfa;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000ab');
    raise exception 'NG: 「全員必須」の猶予のあと、MFA を通していない支援者が書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if;
    if sqlerrm not like 'MFA_REQUIRED%' then raise exception 'NG: 「全員必須」の猶予のあと、MFA を通していない支援者が書けた（ちがうエラー: %）', sqlerrm; end if;
  end;
end $$;


-- 管理者が W を免除にすると、すぐ書ける。管理者自身は免除にできない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
update team_members set mfa_override = 'exempt', updated_at = updated_at + interval '1 second' where id in ('20000000-0000-0000-0000-0000000000ab', '20000000-0000-0000-0000-0000000000a1');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated"}', true);
set local role authenticated;
do $$ begin insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000ab'); end $$;

select set_config('request.jwt.claims', '', true);
reset role;
do $$
declare n int;
begin
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000a1' and mfa_override is null;
  if n <> 1 then raise exception 'NG: 管理者が MFA を免除にできた'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'NG: 管理者を免除にしようとしたら、MFA なしで書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if;
    if sqlerrm not like 'MFA_REQUIRED%' then raise exception 'NG: 管理者を免除にしようとしたら、MFA なしで書けた（ちがうエラー: %）', sqlerrm; end if;
  end;
end $$;


-- 自分で MFA を設定した人は、基準が「任意」でも、MFA を通していないログインでは書けない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
update team_settings set mfa_rule = 'optional', updated_at = updated_at + interval '1 second' where id = '10000000-0000-0000-0000-000000000001';
update team_members set mfa_override = null, updated_at = updated_at + interval '1 second' where id = '20000000-0000-0000-0000-0000000000ab';
select set_config('request.jwt.claims', '', true);
reset role;
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
  values ('a0200000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000ab', 'totp', 'verified', now(), now());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000ab');
    raise exception 'NG: MFA を設定した人が、MFA を通さずに書けた';
  exception when others then if sqlerrm like 'NG:%' then raise; end if;
    if sqlerrm not like 'MFA_REQUIRED%' then raise exception 'NG: MFA を設定した人が、MFA を通さずに書けた（ちがうエラー: %）', sqlerrm; end if;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin insert into events (id, person_id, behavior_id, occurred_at, local_date, recorder_id) values ('a0200000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000ab'); end $$;


-- MFA がなくても、自分からチームを抜けることはできる
select set_config('request.jwt.claims', '', true);
reset role;
alter table team_settings disable trigger settings_mfa;
update team_settings set mfa_rule = 'leader', mfa_rule_at = now() - interval '8 days', updated_at = updated_at + interval '1 second' where id = '10000000-0000-0000-0000-000000000001';
alter table team_settings enable trigger settings_mfa;
alter table team_members disable trigger members_mfa;
update team_members set mfa_override_at = now() - interval '8 days', updated_at = updated_at + interval '1 second' where person_id = '10000000-0000-0000-0000-000000000001';
alter table team_members enable trigger members_mfa;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform leave_team('10000000-0000-0000-0000-000000000001'); end $$;

select set_config('request.jwt.claims', '', true);
reset role;
do $$
declare n int;
begin
  select count(*) into n from team_members where id = '20000000-0000-0000-0000-0000000000c1' and deleted_at is not null;
  if n <> 1 then raise exception 'NG: MFA がないとチームを抜けられない'; end if;
end $$;

rollback;

-- ここまで止まらずに来たら合格（テスト用のデータは上の rollback で消えている）
select 'すべて合格' as 結果;
