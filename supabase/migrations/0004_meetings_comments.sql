-- 支援会議メモと、申し送り・会議メモへのコメント（6.10）
-- 使い方: 0003 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- ---------- 共通の決まり: あとから変えられない列に author_id を足す ----------
create or replace function sync_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if new.updated_at < old.updated_at then
      return null;
    end if;
    foreach k in array array['person_id', 'user_id', 'recorder_id', 'event_id', 'created_by', 'plan_id', 'saved_by', 'change_id', 'member_id', 'author_id'] loop
      if k = any(tg_argv) then continue; end if;
      if n ? k and (n ->> k) is distinct from (o ->> k) then
        raise exception '% は変えられません', k;
      end if;
    end loop;
    new.created_at := old.created_at;
  end if;
  new.server_at := clock_timestamp();
  return new;
end $$;

-- ---------- 支援会議メモ ----------
create table meeting_notes (
  id uuid primary key,
  person_id uuid not null references persons(id),
  held_at timestamptz not null,
  place text not null default '',
  participant_ids uuid[] not null default '{}',
  other_participants text not null default '',
  charts jsonb not null default '[]',
  results text not null default '',
  decisions text not null default '',
  next_review date,
  plan_snapshot jsonb,
  recorder_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
alter table meeting_notes enable row level security;
create policy meetings_select on meeting_notes for select using (my_role(person_id) is not null);
-- 書くのは支援者以上。直すのは書いた人と、管理者・副管理者・支援リーダー
create policy meetings_insert on meeting_notes for insert
  with check (role_at_least(person_id, 'supporter') and recorder_id = auth.uid());
create policy meetings_update on meeting_notes for update
  using ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'))
  with check ((recorder_id = auth.uid() and role_at_least(person_id, 'supporter')) or role_at_least(person_id, 'leader'));

-- 日時と、会議の日に残したグラフ・支援計画は、保存したあと変わらない（6.10）
create function meeting_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.held_at := old.held_at;
  new.charts := old.charts;
  new.plan_snapshot := old.plan_snapshot;
  return new;
end $$;
create trigger meetings_sync before insert or update on meeting_notes for each row execute function sync_guard();
create trigger meetings_rules before update on meeting_notes for each row execute function meeting_guard();

-- ---------- 申し送り（target = 'team'）と会議メモへのコメント（target = 'meeting'） ----------
create table comments (
  id uuid primary key,
  person_id uuid not null references persons(id),
  target text not null check (target in ('team', 'meeting')),
  target_id uuid,
  text text not null,
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
alter table comments enable row level security;
create policy comments_select on comments for select using (my_role(person_id) is not null);
-- 書くのは支援者以上で、書いた人は自分。会議メモへのコメントは、同じ対象者の会議メモにだけ付けられる
create policy comments_insert on comments for insert
  with check (
    role_at_least(person_id, 'supporter') and author_id = auth.uid()
    and (
      (target = 'team' and target_id is null)
      or (target = 'meeting' and exists (select 1 from meeting_notes m where m.id = target_id and m.person_id = comments.person_id))
    )
  );
-- 消せる（論理削除）のは書いた人だけ
create policy comments_update on comments for update
  using (author_id = auth.uid() and my_role(person_id) is not null)
  with check (author_id = auth.uid() and my_role(person_id) is not null);

-- 書いた中身は変えられない（消すことだけができる）
create function comment_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.text is distinct from old.text or new.target is distinct from old.target
     or new.target_id is distinct from old.target_id then
    return null;
  end if;
  return new;
end $$;
create trigger comments_sync before insert or update on comments for each row execute function sync_guard();
create trigger comments_rules before update on comments for each row execute function comment_guard();

-- ---------- 権限（ログインした人だけ。消す権限は付けない） ----------
revoke all on meeting_notes, comments from anon, authenticated;
grant select, insert, update on meeting_notes, comments to authenticated;
