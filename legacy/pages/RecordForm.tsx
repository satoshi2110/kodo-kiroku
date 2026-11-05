/** さかのぼって入力 / 記録の日時・行動の修正（編集は履歴に残る） */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { createEvent, unmarkNoEventDay, updateEvent } from '../db/repo';
import { useApp } from '../state';
import { fromDateTimeLocalInput, localDateOf, nowISO, toDateTimeLocalInput } from '../lib/date';
import { Chip, TopBar } from '../components/ui';
import { KindBadge } from '../components/ui';

export default function RecordForm() {
  const { eventId } = useParams();
  const nav = useNavigate();
  const { person, behaviors, member } = useApp();
  const event = useLiveQuery(() => (eventId ? db.events.get(eventId) : Promise.resolve(undefined)), [eventId]);
  const [behaviorId, setBehaviorId] = useState('');
  const [when, setWhen] = useState(toDateTimeLocalInput(nowISO()));
  const [count, setCount] = useState('1');
  const [durationSec, setDurationSec] = useState('');
  const [intensity, setIntensity] = useState<number | null>(null);
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (init) return;
    if (eventId) {
      if (!event) return;
      setBehaviorId(event.behaviorId);
      setWhen(toDateTimeLocalInput(event.occurredAt));
      setCount(String(event.count));
      setDurationSec(event.durationSec != null ? String(event.durationSec) : '');
      setIntensity(event.intensity);
    } else if (behaviors.length) setBehaviorId(behaviors[0].id);
    setInit(true);
  }, [eventId, event, behaviors, init]);

  const behavior = behaviors.find((b) => b.id === behaviorId);
  const history = useLiveQuery(
    async () => (eventId ? (await db.auditLogs.where('entityId').equals(eventId).toArray()).sort((a, b) => b.at.localeCompare(a.at)) : []),
    [eventId],
  );
  const { members } = useApp();

  async function save() {
    if (!person || !member || !behaviorId) return;
    const occurredAt = fromDateTimeLocalInput(when);
    const patch = {
      behaviorId,
      occurredAt,
      count: Math.max(1, Math.round(Number(count) || 1)),
      durationSec: durationSec.trim() === '' ? null : Math.max(0, Math.round(Number(durationSec))),
      intensity,
    };
    if (eventId) {
      await updateEvent(eventId, patch, member.id);
      nav(-1);
    } else {
      const e = await createEvent({ personId: person.id, recorderId: member.id, ...patch });
      await unmarkNoEventDay(behaviorId, localDateOf(occurredAt), member.id);
      nav(`/abc/${e.id}`, { replace: true });
    }
  }

  const actionLabel: Record<string, string> = { create: '作成', update: '変更', delete: '削除', restore: '復元' };

  return (
    <main className="page">
      <TopBar back={eventId ? `/abc/${eventId}` : '/'} title={eventId ? '記録を修正' : 'さかのぼって入力'} right={<button className="btn btn--primary" onClick={save} disabled={!behaviorId}>保存</button>} />
      <div className="section stack" style={{ gap: 12 }}>
        <section className="card stack">
          <span className="label">行動</span>
          <div className="chips">
            {behaviors.map((b) => (
              <Chip key={b.id} on={behaviorId === b.id} problem={b.kind === 'problem'} onClick={() => setBehaviorId(b.id)}>
                <KindBadge kind={b.kind} /> {b.name}
              </Chip>
            ))}
          </div>
        </section>
        <section className="card stack">
          <label className="field">日時
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <div className="grid-2">
            <label className="field">回数
              <input type="number" inputMode="numeric" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
            {behavior?.measures.includes('duration') && (
              <label className="field">持続時間（秒）
                <input type="number" inputMode="numeric" min={0} value={durationSec} onChange={(e) => setDurationSec(e.target.value)} />
              </label>
            )}
          </div>
          {behavior?.measures.includes('intensity') && (
            <div className="stack">
              <span className="label">強度（任意）</span>
              <div className="intensity" role="group" aria-label="強度">
                {behavior.intensityLevels.map((l) => (
                  <button key={l.level} type="button" aria-pressed={intensity === l.level} title={l.label} onClick={() => setIntensity(intensity === l.level ? null : l.level)}>{l.level}</button>
                ))}
              </div>
            </div>
          )}
        </section>
        {eventId && history && history.length > 0 && (
          <section className="card stack">
            <p className="card__title">変更履歴</p>
            {history.map((h) => (
              <div key={h.id} className="muted">
                {h.at.slice(0, 16).replace('T', ' ')} ・ {actionLabel[h.action] ?? h.action} ・ {members.find((m) => m.id === h.actorId)?.displayName ?? ''}
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
