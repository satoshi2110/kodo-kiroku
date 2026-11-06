-- 役割の変更と停止（7章 #2、6.9 の「招待・権限」）。
-- これまでの決まり（管理者・副管理者にかかわる変更は管理者だけ、管理者の役割は変えられない）に、
-- 「自分で自分を停止・削除できない」を足す。
-- 管理者が自分を停止すると、ほかに管理者の行を直せる人がいないため、チームが元に戻せなくなるのを防ぐ。
create or replace function members_rules() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.role in ('admin', 'subadmin') or old.role in ('admin', 'subadmin'))
     and (new.role, new.approved_at, new.suspended_at, new.deleted_at)
         is distinct from (old.role, old.approved_at, old.suspended_at, old.deleted_at)
     and my_role(old.person_id) is distinct from 'admin' then
    raise exception '管理者・副管理者にかかわる変更は管理者だけができます';
  end if;
  if old.role = 'admin' and new.role is distinct from 'admin' then
    raise exception '管理者の引き継ぎは、まだこの方法ではできません';
  end if;
  if old.user_id = auth.uid()
     and (new.suspended_at, new.deleted_at) is distinct from (old.suspended_at, old.deleted_at) then
    raise exception '自分を停止・削除することはできません';
  end if;
  return new;
end $$;
