-- 閲覧の記録と、書き出しの見張り（7.4.2 #6・6.11。決定102・103）。
-- ・閲覧の記録: 「誰が・どの日に・このチームを開いたか」を、1人1チーム1日に1行だけ残す（決定102）。どの画面を見たかは残さない。
--   日付は日本の時刻で数える。書くのは record_view からだけ。見られるのは、監査ログと同じく支援リーダー以上。
--   誰にも書きかえ・削除できない（チームの削除［0023］のときだけ消す）。
-- ・書き出しの見張り: 1人が1日（日本の時刻）に3回以上 CSV を書き出したら、管理者の画面に知らせる（決定103）。
--   数えるのは、端末が送ってきた書き出しの監査ログ（action = 'export'）。直近30日の分を、管理者だけが読める。
-- 使い方: 0021 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

create table view_days (
  person_id uuid not null references persons(id),
  user_id uuid not null references auth.users(id),
  local_date date not null,
  first_at timestamptz not null default now(),
  primary key (person_id, user_id, local_date)
);
alter table view_days enable row level security;
create policy view_days_select on view_days for select using (role_at_least(person_id, 'leader'));

-- このチームを開いた（その日の2回目からは何もしない）
create function record_view(p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'ログインしていません'; end if;
  if my_role(p_person) is null then raise exception 'このチームのメンバーではありません'; end if;
  insert into view_days (person_id, user_id, local_date)
    values (p_person, auth.uid(), (now() at time zone 'Asia/Tokyo')::date)
    on conflict do nothing;
end $$;

-- 書き出しの多い日（直近30日、1人1日3回以上）。管理者だけ
create function export_alerts(p_person uuid) returns table (user_id uuid, local_date date, exports int, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role(p_person) is distinct from 'admin' then raise exception '書き出しの知らせを見られるのは管理者だけです'; end if;
  return query
    select a.actor_id, (a.at at time zone 'Asia/Tokyo')::date, count(*)::int, max(a.at)
    from audit_logs a
    where a.person_id = p_person and a.action = 'export' and a.at > now() - interval '30 days'
    group by a.actor_id, (a.at at time zone 'Asia/Tokyo')::date
    having count(*) >= 3
    order by 2 desc, 1;
end $$;

revoke all on view_days from anon, authenticated;
grant select on view_days to authenticated;
revoke execute on function record_view(uuid), export_alerts(uuid) from public, anon;
grant execute on function record_view(uuid), export_alerts(uuid) to authenticated;
