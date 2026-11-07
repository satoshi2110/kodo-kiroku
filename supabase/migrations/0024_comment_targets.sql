-- 記録・グラフ・支援計画へのコメントと @メンション（6.10。決定105）。【暫定】（2026-11-07 の試作）
-- ・コメントを付けられるところに、記録（target = 'event'、target_id は記録の id）、グラフ（'graph'）、支援計画（'plan'）を足す。
--   グラフと支援計画は、申し送り（'team'）と同じく、チームに1つの欄（target_id は空）。
-- ・@ で呼んだ人を mentions（ユーザーの id の並び）に残す。呼べるのは同じチームのメンバーだけ（20人まで）。
--   書いたあとは、文と同じく変えられない。知らせはアプリを開いたときに画面に出すだけ（決定101）。
-- 使い方: 0023 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

alter table comments add column mentions uuid[] not null default '{}';

alter table comments drop constraint comments_target_check;
alter table comments add constraint comments_target_check check (target in ('team', 'meeting', 'event', 'graph', 'plan'));

drop policy comments_insert on comments;
create policy comments_insert on comments for insert
  with check (
    role_at_least(person_id, 'supporter') and author_id = auth.uid()
    and (
      (target in ('team', 'graph', 'plan') and target_id is null)
      or (target = 'meeting' and exists (select 1 from meeting_notes m where m.id = target_id and m.person_id = comments.person_id))
      or (target = 'event' and exists (select 1 from events e where e.id = target_id and e.person_id = comments.person_id))
    )
    and cardinality(mentions) <= 20
    and not exists (
      select 1 from unnest(mentions) u
      where not exists (select 1 from team_members t where t.person_id = comments.person_id and t.user_id = u and t.deleted_at is null)
    )
  );

-- 書いた中身（文・付けた先・呼んだ人）は変えられない（消すことだけができる）
create or replace function comment_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.text is distinct from old.text or new.target is distinct from old.target
     or new.target_id is distinct from old.target_id or new.mentions is distinct from old.mentions then
    return null;
  end if;
  return new;
end $$;
