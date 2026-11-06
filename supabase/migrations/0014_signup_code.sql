-- 招待コードか開始コードがないと、アカウントを作れないようにする（決定44、6.9）。
-- ・アカウントを作るとき、画面は入れたコードをユーザーの情報（invite_code）として送る。
--   サーバーは、使える招待コード（使用前・取り消していない・期限内）か開始コード（使用前・無効にしていない・期限内）のときだけ作る。
-- ・ここでは確かめるだけで、コードは使わない。チームに入る・チームを作るときに、これまでどおり1回だけ使える（join_team・create_team）。
-- ・Supabase の画面の「Add user」で人を足すときも、コードがないと作れない（足すときは、アプリの「はじめて使う」から開始コードで作る）。
-- 使い方: 0013 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- コードが使えるか（アカウントを作る前の画面からも確かめられるように、ログイン前でも呼べる）
create function signup_code_ok(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from start_codes
      where code = upper(trim(coalesce(p_code, ''))) and used_at is null and disabled_at is null and expires_at > now())
    or exists (
      select 1 from invites
      where code = upper(trim(coalesce(p_code, ''))) and used_at is null and revoked_at is null and expires_at > now());
$$;

-- アカウントを作る前に確かめる（auth.users に行が入る前）
create function signup_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not signup_code_ok(new.raw_user_meta_data ->> 'invite_code') then
    raise exception '招待コードか開始コードがないと、アカウントを作れません';
  end if;
  return new;
end $$;

create trigger users_signup_guard before insert on auth.users for each row execute function signup_guard();

revoke execute on function signup_code_ok(text) from public;
grant execute on function signup_code_ok(text) to anon, authenticated;
revoke execute on function signup_guard() from public, anon, authenticated;
