/**
 * 書き出しの見張り（決定103）。【暫定】（2026-11-07 の試作）
 * 1人が1日に3回以上 CSV を書き出した日があれば、管理者の画面の上に知らせる（数えるのはサーバー、0022）。
 * あわせて、チームを開いた日を閲覧の記録としてサーバーに残す（決定102。1日1回）。
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { saveDevice } from '../db/repo';
import { useApp } from '../state';
import { formatDateJa } from '../lib/date';
import { exportAlerts, recordView, type ExportAlert } from '../server/views';

const RETRY_MS = 5 * 60_000;

/** チームを開いた日を残す（送れなかったら5分ごとにもう一度） */
export function useRecordView() {
  const { person } = useApp();
  const id = person && !person.isSample ? person.id : null;
  useEffect(() => {
    if (!id) return;
    void recordView(id);
    const t = setInterval(() => void recordView(id), RETRY_MS);
    return () => clearInterval(t);
  }, [id]);
}

export function ExportAlertBanner() {
  const { person, me, members } = useApp();
  const dev = useLiveQuery(() => db.device.get('device'), []);
  const [alerts, setAlerts] = useState<ExportAlert[]>([]);
  const id = person && !person.isSample && me?.role === 'admin' ? person.id : null;
  useEffect(() => {
    setAlerts([]);
    if (!id) return;
    let stop = false;
    void exportAlerts(id).then((a) => !stop && setAlerts(a ?? []));
    return () => {
      stop = true;
    };
  }, [id]);

  if (!id) return null;
  const seen = dev?.exportAlertSeen?.[id] ?? '';
  const fresh = alerts.filter((a) => a.lastAt > seen);
  if (fresh.length === 0) return null;
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '退会したメンバー';
  const latest = fresh.reduce((m, a) => (a.lastAt > m ? a.lastAt : m), seen);
  return (
    <div className="section" style={{ paddingBottom: 0 }}>
      <div className="notice-inline stack" role="status" style={{ margin: 0, gap: 8 }}>
        <span>
          記録の書き出しが多い日がありました（1日3回以上）:{' '}
          {fresh.map((a) => `${formatDateJa(a.localDate, false)} ${nameOf(a.userId)}さん ${a.exports}回`).join('、')}。
          心当たりがなければ、本人に確かめ、必要ならその人を停止してください。
        </span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => void saveDevice({ exportAlertSeen: { ...dev?.exportAlertSeen, [id]: latest } })}
          >
            確かめた
          </button>
          <Link className="btn btn--sm btn--outline" to="/team/audit">監査ログを見る</Link>
        </div>
      </div>
    </div>
  );
}
