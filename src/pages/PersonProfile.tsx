/**
 * 対象者のプロフィール（6.1）。呼び名は必須、ほかは任意（要配慮個人情報を必要以上に集めない）。
 * 直せるのは管理者・副管理者・支援リーダー（6.9 の「対象者設定」）。ほかの人は見るだけ。変更は監査ログに残る。
 * AI には送らない（AI に送るのは仮名化した記録だけ）。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state';
import { canEditPerson, updatePerson } from '../db/repo';
import { TopBar } from '../components/ui';

export default function PersonProfile() {
  const { person, me, userId } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState(() => ({
    displayName: person?.displayName ?? '',
    birthMonth: person?.birthMonth ?? '',
    belongs: person?.belongs ?? '',
    notes: person?.notes ?? '',
    cautions: person?.cautions ?? '',
  }));
  const [saving, setSaving] = useState(false);
  if (!person || !userId) return null;
  const editable = canEditPerson(me?.role);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!person || !userId || !form.displayName.trim()) return;
    setSaving(true);
    await updatePerson(
      person.id,
      {
        displayName: form.displayName.trim(),
        birthMonth: form.birthMonth || null,
        belongs: form.belongs.trim(),
        notes: form.notes.trim(),
        cautions: form.cautions.trim(),
      },
      userId,
    );
    nav('/team', { replace: true });
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="対象者のプロフィール" sub={person.displayName} back="/team" />
      <div className="section">
        <div className="card stack">
          <label className="field">
            呼び名（必須）
            <input value={form.displayName} disabled={!editable} onChange={(e) => set('displayName', e.target.value)} />
          </label>
          <p className="help">本名でなくてかまいません。ニックネームやイニシャルで使えます。</p>
          <label className="field">
            生まれた年と月（任意）
            <input type="month" value={form.birthMonth} disabled={!editable} onChange={(e) => set('birthMonth', e.target.value)} />
          </label>
          <label className="field">
            通っているところ（任意）
            <input value={form.belongs} disabled={!editable} onChange={(e) => set('belongs', e.target.value)} placeholder="例: 生活介護、特別支援学校" />
          </label>
          <label className="field">
            特性のメモ（任意）
            <textarea value={form.notes} disabled={!editable} onChange={(e) => set('notes', e.target.value)} placeholder="例: 見通しがあると落ち着きやすい" />
          </label>
          <label className="field">
            苦手なこと・気をつけること（任意）
            <textarea value={form.cautions} disabled={!editable} onChange={(e) => set('cautions', e.target.value)} placeholder="例: 大きな音、急な予定の変更" />
          </label>
          <p className="help">好きなもの（強化子）は「好きなもの」の画面で、写真付きで登録します。この画面の内容は AI には送りません。</p>
        </div>
      </div>
      <div className="section">
        {editable ? (
          <button type="button" className="btn btn--primary btn--block" disabled={saving || !form.displayName.trim()} onClick={save}>保存する</button>
        ) : (
          <p className="help">直せるのは管理者・副管理者・支援リーダーです。</p>
        )}
      </div>
    </div>
  );
}
