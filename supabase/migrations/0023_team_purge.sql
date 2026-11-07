-- チームの削除をサーバーでも行う（7.6、14.2 #42。詳細は【暫定】2026-11-07 の試作）。
-- ・管理者が削除を申し込んで（team_settings.delete_requested_at）30日たったあと、チームのだれかがアプリを開くと、
--   端末が purge_team を呼び、サーバーからそのチームの記録・写真・場所などを消す。30日たったかはサーバーの時計で確かめる。
-- ・消さずに残すもの（14.3 #10・#11 で、法律の専門家に相談して決めるまで）:
--   監査ログ（誰も消せない。7.4.2 #6）と身体拘束の記録（取り消し・削除できない。6.8）。残しても、メンバーがいなくなるので誰も読めない。
--   ほかに、AI の回数の記録（中身はない）と開始コードも残す。対象者の行は名前などを消して「削除したチーム」として残す（監査ログがこの行を指すため）。
-- ・メンバーの行も消すので、ほかのメンバーの端末は次の同期で、端末の中のそのチームのデータを消す（0019 までと同じしくみ）。
-- ・閲覧の記録（0022）も消す。消したことは監査ログに1行残す（中身は入れない）。
-- 使い方: 0022 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

create function purge_team(p_person uuid) returns void
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
