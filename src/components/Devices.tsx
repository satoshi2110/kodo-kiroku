/**
 * 端末の一覧と遠隔ログアウト、新しい端末からのログインの知らせ（7.4.2 #1・#5、決定62・決定101）。【暫定】（2026-11-07 の試作）
 * - NewDeviceBanner: 同じアカウントで新しい端末からログインがあったとき、画面の上に出す
 * - DeviceList: 「あなたの設定」（自分の端末）と、チームのメンバーの画面（管理者・副管理者・支援リーダー）で使う
 * 止めるのはサーバー（0021）。遠隔ログアウトしたログインでは、その端末がつながっていなくても、チームのデータを読めない・書けない。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatDateTimeJa } from '../lib/date';
import { dismissNewDevices, listDevices, requestLogout, useNewDevices, type DeviceRow } from '../server/devices';

export function NewDeviceBanner() {
  const list = useNewDevices();
  if (list.length === 0) return null;
  return (
    <div className="section" style={{ paddingBottom: 0 }}>
      <div className="notice-inline stack" role="status" style={{ margin: 0, gap: 8 }}>
        <span>
          あなたのアカウントに、新しい端末からログインがありました:{' '}
          {list.map((d) => `${d.label}（${formatDateTimeJa(d.createdAt)}）`).join('、')}。
          心当たりがなければ、「あなたの設定」でその端末をログアウトし、パスワードを変えてください。
        </span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--sm" onClick={() => void dismissNewDevices()}>心当たりがある</button>
          <Link className="btn btn--sm btn--outline" to="/me">端末を確かめる</Link>
        </div>
      </div>
    </div>
  );
}

/**
 * ある人の、ログインしている端末の一覧。
 * personId: チームの立場で（ほかの人の端末を）ログアウトさせるとき。自分の端末なら渡さない。
 */
export function DeviceList({ userId, personId, mine, canLogout }: { userId: string; personId?: string; mine: boolean; canLogout: boolean }) {
  const dev = useLiveQuery(() => db.device.get('device'), []);
  const [rows, setRows] = useState<DeviceRow[] | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => setRows(await listDevices(userId)), [userId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (rows === undefined) return <span className="muted">端末を読み込んでいます…</span>;
  if (rows === null) return <span className="muted">端末の一覧を読み込めませんでした（通信を確かめてください）。</span>;
  const thisId = mine ? dev?.deviceId : undefined;

  async function logout(r: DeviceRow) {
    const who = mine ? 'この端末' : 'この人のこの端末';
    if (!window.confirm(`${who}（${r.label}）をログアウトさせますか？\nすぐにその端末からチームのデータが読めなくなり、次にその端末がつながったときに、端末の中のデータを消します。その端末でまだ送れていない変更は消えます。`)) return;
    setBusy(true);
    setError('');
    const e = await requestLogout(r.deviceId, r.userId, mine ? undefined : personId);
    await reload();
    setBusy(false);
    if (e) setError(`できませんでした（${e}）`);
  }

  if (rows.length === 0) return <span className="muted">サーバーに残っている端末はありません。</span>;
  return (
    <div className="stack">
      {rows.map((r) => (
        <div key={r.deviceId} className="today-row stack" style={{ gap: 4 }}>
          <span>
            <strong>{r.label || '端末'}</strong>
            {r.shared && '（共用の端末）'}
            {r.deviceId === thisId && ' ・ いま使っている端末'}
          </span>
          <span className="muted">
            最後の通信 {formatDateTimeJa(r.lastSeenAt)} ・ 初めてのログイン {formatDateTimeJa(r.createdAt)}
          </span>
          {r.logoutRequestedAt ? (
            <span className="muted">{formatDateTimeJa(r.logoutRequestedAt)} に遠隔ログアウトしました（データを消すのは、その端末が次につながったとき）。</span>
          ) : (
            canLogout &&
            r.deviceId !== thisId && (
              <button type="button" className="btn btn--outline btn--block" disabled={busy} onClick={() => void logout(r)}>
                この端末をログアウトさせる
              </button>
            )
          )}
        </div>
      ))}
      {error && <p className="ai-error" role="alert">{error}</p>}
    </div>
  );
}
