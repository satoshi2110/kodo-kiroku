/**
 * 閲覧の記録と、書き出しの見張り（決定102・103）。【暫定】（2026-11-07 の試作）サーバーは 0022。
 * - 閲覧の記録: チームを開いた日を、1人1チーム1日に1回だけサーバーに残す（どの画面を見たかは残さない）
 * - 書き出しの見張り: 1人が1日に3回以上書き出した日を、管理者の画面に知らせる（数えるのはサーバー）
 */
import { getDevice, saveDevice } from '../db/repo';
import { toLocalDate } from '../lib/date';
import { supabase } from './supabase';

/** このチームを開いた。きょうまだ送っていなければ送る（通信できなかったら、次にもう一度） */
export async function recordView(personId: string): Promise<void> {
  if (!supabase) return;
  const today = toLocalDate();
  const d = await getDevice();
  if (d.viewedOn?.[personId] === today) return;
  const { error } = await supabase.rpc('record_view', { p_person: personId });
  if (error) return;
  const now = await getDevice();
  await saveDevice({ viewedOn: { ...now.viewedOn, [personId]: today } });
}

export interface ExportAlert {
  userId: string;
  localDate: string;
  exports: number;
  lastAt: string;
}

/** 書き出しの多い日（直近30日）。管理者でないとき・通信できないときは null */
export async function exportAlerts(personId: string): Promise<ExportAlert[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('export_alerts', { p_person: personId });
  if (error || !data) return null;
  return (data as { user_id: string; local_date: string; exports: number; last_at: string }[]).map((r) => ({
    userId: r.user_id,
    localDate: r.local_date,
    exports: r.exports,
    lastAt: r.last_at,
  }));
}

export interface ViewDay {
  userId: string;
  localDate: string;
  firstAt: string;
}

/** このチームを開いた日の一覧（直近30日。支援リーダー以上が読める） */
export async function listViewDays(personId: string, since: string): Promise<ViewDay[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('view_days')
    .select('user_id, local_date, first_at')
    .eq('person_id', personId)
    .gte('local_date', since)
    .order('local_date', { ascending: false })
    .order('first_at');
  if (error || !data) return null;
  return data.map((r) => ({ userId: r.user_id, localDate: r.local_date, firstAt: r.first_at }));
}
