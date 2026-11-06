/**
 * チームの設定（画面一覧 13・16、ワイヤーフレーム 13）。変えられるのは管理者と副管理者（AI とチームの削除は管理者だけ）。
 * 多要素認証と書き出しのメールは、このあと足す。身体拘束の見直しの目安は Phase 2。
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import RestraintThreshold from '../components/RestraintThreshold';
import { AI_LIMITS, aiUsage, canEditTeamSettings, canExport, logExport, setAiEnabled, TEAM_DELETE_DAYS, updateTeamSetting } from '../db/repo';
import { useApp } from '../state';
import { buildCsv, downloadCsv, type CsvKind } from '../lib/csv';
import { addDays, formatDateJa, localDateOf, nowISO, toLocalDate } from '../lib/date';
import { Chip, TopBar } from '../components/ui';
import { serverEnabled } from '../server/supabase';

export default function TeamSettings() {
  const { person, me, members, userId, aiEnabled, shortSleepUnderHours, deleteRequestedAt } = useApp();
  const [asking, setAsking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const personId = person?.id ?? '';
  const usage = useLiveQuery(async () => (userId ? aiUsage(userId, me?.role) : null), [userId, me?.role]);
  const aiConsent = useLiveQuery(
    async () =>
      personId
        ? (await db.consents.where('personId').equals(personId).toArray())
            .filter((c) => c.kind === 'ai_overseas' && !c.revokedAt)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
        : null,
    [personId, aiEnabled],
  );

  if (!person || !userId) return null;
  const isAdmin = me?.role === 'admin';
  const editable = canEditTeamSettings(me?.role);
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '（不明）';
  const admins = members.filter((m) => m.role === 'admin' || m.role === 'subadmin').map((m) => m.displayName).join('・');

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

  async function requestDelete() {
    if (!person || !userId) return;
    if (!window.confirm(`チーム「${person.displayName}」の削除を申し込みますか？ ${TEAM_DELETE_DAYS}日間は取り消せます。そのあと記録・写真・場所はすべて消えます。`)) return;
    await updateTeamSetting(person.id, { deleteRequestedAt: nowISO() }, userId);
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="チームの設定" sub={`${person.displayName} ・ 変更できるのは ${admins || '管理者'}`} back="/team" />

      <div className="section">
        <div className="card stack">
          <span className="label">多要素認証（パスワードのほかにスマホで本人確認）</span>
          <p className="help">{serverEnabled ? 'まだ設定できません。このあと足します。' : 'ログインができてから設定できます。いまは、この端末の中だけで動く試用版です。'}</p>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <div className="row row--between">
            <span className="label">AI を使う</span>
            <span className={`badge ${aiEnabled ? 'badge--owner' : 'badge--role'}`}>{aiEnabled ? 'あり' : 'なし'}</span>
          </div>
          {aiEnabled && aiConsent && (
            <p className="help">
              送り先: Anthropic（米国）。氏名・施設名は置きかえて送り、写真は送りません。同意: {nameOf(aiConsent.userId)} {formatDateJa(localDateOf(aiConsent.createdAt), false)}
            </p>
          )}
          {!aiEnabled && <p className="help">「なし」のときは、外の AI に何も送りません。記録・グラフ・共有はそのまま使えます。</p>}
          {usage && (
            <p className="help">
              あなたの残り: 今日 {usage.dayLeft}回・今月 {usage.monthLeft}回（1人の上限: 支援リーダー以上 月{AI_LIMITS.lead.month}回・1日{AI_LIMITS.lead.day}回 ／ 支援者 月{AI_LIMITS.supporter.month}回・1日{AI_LIMITS.supporter.day}回）
            </p>
          )}
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
            <button type="button" className="btn" onClick={() => setAiEnabled(person.id, false, userId)}>「なし」に戻す</button>
          )}
          {!isAdmin && <p className="help">切りかえは管理者が行います。</p>}
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">睡眠不足の判定</span>
          <div className="chips">
            <Chip on={!shortSleepUnderHours} onClick={editable ? () => updateTeamSetting(person.id, { shortSleepUnderHours: null }, userId) : undefined}>
              いつもより2時間以上短い夜（初期設定）
            </Chip>
            {[5, 6, 7, 8].map((h) => (
              <Chip key={h} on={shortSleepUnderHours === h} onClick={editable ? () => updateTeamSetting(person.id, { shortSleepUnderHours: h }, userId) : undefined}>
                {h}時間未満
              </Chip>
            ))}
          </div>
          <p className="help">年齢によって必要な睡眠時間がちがうため、初期設定は「いつもと比べて」です。短い夜の日の ABC記録には「睡眠不足」が最初から付きます。</p>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">身体拘束の記録</span>
          <RestraintThreshold />
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">データ</span>
          {canExport(me?.role) ? (
            <>
              <button type="button" className="btn btn--outline" onClick={() => exportCsv('records', '記録とABC')}>CSV で書き出す: 記録とABC</button>
              <button type="button" className="btn btn--outline" onClick={() => exportCsv('observations', 'インターバル')}>CSV で書き出す: インターバル・時間サンプリング</button>
              <button type="button" className="btn btn--outline" onClick={() => exportCsv('sleep', '睡眠')}>CSV で書き出す: 睡眠</button>
            </>
          ) : null}
          <p className="help">
            書き出せるのは管理者・副管理者・支援リーダー。写真と場所の位置は含みません。書き出したことは履歴に残ります。
            {!serverEnabled && 'いまは記録がこの端末の中にだけあるので、ときどき書き出しておくと安心です。'}
          </p>
          {isAdmin &&
            (deleteRequestedAt ? (
              <div className="stack">
                <p className="help" style={{ color: 'var(--danger)' }}>
                  削除を申し込み中です。{formatDateJa(addDays(localDateOf(deleteRequestedAt), TEAM_DELETE_DAYS))}に、記録・写真・場所がすべて消えます。
                </p>
                <button type="button" className="btn btn--block" onClick={() => updateTeamSetting(person.id, { deleteRequestedAt: null }, userId)}>削除の申し込みを取り消す</button>
              </div>
            ) : (
              <>
                <button type="button" className="btn btn--danger btn--block" onClick={requestDelete}>チームを削除する（管理者のみ）</button>
                <p className="help">申し込みから{TEAM_DELETE_DAYS}日間は取り消せます。そのあと記録・写真・場所はすべて消えます。</p>
              </>
            ))}
        </div>
      </div>
    </div>
  );
}
