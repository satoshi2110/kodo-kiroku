/** 支援計画の項目を文にする（変更履歴・合意・PDF で使う） */
import { formatDateJa, formatShortDate } from './date';
import { mainFormat } from './series';
import { FUNCTION_LABEL, type Behavior, type PlanContent, type PlanCriterion } from '../db/types';

export function criterionText(c: PlanCriterion, behaviors: Behavior[]): string {
  const b = behaviors.find((x) => x.id === c.behaviorId);
  if (!b) return '（非表示の行動）';
  const perDay = b.method === 'frequency' || b.method === 'duration' ? '1日' : '';
  return `${b.name} ${perDay}${mainFormat(b)(c.value)}${c.op === 'lte' ? '以下' : '以上'}${(c.weeks ?? 1) > 1 ? `を${c.weeks}週連続` : ''}${c.note ? `（${c.note}）` : ''}${c.deadline ? ` ・ ${formatShortDate(c.deadline)}までに` : ''}`;
}

export function fieldText(p: PlanContent | null, key: keyof PlanContent, behaviors: Behavior[]): string {
  if (!p) return '（なし）';
  const nameOf = (id: string | null) => (id ? behaviors.find((b) => b.id === id)?.name ?? '（非表示の行動）' : '');
  let t = '';
  switch (key) {
    case 'problemBehaviorId':
    case 'alternativeBehaviorId':
      t = nameOf(p[key]);
      break;
    case 'func':
      t = p.func ? FUNCTION_LABEL[p.func] : '';
      break;
    case 'criteria':
      t = p.criteria.map((c) => criterionText(c, behaviors)).join(' ／ ');
      break;
    case 'reviewDate':
      t = p.reviewDate ? formatDateJa(p.reviewDate) : '';
      break;
    default:
      t = p[key] as string;
  }
  return t || '（なし）';
}
