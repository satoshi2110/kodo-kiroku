/**
 * サーバー（Supabase、決定59）への接続。
 * .env に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY がないときは null になり、アプリは今までどおり端末の中だけで動く。
 * 画面側に置くのは anon（publishable）key だけ。service_role key は絶対に置かない（CLAUDE.md）。
 * チームの分離はサーバーの行レベルセキュリティ（RLS）で強制する（決定45）。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key && !url.includes('xxxxxxxx') ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/** サーバーにつながる設定があるか（ログインと共有を使うか） */
export const serverEnabled = supabase !== null;
