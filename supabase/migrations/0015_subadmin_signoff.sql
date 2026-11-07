-- 副管理者が管理者の代わりに計画の変更を「実施中」にする（決定68）。
-- ・0003 では、試作として「実施中にできるのは管理者だけ」にしていた。決定68 は
--   「管理者が操作できないときや引き継ぎ中は副管理者でもよい」なので、副管理者にも同じことを許す。
-- ・「操作できないとき」かどうかはサーバーでは分からないので、使うかどうかは副管理者が判断する。
--   画面では、ふだんの合意とは別のボタン（管理者の代わりに合意する）にし、だれが代わったかを変更の行（closed_by）に残す。
--   書き込みは監査ログにも残る（0010 のトリガー）。
-- ・支援リーダー以下はこれまでどおり実施中にできない。
-- 使い方: 0014 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。

-- 計画の「実施中の内容」を変えられるのは管理者と副管理者だけ
create or replace function plan_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(my_role(new.person_id)::text, '') not in ('admin', 'subadmin') then
    if tg_op = 'INSERT' then
      new.active_content := null;
      new.active_since := null;
    else
      new.active_content := old.active_content;
      new.active_since := old.active_since;
    end if;
  end if;
  return new;
end $$;

-- 状態の進み方（0003 と同じ。実施中にする・過去にするを、副管理者にも許す）:
--   合意待ち → 実施中（管理者か副管理者）／取り下げ（保存した人か管理者・副管理者）／置きかわった（次の変更の保存）
--   実施中 → 過去（管理者か副管理者が次の変更を実施中にしたとき）
create or replace function plan_change_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  r member_role := my_role(new.person_id);
begin
  if new.reason is distinct from old.reason or new.before is distinct from old.before
     or new.after is distinct from old.after or new.fields is distinct from old.fields
     or new.signer_member_ids is distinct from old.signer_member_ids then
    return null;
  end if;
  if new.status = old.status then
    if new.active_since is distinct from old.active_since or new.closed_by is distinct from old.closed_by then
      return null;
    end if;
    return new;
  end if;
  if old.status = 'pending' and new.status = 'active' and r in ('admin', 'subadmin') then return new; end if;
  if old.status = 'active' and new.status = 'past' and r in ('admin', 'subadmin') then return new; end if;
  if old.status = 'pending' and new.status = 'withdrawn'
     and (old.saved_by = auth.uid() or r in ('admin', 'subadmin')) then return new; end if;
  if old.status = 'pending' and new.status = 'superseded' then return new; end if;
  return null;
end $$;

-- 端末で保存と実施中を続けて行い、まだ送っていないときは、実施中の変更として新しく送られる。
-- そのときも、実施中・過去として送れるのは管理者と副管理者だけ
drop policy changes_insert on plan_changes;
create policy changes_insert on plan_changes for insert
  with check (
    role_at_least(person_id, 'leader') and saved_by = auth.uid()
    and (status not in ('active', 'past') or my_role(person_id) in ('admin', 'subadmin'))
  );
