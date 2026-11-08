-- 点検で見つかったサーバー側の穴をふさぐ（2026-11-08、決定139）。
-- ・チームの削除の申し込みの日時は、サーバーが決める。端末から過去の日時を送って、30日の待ちを飛ばせないようにする（7.4、0023）。
-- ・手順（0026）の行動は、あとから変えられない。問題行動に手順を付けられないようにする（決定123）。
-- 使い方: 0026 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- ---------- チームの削除の申し込み（0013 の setting_guard を作り直す。AI の あり／なし の決まりは 0013 と同じ） ----------
create or replace function setting_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if my_role(new.person_id) is distinct from 'admin' then
    if tg_op = 'INSERT' then
      new.ai_enabled := false;
      new.delete_requested_at := null;
    else
      new.ai_enabled := old.ai_enabled;
      new.delete_requested_at := old.delete_requested_at;
    end if;
  else
    if new.ai_enabled and (tg_op = 'INSERT' or not old.ai_enabled) and not exists (
      select 1 from consents
      where person_id = new.person_id and user_id = auth.uid() and kind = 'ai_overseas'
        and revoked_at is null and deleted_at is null
    ) then
      new.ai_enabled := false;
    end if;
    -- 申し込んだ日時は、送られてきた値を使わず、いまの時刻にする。申し込み中は日時を動かせない。取り消し（null）はできる
    if new.delete_requested_at is not null then
      if tg_op = 'INSERT' or old.delete_requested_at is null then
        new.delete_requested_at := now();
      else
        new.delete_requested_at := old.delete_requested_at;
      end if;
    end if;
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;

-- ---------- 手順の行動は変えられない ----------
-- 手順の id は行動ごとに決まる（端末の fixedId）ので、行動を付けかえる正しい操作はない。
-- 変えようとしたら、もとの行動のままにする（ほかの同期の見張りと同じく、エラーにはしない）
create function task_behavior_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.behavior_id := old.behavior_id;
  new.person_id := old.person_id;
  return new;
end $$;
create trigger task_analyses_behavior_fixed before update on task_analyses
  for each row execute function task_behavior_guard();
