-- 招待コードの期限を、仕様書どおり 72時間にする（仕様書 7章 #3・8章 Invite・14.2 #26）。
-- 0001 では【暫定】で 7日にしていた。0001〜0006 を流したあとに、SQL Editor でこのファイルを1回だけ流す。

-- これから作る招待コード
alter table invites alter column expires_at set default now() + interval '72 hours';

-- もう作ってあって、まだ使われていないもの（作ってから 72時間を過ぎていれば、その場で期限切れになる）
update invites
set expires_at = least(expires_at, created_at + interval '72 hours')
where used_at is null;
