/**
 * 支援計画の編集（6.7、決定67・69）。1つの計画を上書きで保存し、変更は履歴に残る。
 * - 「変えた理由」は必ず書く（【暫定】）
 * - 合意をお願いする人を選ぶ（閲覧者は選べない。管理者は必ず入る）。保存した人が入っていれば、保存と同時に合意
 * - 機能仮説を選ぶと、代替行動の定型ヒントを出す（決定27）
 * - AI 画面の「採用したもの」から取り込める（決定70）。強化の欄は「好きなもの」から選べる（6.14）
 * - 危機時の対応を書くときは、見直し日を必ず入れる（制限的な対応は最も制限の少ない方法から、定期的に見直す）
 */
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { canEditPlan, canSign, diffFields, emptyPlan, FUNCTION_HINT, savePlan } from '../db/phase2';
import { usePlanData } from '../lib/usePlan';
import { valueUnit } from '../lib/series';
import { formatDateTimeJa, toLocalDate } from '../lib/date';
import { FUNCTION_LABEL, PLAN_FIELD_LABEL, ROLE_LABEL, type BehaviorFunction, type PlanContent, type PlanCriterion } from '../db/types';
import { Chip, Sheet, TopBar } from '../components/ui';

export default function PlanEditRoute() {
  const { person } = useApp();
  const data = usePlanData(person?.id);
  if (!person || !data) return null;
  return <PlanEdit initial={data.plan?.content ?? emptyPlan()} isNew={!data.plan} />;
}

