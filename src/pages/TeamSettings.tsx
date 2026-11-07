/**
 * チームの設定（画面一覧 13・16、ワイヤーフレーム 13）。変えられるのは管理者と副管理者（AI とチームの削除は管理者だけ）。
 * 多要素認証の基準は管理者が決める（7.4.3。0020 を流したあと、サーバーのチームだけ）。書き出しのメールは、このあと足す。身体拘束の見直しの目安は Phase 2。
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import RestraintThreshold from '../components/RestraintThreshold';
import { AI_LIMITS, AI_TEAM_LIMIT, aiTeamUsage, aiUsage, canEditTeamSettings, canExport, logExport, setAiEnabled, TEAM_DELETE_DAYS, updateTeamSetting } from '../db/repo';
import { useApp } from '../state';
import { buildCsv, downloadCsv, type CsvKind } from '../lib/csv';
import { addDays, formatDateJa, localDateOf, nowISO, toLocalDate } from '../lib/date';
import { Chip, TopBar } from '../components/ui';
import { serverEnabled } from '../server/supabase';
import { MFA_RULE_LABEL, type MfaRule } from '../server/mfa';

// AI の同意画面で案内するページ（7.5）。内容は取り込まず、リンクだけを置く
const PPC_US = 'https://www.ppc.go.jp/enforcement/infoprovision/laws/offshore_report_america/';
const ANTHROPIC_TRAINING = 'https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training';
const ANTHROPIC_RETENTION = 'https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data';

export default function TeamSettings() {
  const { person, me, members, userId, aiEnabled, shortSleepUnderHours, wakingsOn, deleteRequestedAt, mfaRule } = useApp();
  const [asking, setAsking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const personId = person?.id ?? '';
  const usage = useLiveQuery(async () => (userId ? aiUsage(userId, me?.role) : null), [userId, me?.role]);
  const teamUsage = useLiveQuery(async () => (personId ? aiTeamUsage(personId) : null), [personId]);
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

  // サーバーで消すときに残すもの（0023。14.3 #10・#11 で決めるまで）
  const KEPT_NOTE = '監査ログ（誰が・いつ・何をしたか）と身体拘束の記録は、扱いが決まるまでサーバーに残します。チームの人も見られなくなります。';

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
              送り先: Anthropic（米国）。氏名・施設名は置きかえて送り、写真は送りません。同意: {nameOf(aiConsent.userId)} {formatDateJa(localDateOf(aiConsent.createdAt), false)}（同意文の版 {aiConsent.textVersion}）
            </p>
          )}
          {!aiEnabled && <p className="help">「なし」のときは、外の AI に何も送りません。記録・グラフ・共有はそのまま使えます。</p>}
          {aiEnabled && teamUsage && (
            <p className="help">
              今月のチームの残り: {teamUsage.monthLeft}回 / {AI_TEAM_LIMIT.month}回（今日 {teamUsage.dayLeft}回 / {AI_TEAM_LIMIT.day}回）
            </p>
          )}
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
              <p className="help">
                <strong>送り先の国</strong>: 米国。米国の個人情報を守る制度は、個人情報保護委員会がまとめています（
                <a href={PPC_US} target="_blank" rel="noopener noreferrer">外国制度（アメリカ合衆国）</a>）。
              </p>
              <p className="help">
                <strong>送り先（Anthropic）の扱い</strong>（2026-11-07 に Anthropic の公開ページで確認）:
                API で送ったものを AI の学習には使いません（
                <a href={ANTHROPIC_TRAINING} target="_blank" rel="noopener noreferrer">学習について</a>）。
                送ったものと AI の答えは、受け取ってから30日以内に自動で消えます。利用のきまりに反する疑いがあるときや、法令で求められるときは、もっと長く残ることがあります。
                こちらから個別に消してもらう申し込みはできず、30日以内の自動の削除が消す方法になります（
                <a href={ANTHROPIC_RETENTION} target="_blank" rel="noopener noreferrer">保存の期間について</a>）。
              </p>
              <p className="help">リンクは外部のサイト（英語のページを含む）が開きます。この文面は下書きで、試用中に法律の専門家に確かめます。</p>
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
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (window.confirm('AI の同意を取り消して「なし」に戻しますか？\nこれからは外の AI に何も送りません。もう一度使うときは、改めて同意します。')) void setAiEnabled(person.id, false, userId);
              }}
            >
              同意を取り消して「なし」に戻す
            </button>
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
          <span className="label">中途覚醒（夜中に起きた回数）</span>
          <div className="chips">
            <Chip on={wakingsOn} onClick={editable ? () => updateTeamSetting(person.id, { wakingsEnabled: null }, userId) : undefined}>
              使う（初期設定）
            </Chip>
            <Chip on={!wakingsOn} onClick={editable ? () => updateTeamSetting(person.id, { wakingsEnabled: false }, userId) : undefined}>
              使わない
            </Chip>
          </div>
          <p className="help">「使わない」にすると、睡眠の入力とホームの睡眠のカードに出なくなります。これまでの回数は消えません。</p>
        </div>
      </div>

      {mfaRule && (
        <div className="section">
          <div className="card stack">
            <span className="label">多要素認証（MFA）</span>
            <div className="chips">
              {(Object.keys(MFA_RULE_LABEL) as MfaRule[]).map((r) => (
                <Chip key={r} on={mfaRule === r} onClick={isAdmin ? () => updateTeamSetting(person.id, { mfaRule: r }, userId) : undefined}>
                  {MFA_RULE_LABEL[r]}
                </Chip>
              ))}
            </div>
            <p className="help">
              パスワードのほかに、スマホの認証アプリのコードでも確かめるしくみです。管理者と副管理者は、どの基準でも必須です。必須になった人は7日のうちに「あなたの設定」で設定します。過ぎると、設定するまで記録を見ることだけになります。メンバーごとの例外（必須・免除）は、チームの画面のメンバーから付けられます。
              {!isAdmin && '基準は管理者が決めます。'}
            </p>
          </div>
        </div>
      )}

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
              <button type="button" className="btn btn--outline" onClick={() => exportCsv('sessions', '観察時間')}>CSV で書き出す: 観察時間（推定）</button>
            </>
          ) : null}
          <p className="help">
            書き出せるのは管理者・副管理者・支援リーダー。写真と場所の位置は含みません。観察時間は、いつもの時間か記録の最初から最後までで推定した値で、30分に満たない日は空欄です。書き出したことは履歴に残ります。
            {!serverEnabled && 'いまは記録がこの端末の中にだけあるので、ときどき書き出しておくと安心です。'}
          </p>
          {/* 試用のサーバーにはバックアップがない（決定59）。ログインして使うときに、持ち出しを勧める */}
          {serverEnabled && (
            <p className="notice-inline">
              試用中のサーバーには、記録の控え（バックアップ）がありません。サーバーの事故で記録が戻せなくなることがあるので、ときどき CSV で持ち出しておくと安心です。
              {!canExport(me?.role) && '書き出しは、管理者・副管理者・支援リーダーに頼んでください。'}
            </p>
          )}
          {isAdmin &&
            (deleteRequestedAt ? (
              <div className="stack">
                <p className="help" style={{ color: 'var(--danger)' }}>
                  削除を申し込み中です。{formatDateJa(addDays(localDateOf(deleteRequestedAt), TEAM_DELETE_DAYS))}のあと、チームのだれかがアプリを開いたときに、記録・写真・場所がすべて消えます。
                </p>
                {serverEnabled && <p className="help">{KEPT_NOTE}</p>}
                <button type="button" className="btn btn--block" onClick={() => updateTeamSetting(person.id, { deleteRequestedAt: null }, userId)}>削除の申し込みを取り消す</button>
              </div>
            ) : (
              <>
                <button type="button" className="btn btn--danger btn--block" onClick={requestDelete}>チームを削除する（管理者のみ）</button>
                <p className="help">申し込みから{TEAM_DELETE_DAYS}日間は取り消せます。そのあと記録・写真・場所はすべて消えます。{serverEnabled && KEPT_NOTE}</p>
              </>
            ))}
        </div>
      </div>
    </div>
  );
}
