/** 初回セットアップ: 記録者 → 対象者 → 最初の行動 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBehavior, createPerson, saveProfile } from '../db/repo';
import { useApp } from '../state';
import { BEHAVIOR_KIND_LABEL, type BehaviorKind, type Measure } from '../db/types';
import { Chip } from '../components/ui';

export default function Setup() {
  const { profile, person } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState(profile?.memberDisplayName ? (person ? 3 : 2) : 1);
  const [name, setName] = useState(profile?.memberDisplayName ?? '');
  const [aff, setAff] = useState(profile?.memberAffiliation ?? '');
  const [pname, setPname] = useState('');
  const [bname, setBname] = useState('');
  const [bkind, setBkind] = useState<BehaviorKind>('problem');
  const [measures, setMeasures] = useState<Measure[]>(['frequency']);
  const [busy, setBusy] = useState(false);

  async function step1() {
    if (!name.trim()) return;
    await saveProfile({ memberDisplayName: name.trim(), memberAffiliation: aff.trim() });
    setStep(2);
  }
  async function step2() {
    if (!pname.trim()) return;
    setBusy(true);
    await createPerson({ displayName: pname.trim(), ownerName: name.trim(), ownerAffiliation: aff.trim() });
    setBusy(false);
    setStep(3);
  }
  async function step3(skip: boolean) {
    if (!skip) {
      if (!bname.trim() || !person) return;
      const { currentMemberFor } = await import('../db/repo');
      const m = await currentMemberFor(person.id);
      await createBehavior({ personId: person.id, kind: bkind, name: bname.trim(), measures, actorId: m.id });
    }
    nav('/', { replace: true });
  }

  const toggleMeasure = (m: Measure) =>
    setMeasures((cur) => (cur.includes(m) ? (cur.length > 1 ? cur.filter((x) => x !== m) : cur) : [...cur, m]));

  return (
    <main className="page page--no-nav">
      <header className="topbar"><div className="topbar__inner"><h1 className="topbar__title">はじめに</h1></div></header>
      <div className="section stack">
        <p className="help">
          このアプリは、行動の記録を簡単に残し、折れ線グラフで変化を見て、支援者のあいだで共有するためのものです。
          問題行動だけでなく、望ましい行動・代替行動もいっしょに記録します。
        </p>
        {step === 1 && (
          <section className="card stack">
            <span className="wizard-step">1 / 3 あなたについて</span>
            <label className="field">お名前（表示名。ニックネーム可）
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 母、山田" autoFocus />
            </label>
            <label className="field">所属（任意）
              <input value={aff} onChange={(e) => setAff(e.target.value)} placeholder="例: 家庭、〇〇生活介護、△△特別支援学校" />
            </label>
            <button className="btn btn--primary btn--block" onClick={step1} disabled={!name.trim()}>次へ</button>
          </section>
        )}
        {step === 2 && (
          <section className="card stack">
            <span className="wizard-step">2 / 3 対象者（本人）</span>
            <label className="field">表示名（実名でなくて構いません）
              <input value={pname} onChange={(e) => setPname(e.target.value)} placeholder="例: Aさん、たろう" autoFocus />
            </label>
            <p className="help">対象者の記録の所有者は保護者（または本人）です。あなたがこの対象者のオーナーになります。</p>
            <button className="btn btn--primary btn--block" onClick={step2} disabled={!pname.trim() || busy}>次へ</button>
          </section>
        )}
        {step === 3 && (
          <section className="card stack">
            <span className="wizard-step">3 / 3 最初の行動を1つ決める</span>
            <div className="chips">
              {(Object.keys(BEHAVIOR_KIND_LABEL) as BehaviorKind[]).map((k) => (
                <Chip key={k} on={bkind === k} problem={k === 'problem'} onClick={() => setBkind(k)}>{BEHAVIOR_KIND_LABEL[k]}</Chip>
              ))}
            </div>
            <label className="field">行動の名前
              <input value={bname} onChange={(e) => setBname(e.target.value)} placeholder="例: 頭たたき、休憩カードを渡す" autoFocus />
            </label>
            <span className="label">測定するもの（複数可）</span>
            <div className="chips">
              <Chip on={measures.includes('frequency')} onClick={() => toggleMeasure('frequency')}>頻度（回数）</Chip>
              <Chip on={measures.includes('duration')} onClick={() => toggleMeasure('duration')}>持続時間</Chip>
              <Chip on={measures.includes('intensity')} onClick={() => toggleMeasure('intensity')}>強度</Chip>
            </div>
            <p className="help">行動は後から「設定」で追加・編集できます。誰が見ても同じ判断ができる具体的な定義も書けます。</p>
            <button className="btn btn--primary btn--block" onClick={() => step3(false)} disabled={!bname.trim()}>登録して始める</button>
            <button className="btn btn--block" onClick={() => step3(true)}>あとで決める</button>
          </section>
        )}
      </div>
    </main>
  );
}