function PlanEdit({ initial, isNew }: { initial: PlanContent; isNew: boolean }) {
  const { person, behaviors, members, me, userId, aiEnabled } = useApp();
  const nav = useNavigate();
  const [p, setP] = useState<PlanContent>(initial);
  const [reason, setReason] = useState(isNew ? '最初の計画' : '');
  const eligible = members.filter((m) => canSign(m.role));
  const admin = members.find((m) => m.role === 'admin');
  const [signers, setSigners] = useState<Set<string>>(new Set(eligible.map((m) => m.id)));
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const reinforcers = useLiveQuery(
    async () => (person ? (await db.reinforcers.where('personId').equals(person.id).filter((r) => !r.deletedAt && !r.hiddenAt).toArray()) : []),
    [person?.id],
  );
  const adopted = useLiveQuery(async () => {
    if (!person) return { analyses: [], suggestions: [] };
    const ok = (d: string | null) => d === 'adopted' || d === 'modified';
    return {
      analyses: (await db.aiAnalyses.where('personId').equals(person.id).toArray()).filter((a) => ok(a.decision) && a.output),
      suggestions: (await db.aiSuggestions.where('personId').equals(person.id).toArray()).filter((s) => ok(s.decision)),
    };
  }, [person?.id]);

  if (!person || !userId || !me) return null;
  if (!canEditPlan(me.role)) return <Navigate to="/plan" replace />;

  const set = <K extends keyof PlanContent>(k: K, v: PlanContent[K]) => setP((x) => ({ ...x, [k]: v }));
  const problems = behaviors.filter((b) => b.kind === 'problem');
  const goods = behaviors.filter((b) => b.kind !== 'problem');
  const changed = diffFields(isNew ? null : initial, p);
  const needReview = !!p.crisis.trim() && !p.reviewDate;
  const canSave = changed.length > 0 && !!reason.trim() && !needReview && !saving;

  const setCriterion = (i: number, patch: Partial<PlanCriterion>) => set('criteria', p.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addCriterion = () => {
    const b = behaviors.find((x) => x.id === p.problemBehaviorId) ?? behaviors[0];
    if (b) set('criteria', [...p.criteria, { behaviorId: b.id, op: b.kind === 'problem' ? 'lte' : 'gte', value: 0, note: '' }]);
  };
  const append = (k: 'antecedent' | 'reinforcement' | 'prompting', text: string) => set(k, p[k] ? `${p[k]}\n${text}` : text);

  async function save() {
    if (!person || !me) return;
    setSaving(true);
    await savePlan(person.id, p, reason.trim(), [...signers], me, members);
    nav('/plan', { replace: true });
  }

  return (
    <div className="page page--no-nav">
      <TopBar title={isNew ? '支援計画を作る' : '支援計画の編集'} sub="保存すると上書きされ、変更は履歴に残ります" back="/plan" />

      {aiEnabled && (adopted?.analyses.length || adopted?.suggestions.length) ? (
        <div className="section">
          <button type="button" className="btn btn--outline btn--block" onClick={() => setImporting(true)}>AI の「採用したもの」から取り込む</button>
        </div>
      ) : null}

      <div className="section">
        <div className="card stack">
          <span className="label">標的行動と機能仮説</span>
          <label className="field">
            標的とする問題行動
            <select value={p.problemBehaviorId ?? ''} onChange={(e) => set('problemBehaviorId', e.target.value || null)}>
              <option value="">（選ばない）</option>
              {problems.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <span className="label">機能仮説（はたらき）</span>
          <div className="chips">
            {(Object.keys(FUNCTION_LABEL) as BehaviorFunction[]).map((f) => (
              <Chip key={f} on={p.func === f} onClick={() => set('func', p.func === f ? null : f)}>{FUNCTION_LABEL[f]}</Chip>
            ))}
          </div>
          {p.func && <p className="hint">ヒント（{FUNCTION_LABEL[p.func]}）: {FUNCTION_HINT[p.func]}</p>}
          <label className="field">
            代替行動・望ましい行動
            <select value={p.alternativeBehaviorId ?? ''} onChange={(e) => set('alternativeBehaviorId', e.target.value || null)}>
              <option value="">（選ばない）</option>
              {goods.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <p className="help">行動がまだないときは、ホームの「行動」から追加してください。</p>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">支援目標と達成基準</span>
          <label className="field">
            支援目標
            <textarea value={p.goal} onChange={(e) => set('goal', e.target.value)} placeholder="例: 課題の場面で、頭たたきの代わりに休憩カードを渡せる" />
          </label>
          {p.criteria.map((c, i) => {
            const b = behaviors.find((x) => x.id === c.behaviorId);
            return (
              <div key={i} className="stack criterion">
                <div className="row">
                  <select className="input" aria-label="行動" value={c.behaviorId} onChange={(e) => setCriterion(i, { behaviorId: e.target.value })}>
                    {behaviors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className="row">
                  <input className="input" style={{ maxWidth: 96 }} type="number" min={0} step="0.1" inputMode="decimal" aria-label="値" value={c.value} onChange={(e) => setCriterion(i, { value: Number(e.target.value) })} />
                  <span className="muted">{b ? valueUnit(b) : ''}</span>
                  <select className="input" style={{ maxWidth: 96 }} aria-label="以下か以上" value={c.op} onChange={(e) => setCriterion(i, { op: e.target.value as 'lte' | 'gte' })}>
                    <option value="lte">以下</option>
                    <option value="gte">以上</option>
                  </select>
                </div>
                <label className="row">
                  <span className="muted nowrap">期限</span>
                  <input className="input" type="date" value={c.deadline ?? ''} onChange={(e) => setCriterion(i, { deadline: e.target.value || null })} aria-label="期限（いつまでに）" />
                </label>
                <div className="row">
                  <input className="input" value={c.note} onChange={(e) => setCriterion(i, { note: e.target.value })} placeholder="例: 2週連続" aria-label="期間などの条件" />
                  <button type="button" className="btn btn--sm" onClick={() => set('criteria', p.criteria.filter((_, j) => j !== i))}>外す</button>
                </div>
              </div>
            );
          })}
          <button type="button" className="btn btn--sm" style={{ alignSelf: 'flex-start' }} disabled={behaviors.length === 0} onClick={addCriterion}>+ 達成基準を足す</button>
          <p className="help">達成基準はグラフに横の点線で出ます。値はグラフと同じ「1日あたり」です。期限を入れると、過ぎても届いていないときに計画の画面で見直しをすすめます。</p>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">支援内容</span>
          <label className="field">
            先行子操作（予防: 先にできる工夫）
            <textarea value={p.antecedent} onChange={(e) => set('antecedent', e.target.value)} placeholder="例: 課題は絵カードで予告。量を半分にして「終わり」を見せる" />
          </label>
          <label className="field">
            代替行動への対応（強化: できたときの認め方）
            <textarea value={p.reinforcement} onChange={(e) => set('reinforcement', e.target.value)} placeholder="例: カードを渡したら、すぐに2分休憩" />
          </label>
          {(reinforcers ?? []).length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              <span className="muted">好きなもの（強化子）から選ぶ</span>
              <div className="chips">
                {reinforcers!.map((r) => <Chip key={r.id} onClick={() => append('reinforcement', `好きなもの: ${r.name}`)}>{r.name}</Chip>)}
              </div>
            </div>
          )}
          <label className="field">
            プロンプト（手がかりの出し方）
            <textarea value={p.prompting} onChange={(e) => set('prompting', e.target.value)} placeholder="例: 手が上がりかけたら、カードを指さす" />
          </label>
          <label className="field">
            危機時の対応（安全確保）
            <textarea value={p.crisis} onChange={(e) => set('crisis', e.target.value)} placeholder="例: 机から離れて見守る。けがのおそれがあればクッションを差し出す" />
          </label>
          <p className="help">
            制限的な対応を書くときは、いちばん制限の少ない方法から順に試すことと、見直し日を必ず書いてください。
            身体拘束は支援の方法ではありません。緊急やむを得ず行ったときは「身体拘束の記録」に残します。
          </p>
          <label className="field">
            見直し日{p.crisis.trim() ? '（危機時の対応を書いたときは必須）' : ''}
            <input type="date" value={p.reviewDate ?? ''} min={toLocalDate()} onChange={(e) => set('reviewDate', e.target.value || null)} />
          </label>
          <label className="field">
            担当
            <input value={p.owner} onChange={(e) => set('owner', e.target.value)} placeholder="例: 施設 職員A、家庭 母" />
          </label>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">合意をお願いする人</span>
          {eligible.map((m) => (
            <label key={m.id} className="check-row">
              <input
                type="checkbox"
                checked={signers.has(m.id) || m.id === admin?.id}
                disabled={m.id === admin?.id}
                onChange={(e) => setSigners((s) => {
                  const n = new Set(s);
                  if (e.target.checked) n.add(m.id);
                  else n.delete(m.id);
                  return n;
                })}
              />
              <span>{m.displayName}（{ROLE_LABEL[m.role]}）{m.id === admin?.id ? ' ・ 必ず入ります' : ''}{m.id === me.id ? ' ・ あなた（保存と同時に合意）' : ''}</span>
            </label>
          ))}
          <p className="help">
            家族（管理者）が合意した日から、変更後の計画が「実施中」になり、グラフに縦の線が入ります。ほかの人の合意は待ちません。管理者が操作できないときや引き継ぎ中は、副管理者が代わりに合意できます。
            通知やメールは送らず、頼まれた人がアプリを開いたときに「確認の依頼があります」と出ます。閲覧者は選べません。
          </p>
          <label className="field">
            変えた理由（必須）
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例: 頭たたきが減ってきたので、休憩カードの目標を上げた" />
          </label>
          {changed.length > 0 && <span className="muted">変わる項目: {changed.map((k) => PLAN_FIELD_LABEL[k]).join('、')}</span>}
          {needReview && <p className="ai-error">危機時の対応を書いたときは、見直し日を入れてください。</p>}
          <button type="button" className="btn btn--primary btn--block" disabled={!canSave} onClick={save}>保存して合意をお願いする</button>
          {changed.length === 0 && <p className="help">まだ何も変わっていません。</p>}
        </div>
      </div>

      {importing && adopted && (
        <Sheet title="採用したものから取り込む" onClose={() => setImporting(false)}>
          <div className="stack">
            <p className="help">取り込んだ内容は、あとから自由に直せます。AI の仮説・案は、チームが確かめて採用したものだけです。</p>
            {adopted.analyses.map((a) => {
              const top = [...a.output!.functions].sort((x, y) => y.count - x.count)[0];
              const b = behaviors.find((x) => x.id === a.behaviorId);
              return (
                <div key={a.id} className="card stack">
                  <span>
                    <span className="badge badge--role">採用した仮説</span> {b?.name ?? '（非表示の行動）'}: {a.output!.functions.filter((f) => f.count > 0).map((f) => FUNCTION_LABEL[f.func]).join('・')}
                  </span>
                  <span className="muted">{a.decidedAt ? formatDateTimeJa(a.decidedAt) : ''}</span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      setP((x) => ({ ...x, problemBehaviorId: b ? b.id : x.problemBehaviorId, func: top && top.count > 0 ? top.func : x.func }));
                      setImporting(false);
                    }}
                  >
                    行動と機能仮説に取り込む
                  </button>
                </div>
              );
            })}
            {adopted.suggestions.map((s) => (
              <div key={s.id} className="card stack">
                <span>
                  <span className="badge badge--role">採用した案</span> {s.output.alternatives.map((x) => x.behavior).join('、')}
                </span>
                {s.decisionNote && <span className="help">修正した内容: {s.decisionNote}</span>}
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    setP((x) => ({
                      ...x,
                      antecedent: [x.antecedent, ...s.output.antecedentStrategies.map((y) => `${y.strategy}: ${y.detail}`)].filter(Boolean).join('\n'),
                      reinforcement: [x.reinforcement, ...s.output.reinforcement.map((y) => `${y.method}: ${y.detail}`)].filter(Boolean).join('\n'),
                      prompting: [x.prompting, ...s.output.alternatives.map((y) => `${y.behavior}: ${y.prompting}`)].filter(Boolean).join('\n'),
                    }));
                    setImporting(false);
                  }}
                >
                  支援内容に取り込む
                </button>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
