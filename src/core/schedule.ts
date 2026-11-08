import { daysInMonth, monthOf, monthsBetween } from "./dates.ts";
import type { Schedule } from "./types.ts";

/** Le calendrier prévoit-il une occurrence pour ce mois (YYYY-MM) ? */
export function isScheduled(schedule: Schedule, period: string): boolean {
  if (schedule.start && period < schedule.start) return false;
  if (schedule.end && period > schedule.end) return false;
  if (schedule.months?.length && !schedule.months.includes(monthOf(period)))
    return false;
  if (schedule.every && schedule.every.n > 1) {
    const diff = monthsBetween(schedule.every.anchor, period);
    if (((diff % schedule.every.n) + schedule.every.n) % schedule.every.n)
      return false;
  }
  return true;
}

/** Date attendue de l'occurrence du mois, ou `undefined` si le mois n'est pas concerné. */
export function expectedDate(
  schedule: Schedule,
  period: string,
): string | undefined {
  if (!isScheduled(schedule, period)) return undefined;
  const day = Math.min(Math.max(1, schedule.day), daysInMonth(period));
  return `${period}-${String(day).padStart(2, "0")}`;
}

const monthNames = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

export const monthName = (m: number): string => monthNames[m - 1] ?? "?";

/** Description courte d'un calendrier, ex. « le 5, 1 mois sur 2 ». */
export function describeSchedule(s: Schedule): string {
  const parts = [`le ${s.day} (±${s.windowDays} j)`];
  if (s.every && s.every.n > 1)
    parts.push(`1 mois sur ${s.every.n} depuis ${s.every.anchor}`);
  if (s.months?.length && s.months.length < 12) {
    const span = contiguousSpan(s.months);
    parts.push(
      span
        ? `de ${monthName(span[0])} à ${monthName(span[1])}`
        : [...s.months]
            .sort((a, b) => a - b)
            .map(monthName)
            .join(", "),
    );
  }
  if (s.start) parts.push(`à partir de ${s.start}`);
  if (s.end) parts.push(`jusqu'à ${s.end}`);
  return parts.join(", ");
}

/** Mois d'une plage, éventuellement à cheval sur deux années (ex. 10 → 3). */
export function monthSpan(from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === to || out.length === 12) return out;
  }
}

/**
 * Premier et dernier mois si `months` forme une plage continue (éventuellement à cheval
 * sur deux années, ex. nov. → févr.), sinon `undefined`.
 */
export function contiguousSpan(months: number[]): [number, number] | undefined {
  const set = new Set(months);
  if (set.size === 0 || set.size === 12) return undefined;
  const starts = [...set].filter((m) => !set.has(m === 1 ? 12 : m - 1));
  if (starts.length !== 1) return undefined;
  const span = monthSpan(starts[0], ((starts[0] + set.size - 2) % 12) + 1);
  return span.every((m) => set.has(m))
    ? [starts[0], span[span.length - 1]]
    : undefined;
}
