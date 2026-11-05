/**
 * 行動の編集（6.2）。名前・定義・例・強度の基準・代替行動のリンクを直せる。
 * 前の内容は監査ログに残る。測り方を変えるとグラフの系列が分かれるため、いまは変えられない（グラフの注記と一緒に足す）。
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canEditBehaviors, updateBehavior } from '../db/repo';
import { useApp } from '../state';
import { FUNCTION_LABEL, INTENSITY_NAMES, KIND_LABEL, METHOD_LABEL, type Behavior, type BehaviorFunction } from '../db/types';
import { Chip, TopBar } from '../components/ui';

export default function BehaviorEditRoute() {
  const { behaviorId = '' } = useParams();
  const b = useLiveQuery(() => db.behaviors.get(behaviorId), [behaviorId]);
  if (b === undefined) return null;
  return <BehaviorEdit key={b.id} b={b} />;
}

function BehaviorEdit({ b }: { b: Behavior }) {
  const { behaviors, me, userId } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState(b.name);
  const [definition, setDefinition] = useState(b.definition);
  const [examples, setExamples] = useState(b.examples);
  const [nonExamples, setNonExamples] = useState(b.nonExamples);
  const [replacesId, setReplacesId] = useState(b.replacesBehaviorId);
  const [func, setFunc] = useState<BehaviorFunction | null>(b.func);
  const [intervalSec, setIntervalSec] = useState(b.intervalSec ?? 10);
  const [samplingMin, setSamplingMin] = useState(b.samplingMin ?? 5);
  const [useIntensity, setUseIntensity] = useState(!!b.intensity);
  const [levels, setLevels] = useState<3 | 5>(b.intensity?.levels ?? 3);
  const [criteria, setCriteria] = useState<string[]>(() => {
    const c = [...(b.intensity?.criteria ?? [])];
    while (c.length < 5) c.push('');
    return c;
  });

  if (!userId) return null;
  if (!canEditBehaviors(me?.role)) return <p className="empty">行動の編集は、管理者・副管理者・支援リーダーが行います。</p>;
  const problems = behaviors.filter((x) => x.kind === 'problem' && x.id !== b.id);

  async function save() {
    await updateBehavior(
      b.id,
      {
        name: name.trim(),
        definition: definition.trim(),
        examples: examples.trim(),
        nonExamples: nonExamples.trim(),
        intervalSec: b.method === 'interval' ? intervalSec : null,
        samplingMin: b.method === 'sampling' ? samplingMin : null,
        intensity: useIntensity ? { levels, criteria: criteria.slice(0, levels).map((c) => c.trim()) } : null,
        replacesBehaviorId: b.kind === 'alternative' ? replacesId : null,
        func: b.kind === 'alternative' ? func : null,
      },
      userId!,
    );
    nav('/behaviors', { replace: true });
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="行動の編集" sub={KIND_LABEL[b.kind]} back="/behaviors" />
      <div className="section stack">
        <div className="card stack">
          <label className="field">
            行動の名前
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            どんな行動か（誰が見ても同じに判断できるように）
            <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} />
          </label>
          <label className="field">
            例（任意）
            <input value={examples} onChange={(e) => setExamples(e.target.value)} />
          </label>
          <label className="field">
            含まないもの（任意）
            <input value={nonExamples} onChange={(e) => setNonExamples(e.target.value)} />
          </label>
        </div>

        {b.kind === 'alternative' && (
          <div className="card stack">
            <span className="label">どの問題行動の代わりですか？（任意）</span>
            <div className="chips">
              {problems.map((p) => (
                <Chip key={p.id} on={replacesId === p.id} onClick={() => setReplacesId(replacesId === p.id ? null : p.id)}>
                  {p.name}
                </Chip>
              ))}
            </div>
            <span className="label">どの目的（機能）に合わせますか？（任意）</span>
            <div className="chips">
              {(Object.keys(FUNCTION_LABEL) as BehaviorFunction[]).map((f) => (
                <Chip key={f} on={func === f} onClick={() => setFunc(func === f ? null : f)}>
                  {FUNCTION_LABEL[f]}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="card stack">
          <span className="label">測り方: {METHOD_LABEL[b.method]}</span>
          {b.method === 'interval' && (
            <label className="field">
              区間の長さ（5〜60秒）
              <input type="number" min={5} max={60} value={intervalSec} onChange={(e) => setIntervalSec(clamp(+e.target.value, 5, 60))} />
            </label>
          )}
          {b.method === 'sampling' && (
            <label className="field">
              知らせる間隔（1〜30分）
              <input type="number" min={1} max={30} value={samplingMin} onChange={(e) => setSamplingMin(clamp(+e.target.value, 1, 30))} />
            </label>
          )}
          <p className="help">測り方を変えると、前後の記録を同じグラフで比べられなくなります。変えたいときは、新しい行動として追加してください。</p>
        </div>

        <div className="card stack">
          <label className="row">
            <input type="checkbox" checked={useIntensity} onChange={(e) => setUseIntensity(e.target.checked)} style={{ width: 22, height: 22 }} />
            <span className="label">強度（どのくらい激しかったか）も記録する</span>
          </label>
          {useIntensity && (
            <>
              <div className="chips">
                <Chip on={levels === 3} onClick={() => setLevels(3)}>3段階</Chip>
                <Chip on={levels === 5} onClick={() => setLevels(5)}>5段階</Chip>
              </div>
              <p className="help">段階ごとに、見て分かる基準を書いてください。</p>
              {INTENSITY_NAMES[levels].map((label, i) => (
                <label key={i} className="field">
                  {i + 1}: {label}
                  <input value={criteria[i]} onChange={(e) => setCriteria(criteria.map((c, j) => (j === i ? e.target.value : c)))} />
                </label>
              ))}
            </>
          )}
        </div>

        <p className="help">直す前の内容は、変更の履歴（監査ログ）に残ります。</p>
        <div className="grid-2">
          <button type="button" className="btn" onClick={() => nav('/behaviors')}>やめる</button>
          <button type="button" className="btn btn--primary" disabled={!name.trim()} onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
