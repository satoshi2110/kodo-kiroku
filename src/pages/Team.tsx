/**
 * チーム（6.5、ワイヤーフレーム 4・13）。メンバーの一覧と、AI の あり／なし（9章）。
 * 招待・承認・役割の変更は、サーバー（Supabase）とログインができてから足す。
 */
import { useState } from 'react';
import { useApp } from '../state';
import { canExport, logExport, setAiEnabled } from '../db/repo';
import { buildCsv, downloadCsv, type CsvKind } from '../lib/csv';
import { toLocalDate } from '../lib/date';
import { AFFILIATION_LABEL, ROLE_LABEL } from '../db/types';
import { TopBar } from '../components/ui';

export default function Team() {
  const { person, members, me, userId, aiEnabled } = useApp();
  const [asking, setAsking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  if (!person || !userId) return null;
  const isAdmin = me?.role === 'admin';

  async function exportCsv(kind: CsvKind, label: string) {
    if (!person || !userId) return;
    downloadCsv(`${person.displayName}_${label}_${toLocalDate()}.csv`, await buildCsv(person, kind));
    await logExport(person.id, kind, userId);
  }

  async function turnOn() {
    if (!person || !userId) return;
    await setAiEnabled(person.id, true, userId);
    setAsking(false);
    setAgreed(false);
  }

  return (
    <div className="page">
      <TopBar title="チーム" sub={person.displayName} />
      <div className="section">
        <div className="card">
          <h2 className="card__title">メンバー（{members.length}人）</h2>
          {members.map((m) => (
            <div key={m.id} className="row row--between today-row">
              <span>
                {m.displayName}
                {m.userId === userId && <span className="muted">（あなた）</span>}
              </span>
              <span className="row">
                <span className="muted">{AFFILIATION_LABEL[m.affiliation]}</span>
                <span className="badge badge--role">{ROLE_LABEL[m.role]}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="help">ほかの人の招待は、サーバーとログインの準備ができてから使えるようになります。</p>
      </div>

      <div className="section">
        <div className="card stack">
          <div className="row row--between">
            <span className="label">AI による機能分析の補助</span>
            <span className={`badge ${aiEnabled ? 'badge--owner' : 'badge--role'}`}>{aiEnabled ? 'あり' : 'なし'}</span>
          </div>
          <p className="help">「なし」のときは、外の AI に何も送りません。記録・グラフ・共有はそのまま使えます。</p>
          {isAdmin && !aiEnabled && !asking && (
            <button type="button" className="btn btn--outline" onClick={() => setAsking(true)}>AI を「あり」にする</button>
          )}
          {isAdmin && asking && (
            <div className="stack">
              <span className="card__title">AI に送るものについて（下書き）</span>
              <p className="help">
                「AI で分析する」を押したときだけ、この行動の直近4週間の ABC記録と回数を、Anthropic 社（米国）の AI（Claude）に送ります。
                対象者は「対象者」、支援者は「支援者A」、場所は「場所A」のように名前を置きかえ、関わった人は所属（家族・施設の職員など）だけを送ります。写真は送りません。
                結果は AI による仮説で、診断ではありません。採否は管理者・副管理者・支援リーダーが決めます。
              </p>
              <label className="row">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 22, height: 22 }} />
                <span className="label">内容を読み、同意します</span>
              </label>
              <div className="grid-2">
                <button type="button" className="btn" onClick={() => setAsking(false)}>やめる</button>
                <button type="button" className="btn btn--primary" disabled={!agreed} onClick={turnOn}>「あり」にする</button>
              </div>
            </div>
          )}
          {isAdmin && aiEnabled && (
            <button type="button" className="btn" onClick={() => setAiEnabled(person.id, false, userId)}>AI を「なし」に戻す</button>
          )}
          {!isAdmin && <p className="help">切りかえは管理者が行います。</p>}
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">書き出し（CSV）</span>
          <p className="help">Excel などで開けるファイルを、この端末に保存します。写真と場所の位置は入りません。</p>
          {canExport(me?.role) ? (
            <>
              <button type="button" className="btn btn--outline" onClick={() => exportCsv('records', '記録とABC')}>記録とABC</button>
              <button type="button" className="btn btn--outline" onClick={() => exportCsv('observations', 'インターバル')}>インターバル・時間サンプリング</button>
              <button type="button" className="btn btn--outline" onClick={() => exportCsv('sleep', '睡眠')}>睡眠</button>
            </>
          ) : (
            <p className="help">書き出しは、管理者・副管理者・支援リーダーが行います。</p>
          )}
        </div>
      </div>
    </div>
  );
}
