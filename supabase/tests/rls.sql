-- チームの分離のテスト（7.4.3a、決定45）
-- 使い方: supabase/migrations の SQL（0001, 0002, 0003 …）をすべて順に適用したあと、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。
-- 結果: 最後に「すべて合格」と出れば合格。どこかで止まったら、エラーの文（「NG: …」）が不合格の項目。
-- テスト用の人・チームは最後の rollback で消えるので、本番のデータには何も残らない。

begin;

-- ---------- テスト用の人とチーム（管理者として作る。RLS はかからない） ----------
-- A: チーム1 の管理者 / B: チーム2 の管理者 / L: チーム1 の支援リーダー / V: チーム1 の閲覧者
-- P: チーム1 の承認待ち / S: チーム1 の停止中 / J: これから招待で参加する人 / N: どこにも入っていない人
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-a@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'rls-b@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'rls-l@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d1', 'rls-v@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e1', 'rls-p@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f1', 'rls-s@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'rls-j@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'rls-n@test.invalid', 'authenticated', 'authenticated');

insert into persons (id, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'テスト1'),
  ('10000000-0000-0000-0000-000000000002', 'テスト2');

insert into team_members (id, person_id, user_id, display_name, affiliation, role, approved_at, suspended_at) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'A', 'family', 'admin', now(), null),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'B', 'family', 'admin', now(), null),
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'L', 'facility', 'leader', now(), null),
  ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'V', 'school', 'viewer', now(), null),
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
  update events set count = 7, updated_at = now() where id = '40000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が記録を書きかえた'; end if;
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
  -- 合意者に入っている自分の分は合意できる
  insert into plan_signoffs (id, person_id, change_id, member_id, state, opinion)
    values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000c1', 'opinion', '意見');
  -- 拘束記録: 支援リーダーは、ほかの人が書いた記録を直せる（6.8）
  update restraint_logs set review = '組織で検討した', updated_at = now() where id = '83000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NG: 支援リーダーが拘束記録を直せない'; end if;
  -- 支援者としての招待はできる。コードは次の J のテストで使う
  code := create_invite('10000000-0000-0000-0000-000000000001', 'supporter');
  perform set_config('rls_test.invite', code, true);
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

-- ---------- 開始コードは1回だけ使える ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare pid uuid; n int;
begin
  select count(*) into n from restraint_logs;
  if n <> 0 then raise exception 'NG: どこにも入っていない人に拘束記録が見えた'; end if;
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

rollback;

-- ここまで止まらずに来たら合格（テスト用のデータは上の rollback で消えている）
select 'すべて合格' as 結果;
