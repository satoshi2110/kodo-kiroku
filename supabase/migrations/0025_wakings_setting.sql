-- 睡眠の「中途覚醒」を使う・使わないの設定（決定115）。対象者（チーム）ごと
-- 使い方: 0024 のあとに、Supabase の SQL Editor にこのファイルの中身を全部貼り付けて Run する。
-- null = 使う（初期設定）、false = 使わない。変えられるのは今の team_settings の決まりのまま（管理者・副管理者）
alter table team_settings add column wakings_enabled boolean;
