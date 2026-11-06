-- 監査ログを データベースが自分で残す（7.4.1・7.4.2 #6・6.3.5）。
-- これまでは画面（端末）が作った監査ログを送っていたので、手を加えた端末なら記録を残さずに変えられた。
-- ここでは、表に書き込みがあるたびに データベースが「誰が・いつ・何を・どう変えたか」を audit_logs に足す（by_server = true）。
-- 端末が送る監査ログ（書き出しなど）もこれまでどおり受け取る（by_server = false）。端末からは by_server = true の行を書けない。
-- 使い方: 0009 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

alter table audit_logs add column by_server boolean not null default false;

drop policy audit_insert on audit_logs;
create policy audit_insert on audit_logs for insert
  with check (actor_id = auth.uid() and by_server = false and (person_id is null or my_role(person_id) is not null));

-- 書き込みのたびに1行足す。ログインした人の操作だけを数える（SQL Editor から運営者が直したものは残らない）
create function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n jsonb := to_jsonb(new) - 'server_at' - 'data';  -- 写真の中身（data）は監査ログに入れない
  o jsonb;
  act text := 'create';
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old) - 'server_at' - 'data';
    -- 同期で同じ内容が送り直されただけなら残さない
    if to_jsonb(new) - 'server_at' = to_jsonb(old) - 'server_at' then return null; end if;
    act := case
      when (o ->> 'deleted_at') is null and (n ->> 'deleted_at') is not null then 'delete'
      when (o ->> 'deleted_at') is not null and (n ->> 'deleted_at') is null then 'restore'
      else 'update' end;
  end if;
  insert into audit_logs (id, person_id, entity, entity_id, action, actor_id, before, after, by_server)
  values (
    gen_random_uuid(),
    coalesce((n ->> 'person_id')::uuid, case when tg_table_name = 'persons' then (n ->> 'id')::uuid end),
    tg_table_name, (n ->> 'id')::uuid, act, auth.uid(), o, n, true);
  return null;
end $$;
revoke all on function audit_row() from public, anon, authenticated;

create trigger persons_audit after insert or update on persons for each row execute function audit_row();
create trigger members_audit after insert or update on team_members for each row execute function audit_row();
create trigger behaviors_audit after insert or update on behaviors for each row execute function audit_row();
create trigger events_audit after insert or update on events for each row execute function audit_row();
create trigger choices_audit after insert or update on choice_options for each row execute function audit_row();
create trigger abc_audit after insert or update on abc_details for each row execute function audit_row();
create trigger consents_audit after insert or update on consents for each row execute function audit_row();
create trigger sleep_audit after insert or update on sleep_logs for each row execute function audit_row();
create trigger nod_audit after insert or update on not_observed_days for each row execute function audit_row();
create trigger places_audit after insert or update on places for each row execute function audit_row();
create trigger plans_audit after insert or update on support_plans for each row execute function audit_row();
create trigger changes_audit after insert or update on plan_changes for each row execute function audit_row();
create trigger signoffs_audit after insert or update on plan_signoffs for each row execute function audit_row();
create trigger restraint_audit after insert or update on restraint_logs for each row execute function audit_row();
create trigger meetings_audit after insert or update on meeting_notes for each row execute function audit_row();
create trigger comments_audit after insert or update on comments for each row execute function audit_row();
create trigger settings_audit after insert or update on team_settings for each row execute function audit_row();
create trigger reinforcers_audit after insert or update on reinforcers for each row execute function audit_row();
create trigger photos_audit after insert or update on reinforcer_photos for each row execute function audit_row();
create trigger observations_audit after insert or update on observations for each row execute function audit_row();
create trigger schedules_audit after insert or update on user_schedules for each row execute function audit_row();
