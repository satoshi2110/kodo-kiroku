-- 支援者の提案と、行動の定義の変更の記録（2026-11-07 の試作、【暫定】）。
-- ・支援者の提案（5章の役割の表「行動定義: 提案」「支援計画編集: 提案」）:
--   支援者以上が、行動の定義や支援計画について、文で提案を出す。入れた人は自分。
--   採用・見送りを決められるのは管理者・副管理者・支援リーダーで、決めるのは1回だけ。決めた人と時刻はサーバーが書く。
--   採用しても、行動や計画は自動では変わらない（採用した人が編集して反映する）。提案の文は誰も書きかえられない。
-- ・行動の定義の変更の記録（6.2「定義の変更は履歴を残し、グラフに注記を入れる」）:
--   記録がある行動の、定義・例・含まないもの・測り方・強度の基準を変えたときに、端末が1行足す（変えた項目の名前だけ）。
--   入れられるのは行動を直せる人（支援リーダー以上）で、入れた人は自分。あとから変えられない。
-- ・どちらも消す権限は付けない。書き込みは監査ログにも残る（0010 の audit_row）。
-- 使い方: 0016 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- ---------- 支援者の提案 ----------
create table proposals (
  id uuid primary key,
  person_id uuid not null references persons(id),
  kind text not null check (kind in ('behavior', 'plan')),
  behavior_id uuid references behaviors(id),   -- kind = 'behavior' のときの行動。計画は1つなので plan のときは空
  proposed_by uuid not null references auth.users(id),
  body text not null check (length(body) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'adopted', 'rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp(),
  check ((kind = 'behavior') = (behavior_id is not null))
);
alter table proposals enable row level security;
create policy proposals_select on proposals for select using (my_role(person_id) is not null);
-- 入れるのは支援者以上で、入れた人は自分。行動は同じ対象者のもの
create policy proposals_insert on proposals for insert
  with check (
    role_at_least(person_id, 'supporter') and proposed_by = auth.uid()
    and (behavior_id is null or exists (select 1 from behaviors b where b.id = behavior_id and b.person_id = proposals.person_id))
  );
-- 書きかえ（採用・見送りを決める）は支援リーダー以上
create policy proposals_update on proposals for update
  using (role_at_least(person_id, 'leader')) with check (role_at_least(person_id, 'leader'));

-- 新しく入れるとき: だれが送っても「まだ決めていない」にする（決めるのは入ったあと）。
-- 書きかえるとき: 種類・行動・入れた人・文・消した印は変えられない。決めるのは、まだのときに1回だけ（支援リーダー以上）。
-- 決めた人と時刻はサーバーが書く。同じ内容の送り直しはそのまま通す
create function proposals_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb;
  k text;
begin
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.decided_by := null;
    new.decided_at := null;
    new.deleted_at := null;
    return new;
  end if;
  o := to_jsonb(old);
  foreach k in array array['kind', 'behavior_id', 'proposed_by', 'body', 'deleted_at'] loop
    if (n -> k) is distinct from (o -> k) then
      return null;
    end if;
  end loop;
  if new.status = old.status then
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
    return new;
  end if;
  if old.status = 'open' and new.status in ('adopted', 'rejected') and role_at_least(new.person_id, 'leader') then
    new.decided_by := auth.uid();
    new.decided_at := clock_timestamp();
    return new;
  end if;
  return null;
end $$;

create trigger proposals_rules before insert or update on proposals for each row execute function proposals_guard();
create trigger proposals_sync before insert or update on proposals for each row execute function sync_guard();
create trigger proposals_audit after insert or update on proposals for each row execute function audit_row();

-- ---------- 行動の定義の変更の記録（追記だけ） ----------
create table behavior_revisions (
  id uuid primary key,
  person_id uuid not null references persons(id),
  behavior_id uuid not null references behaviors(id),
  user_id uuid not null references auth.users(id),   -- 変えた人
  fields text[] not null check (cardinality(fields) between 1 and 20),  -- 変えた項目の名前（definition など）
  created_at timestamptz not null default now(),       -- 変えた時刻（端末の時刻。電波がないときに変えた分もその日に出す）
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default clock_timestamp()
);
alter table behavior_revisions enable row level security;
create policy behavior_revisions_select on behavior_revisions for select using (my_role(person_id) is not null);
create policy behavior_revisions_insert on behavior_revisions for insert
  with check (
    role_at_least(person_id, 'leader') and user_id = auth.uid() and deleted_at is null
    and exists (select 1 from behaviors b where b.id = behavior_id and b.person_id = behavior_revisions.person_id)
  );
-- 書きかえる・消す決まりは作らない（追記だけ）
create trigger behavior_revisions_sync before insert on behavior_revisions for each row execute function sync_guard();
create trigger behavior_revisions_audit after insert on behavior_revisions for each row execute function audit_row();

-- ---------- 権限（ログインした人だけ。消す権限は付けない） ----------
revoke all on proposals, behavior_revisions from anon, authenticated;
grant select, insert, update on proposals to authenticated;
grant select, insert on behavior_revisions to authenticated;
