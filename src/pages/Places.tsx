/**
 * 場所の登録（6.3.3、画面一覧 5、ワイヤーフレーム 11）。ホーム上部の場所ボタンから開く。
 * 「いまここを登録」は、この端末の位置を1回だけ取って中心にする。住所検索と地図は、地図サービスを決めてから足す。
 * 自宅は住所を一覧に出さない（いまは住所を持たない）。削除は非表示で、過去の記録に付いた場所名は残る。
 */
import { useState } from 'react';
import { canEditPlaces, hidePlace, savePlace, saveDevice, setPlaceChoice } from '../db/repo';
import { useApp } from '../state';
import { getPositionOnce, matchPlace, type Pos } from '../lib/place';
import { PLACE_KIND_LABEL, type Place, type PlaceKind } from '../db/types';
import { Chip, Sheet, TopBar } from '../components/ui';

type Form = { id: string | null; name: string; kind: PlaceKind; radiusM: Place['radiusM']; pos: Pos | null };

export default function Places() {
  const { person, me, members, userId, places, place, useLocation } = useApp();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!person || !userId) return null;
  const editable = canEditPlaces(me?.role);
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '（不明）';

  async function hereNew() {
    setMsg('');
    setBusy(true);
    const pos = await getPositionOnce();
    setBusy(false);
    if (!pos) return setMsg('位置を取れませんでした。端末の設定で位置情報を許可するか、「位置なしで登録」を使ってください。');
    setForm({ id: null, name: '', kind: 'facility', radiusM: 100, pos });
  }

  async function save() {
    if (!form || !person || !userId) return;
    const p = await savePlace(form.id, { personId: person.id, name: form.name.trim(), kind: form.kind, radiusM: form.radiusM, lat: form.pos?.lat ?? null, lng: form.pos?.lng ?? null }, userId);
    if (!form.id && form.pos) await setPlaceChoice(person.id, p.id); // いまここで登録したので、いまの場所にする
    setForm(null);
  }

  async function remove() {
    if (!form?.id || !person || !userId) return;
    if (!window.confirm(`「${form.name}」を一覧から外しますか？ 過去の記録に付いた場所名は残ります。`)) return;
    await hidePlace(form.id, userId);
    if (place?.id === form.id) await setPlaceChoice(person.id, null);
    setForm(null);
  }

  async function toggleLocation(on: boolean) {
    await saveDevice({ useLocation: on });
    if (!on || !person) return;
    const pos = await getPositionOnce();
    if (pos) await setPlaceChoice(person.id, matchPlace(places, pos)?.id ?? 'outside');
    else setMsg('位置を取れませんでした。場所は手で選んでください。');
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="場所" sub="記録に自動で付く場所です。チームで共有します" back="/" />

      <div className="section">
        <div className="card">
          <h2 className="card__title">登録した場所（{places.length}件）</h2>
          {places.length === 0 && <p className="muted">まだありません。</p>}
          {places.map((p) => (
            <div key={p.id} className="row row--between today-row">
              <span className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <span className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <strong>{p.name}</strong>
                  <span className="badge badge--role">{PLACE_KIND_LABEL[p.kind]}</span>
                  {place?.id === p.id && <span className="badge badge--owner">いまここ</span>}
                </span>
                <span className="muted">
                  {p.lat != null ? `半径 ${p.radiusM}m` : '位置なし（手で選ぶ）'} ・ {nameOf(p.createdBy)} が登録
                  {p.kind === 'home' && ' ・ 住所は表示しません'}
                </span>
              </span>
              {editable && (
                <button type="button" className="btn btn--sm" onClick={() => setForm({ id: p.id, name: p.name, kind: p.kind, radiusM: p.radiusM, pos: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null })}>
                  編集
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {editable && (
        <div className="section stack">
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={hereNew}>{busy ? '位置を取っています…' : 'いまここを登録'}</button>
          <button type="button" className="btn btn--block" onClick={() => setForm({ id: null, name: '', kind: 'facility', radiusM: 100, pos: null })}>位置なしで登録（手で選ぶ）</button>
          {msg && <p className="help" role="status">{msg}</p>}
          <p className="help">施設・自宅・学校のように建物ごとに1つ登録します。作業室・食堂などの違いは、記録の「活動」で残します。</p>
        </div>
      )}

      <div className="section">
        <div className="card stack">
          <label className="row row--between">
            <span className="label">この端末で位置情報を使う</span>
            <input type="checkbox" checked={useLocation} onChange={(e) => toggleLocation(e.target.checked)} style={{ width: 22, height: 22 }} />
          </label>
          <p className="help">
            オンにすると、アプリを開いたときに位置を1回だけ取り、登録した場所に入っていれば場所を切りかえます。
            あなたがいまどこにいるか（現在地）は、この端末の中で登録した場所と照らし合わせるだけで、保存も送信もしません。チームで共有するのは、登録した場所の名前・中心・半径だけです。
            オフでも、場所は手で選べます。
          </p>
        </div>
      </div>

      {form && (
        <Sheet title={form.id ? '場所の編集' : form.pos ? '新しい場所（いまここ）' : '新しい場所（位置なし）'} onClose={() => setForm(null)}>
          <div className="stack">
            <label className="field">
              名前
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: ひまわり園" />
            </label>
            <span className="label">種類</span>
            <div className="chips">
              {(Object.keys(PLACE_KIND_LABEL) as PlaceKind[]).map((k) => (
                <Chip key={k} on={form.kind === k} onClick={() => setForm({ ...form, kind: k })}>{PLACE_KIND_LABEL[k]}</Chip>
              ))}
            </div>
            {form.pos && (
              <>
                <span className="label">半径</span>
                <div className="chips">
                  {([50, 100, 200] as const).map((r) => (
                    <Chip key={r} on={form.radiusM === r} onClick={() => setForm({ ...form, radiusM: r })}>{r}m</Chip>
                  ))}
                </div>
              </>
            )}
            {form.id && editable && (
              <button type="button" className="btn btn--sm" onClick={async () => { const pos = await getPositionOnce(); if (pos) setForm({ ...form, pos }); else setMsg('位置を取れませんでした。'); }}>
                中心を「いまここ」にする
              </button>
            )}
            <button type="button" className="btn btn--primary btn--block" disabled={!form.name.trim()} onClick={save}>保存</button>
            {form.id && <button type="button" className="btn btn--danger btn--block" onClick={remove}>一覧から外す</button>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
