-- AI の分析・提案の結果と採否を、チームで共有する（決定63・70）。
-- ・これまでは、結果も「採用した仮説・案」も、AI を動かした人の端末の中だけにあった。
--   ここでは結果を表に入れ、同じチームのメンバーが見られるようにする（閲覧者も結果と採否を見るだけはできる）。
-- ・入れるのは、AI に送った内容（仮名化したもの。写真は入っていない）と、AI が返した内容だけ。
-- ・分析・提案を入れられるのは支援者以上で、入れた人は自分（決定63）。
-- ・採否（採用／修正して採用／却下）を決められるのは管理者・副管理者・支援リーダー。決めるのは1回だけで、
--   決めた人と時刻はサーバーが書く。結果の中身は誰も書きかえられない。
-- ・消す権限は付けない。書き込みは監査ログにも残る（0010 の audit_row）。
-- 使い方: 0015 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- ---------- AI の分析（6.5） ----------
create table ai_analyses (
  id uuid primary key,
  person_id uuid not null references persons(id),
  behavior_id uuid not null references behaviors(id),
  requested_by uuid not null references auth.users(id),
  input jsonb not null,
  output jsonb,              -- null = データが足りないなどで結果が出なかった
  message text,
  model text,
  decision text check (decision in ('adopted', 'modified', 'rejected')),
  decision_note text not null default '',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
alter table ai_analyses enable row level security;
create policy ai_analyses_select on ai_analyses for select using (my_role(person_id) is not null);
-- 入れるのは支援者以上で、入れた人は自分。行動は同じ対象者のもの
create policy ai_analyses_insert on ai_analyses for insert
  with check (
    role_at_least(person_id, 'supporter') and requested_by = auth.uid()
    and exists (select 1 from behaviors b where b.id = behavior_id and b.person_id = ai_analyses.person_id)
  );
-- 書きかえ（採否を決める）は支援リーダー以上
create policy ai_analyses_update on ai_analyses for update
  using (role_at_least(person_id, 'leader')) with check (role_at_least(person_id, 'leader'));

-- ---------- AI の提案（6.6）。採用した仮説から作る ----------
create table ai_suggestions (
  id uuid primary key,
  person_id uuid not null references persons(id),
  analysis_id uuid not null references ai_analyses(id),
  requested_by uuid not null references auth.users(id),
  output jsonb not null,
  model text not null,
  decision text check (decision in ('adopted', 'modified', 'rejected')),
  decision_note text not null default '',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
alter table ai_suggestions enable row level security;
create policy ai_suggestions_select on ai_suggestions for select using (my_role(person_id) is not null);
-- 入れるのは支援者以上で、入れた人は自分。もとの分析は同じ対象者のもの
create policy ai_suggestions_insert on ai_suggestions for insert
  with check (
    role_at_least(person_id, 'supporter') and requested_by = auth.uid()
    and exists (select 1 from ai_analyses a where a.id = analysis_id and a.person_id = ai_suggestions.person_id)
  );
create policy ai_suggestions_update on ai_suggestions for update
  using (role_at_least(person_id, 'leader')) with check (role_at_least(person_id, 'leader'));

-- ---------- 決まり（2つの表で同じ） ----------
-- 新しく入れるとき: 支援リーダーより下の人が採否を付けて送っても、採否は空にする（端末で決めてから送った支援リーダー以上の分は残す）。
-- 書きかえるとき: 結果の中身・入れた人・消した印は変えられない。採否は、まだ決まっていないときに1回だけ決められる。
-- どちらも、決めた人と時刻はサーバーが書く。同じ内容の送り直しはそのまま通す
create function ai_result_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb;
  k text;
begin
  if tg_op = 'INSERT' then
    if new.decision is null or not role_at_least(new.person_id, 'leader') then
      new.decision := null;
      new.decision_note := '';
      new.decided_by := null;
      new.decided_at := null;
    else
      new.decided_by := auth.uid();
      new.decided_at := clock_timestamp();
    end if;
    return new;
  end if;
  o := to_jsonb(old);
  foreach k in array array['behavior_id', 'analysis_id', 'requested_by', 'input', 'output', 'message', 'model', 'deleted_at'] loop
    if n ? k and (n -> k) is distinct from (o -> k) then
      return null;
    end if;
  end loop;
  if new.decision is not distinct from old.decision and new.decision_note is not distinct from old.decision_note then
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
    return new;
  end if;
  if old.decision is null and new.decision is not null and role_at_least(new.person_id, 'leader') then
    new.decided_by := auth.uid();
    new.decided_at := clock_timestamp();
    return new;
  end if;
  return null;
end $$;

create trigger ai_analyses_rules before insert or update on ai_analyses for each row execute function ai_result_guard();
create trigger ai_analyses_sync before insert or update on ai_analyses for each row execute function sync_guard();
create trigger ai_analyses_audit after insert or update on ai_analyses for each row execute function audit_row();
create trigger ai_suggestions_rules before insert or update on ai_suggestions for each row execute function ai_result_guard();
create trigger ai_suggestions_sync before insert or update on ai_suggestions for each row execute function sync_guard();
create trigger ai_suggestions_audit after insert or update on ai_suggestions for each row execute function audit_row();

-- ---------- 権限（ログインした人だけ。消す権限は付けない） ----------
revoke all on ai_analyses, ai_suggestions from anon, authenticated;
grant select, insert, update on ai_analyses, ai_suggestions to authenticated;
