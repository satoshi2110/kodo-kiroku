-- AI の同意の取り消し（7.5）。
-- ・管理者が AI を「なし」に戻すと、そのチームの AI の同意（海外の事業者への送信）をすべて取り消す。
--   「なし」に戻すことが、そのまま同意の取り消しになる。端末を書きかえても、取り消さずに「なし」にはできない。
-- ・「あり」にできるのは、まだ取り消していない自分の同意がある管理者だけ。ないときはサーバーの値のまま残す
--   （取り消したあとにもう一度使うときは、同意を取り直す）。
-- ・取り消しは表への書き込みとして監査ログに残る（0010 のトリガー）。同意の行はこれまでどおり端末からは書きかえられない。
-- 使い方: 0012 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- AI の あり／なし と、チームの削除の申し込みは管理者だけ（0005 と同じ）。「あり」にするには同意が要る
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
  elsif new.ai_enabled and (tg_op = 'INSERT' or not old.ai_enabled) and not exists (
    select 1 from consents
    where person_id = new.person_id and user_id = auth.uid() and kind = 'ai_overseas'
      and revoked_at is null and deleted_at is null
  ) then
    new.ai_enabled := false;
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;

-- 「なし」に戻ったら、そのチームの AI の同意を取り消す。同意の行は端末から書きかえられないので、ここで書く
create function revoke_ai_consents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.ai_enabled and not new.ai_enabled then
    update consents
      set revoked_at = now(),
          updated_at = greatest(now(), updated_at + interval '1 millisecond'),
          server_at = clock_timestamp()
      where person_id = new.person_id and kind = 'ai_overseas' and revoked_at is null;
  end if;
  return null;
end $$;
create trigger settings_revoke_ai after update on team_settings for each row execute function revoke_ai_consents();

revoke execute on function revoke_ai_consents() from public, anon, authenticated;
