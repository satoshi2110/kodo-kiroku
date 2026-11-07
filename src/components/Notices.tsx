/**
 * 画面の知らせ（6.11、決定101・106・107）。【暫定】（2026-11-07 の試作）
 * メールもアプリの通知（プッシュ）も使わず、アプリを開いているときに画面の上に出すだけ。
 * オン・オフは「あなたの設定」で、この端末だけに残す（共用の端末では、使う人みんなに同じ設定）。
 * - 記録のリマインド: 決めた時刻（はじめは 17:30）を過ぎても、その日の記録（行動・観察・「観察していない日」）がないとき
 * - 支援計画の見直し日: 見直し日の前の日の 9:00 から、「確かめた」を押すまで
 * - コメントで @ で呼ばれたとき（MentionBanner）
 * - 参加した会議のメモができたとき（ほかの人が書いたもの。直近14日の分）
 * 強度3や身体拘束の記録が入っても知らせない（決定52）。睡眠の入力も催促しない。
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canRecord, saveDevice } from '../db/repo';
import { useApp } from '../state';
import { addDays, formatDateJa, formatDateTimeJa, toLocalDate } from '../lib/date';
import type { DeviceSetting, NotifyPrefs } from '../db/types';
import { MentionBanner } from './Comments';

export const DEFAULT_REMINDER = '17:30';
const MEETING_DAYS = 14;

/** なし = オン */
export function prefsOf(dev?: DeviceSetting | null): Required<NotifyPrefs> {
  const n = dev?.notify ?? {};
  return {
    reminder: n.reminder !== false,
    reminderTime: n.reminderTime || DEFAULT_REMINDER,
    review: n.review !== false,
    mention: n.mention !== false,
    meeting: n.meeting !== false,
  };
}

/** 1分ごとに描き直す（時刻で出る知らせのため） */
function useMinute() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
}

const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function Notices() {
  const dev = useLiveQuery(() => db.device.get('device'), []);
  useMinute();
  if (dev === undefined) return null;
  const p = prefsOf(dev);
  return (
    <>
      {p.reminder && <ReminderBanner dev={dev} time={p.reminderTime} />}
      {p.review && <ReviewBanner dev={dev} />}
      {p.mention && <MentionBanner />}
      {p.meeting && <MeetingBanner dev={dev} />}
    </>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="notice-bar" role="status">
        {children}
      </div>
    </div>
  );
}

function ReminderBanner({ dev, time }: { dev: DeviceSetting | null | undefined; time: string }) {
  const { person, me } = useApp();
  const personId = person?.id;
  const today = toLocalDate();
  const due = hhmm() >= time;
  const off = !!personId && dev?.reminderOff?.[personId] === today;
  const has = useLiveQuery(async () => {
    if (!personId || !due || off) return true;
    const key = [personId, today];
    const live = <T extends { deletedAt: string | null }>(x: T) => !x.deletedAt;
    return (
      (await db.events.where('[personId+localDate]').equals(key).filter(live).count()) > 0 ||
      (await db.observations.where('[personId+localDate]').equals(key).filter(live).count()) > 0 ||
      (await db.notObservedDays.where('[personId+localDate]').equals(key).filter(live).count()) > 0
    );
  }, [personId, today, due, off]);
  if (!personId || !canRecord(me?.role) || has !== false) return null;
  return (
    <Box>
      <span>今日（{formatDateJa(today)}）の記録は、まだありません。記録し忘れがないか確かめましょう。</span>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Link className="btn btn--sm btn--outline" to="/">記録する</Link>
        <button type="button" className="btn btn--sm" onClick={() => void saveDevice({ reminderOff: { ...dev?.reminderOff, [personId]: today } })}>
          今日は出さない
        </button>
      </div>
    </Box>
  );
}

function ReviewBanner({ dev }: { dev: DeviceSetting | null | undefined }) {
  const { person } = useApp();
  const personId = person?.id;
  const plan = useLiveQuery(async () => (personId ? (await db.supportPlans.where('personId').equals(personId).filter((x) => !x.deletedAt).first()) ?? null : null), [personId]);
  const review = (plan?.activeContent ?? plan?.content)?.reviewDate;
  if (!personId || !review) return null;
  const today = toLocalDate();
  // 前の日の 9:00 から
  const from = addDays(review, -1);
  if (today < from || (today === from && hhmm() < '09:00')) return null;
  if (dev?.reviewSeen?.[personId] === review) return null;
  return (
    <Box>
      <span>
        支援計画の見直し日（{formatDateJa(review)}）{review < today ? 'を過ぎています' : review === today ? 'は今日です' : 'は明日です'}。グラフと達成基準を見比べて、続けるか・広げるか・直すかを話し合いましょう。
      </span>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Link className="btn btn--sm btn--outline" to="/plan">支援計画を見る</Link>
        <button type="button" className="btn btn--sm" onClick={() => void saveDevice({ reviewSeen: { ...dev?.reviewSeen, [personId]: review } })}>
          確かめた
        </button>
      </div>
    </Box>
  );
}

function MeetingBanner({ dev }: { dev: DeviceSetting | null | undefined }) {
  const { person, me, userId, members } = useApp();
  const personId = person?.id;
  const seen = (personId && dev?.meetingSeenAt?.[personId]) || '';
  const since = new Date(Date.now() - MEETING_DAYS * 86_400_000).toISOString();
  const myId = me?.id;
  const list = useLiveQuery(
    async () =>
      personId && myId && userId
        ? (
            await db.meetingNotes
              .where('personId')
              .equals(personId)
              .filter((m) => !m.deletedAt && m.recorderId !== userId && m.participantIds.includes(myId) && m.createdAt > seen && m.createdAt > since)
              .toArray()
          ).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [personId, myId, userId, seen, since.slice(0, 13)],
  );
  if (!personId || !list || list.length === 0) return null;
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '退会したメンバー';
  const latest = list[0].createdAt;
  return (
    <Box>
      <span>あなたが参加した会議のメモができました:</span>
      {list.slice(0, 3).map((m) => (
        <Link key={m.id} to={`/meetings/${m.id}`} style={{ display: 'block' }}>
          {formatDateTimeJa(m.heldAt)} の会議（{nameOf(m.recorderId)}さんが記録）
        </Link>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn--sm" onClick={() => void saveDevice({ meetingSeenAt: { ...dev?.meetingSeenAt, [personId]: latest } })}>
          確かめた
        </button>
      </div>
    </Box>
  );
}
