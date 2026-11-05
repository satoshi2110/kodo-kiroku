-- チームの分離のテスト（7.4.3a、決定45）
-- 使い方: 0001_init.sql を適用したあと、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。
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
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now(), current_date, '00000000-0000-0000-0000-0000000000a1', '2026-11-06T10:00:00+09:00'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', now(), current_date, '00000000-0000-0000-0000-0000000000b1', now());

insert into start_codes (code) values ('RLSTESTCODE1');

-- ---------- ログインしていない人（anon）は何もできない ----------
set local role anon;
do $$ begin
  begin
    perform 1 from persons;
    raise exception 'NG: ログインしていない人が対象者の表を読めた';
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

  -- 古い変更は捨てられる（後から届いた古い記録で上書きしない）
  update events set count = 5, updated_at = '2026-11-06T09:00:00+09:00' where id = '40000000-0000-0000-0000-000000000001';
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
  update events set count = 7, updated_at = now() where id = '40000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NG: 閲覧者が記録を書きかえた'; end if;
end $$;
reset role;

-- ---------- 支援リーダー（L）は、管理者・副管理者にかかわる変更ができない ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare code text;
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
