// Dates calendaires sous forme de chaînes YYYY-MM-DD / YYYY-MM, calculées en UTC
// pour éviter les décalages d'heure d'été.

const dayMs = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, "0");

/** Date locale du jour (fuseau de la machine), YYYY-MM-DD. */
export const localToday = (now = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const periodOf = (date: string): string => date.slice(0, 7);

export function daysInMonth(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const monthOf = (period: string): number => Number(period.slice(5, 7));

/** Nombre de mois de `from` à `to` (négatif si `to` est antérieur). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

const toUtc = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: string, n: number): string =>
  fromUtc(toUtc(date) + n * dayMs);

/** Nombre de jours de `from` à `to`. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((toUtc(to) - toUtc(from)) / dayMs);

/** Périodes de `from` à `to` incluses. */
export function periodRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
}

/** Plus récente / plus ancienne de plusieurs dates (chaînes ISO, comparables directement). */
export const latestDate = (...dates: string[]): string =>
  [...dates].sort().at(-1) ?? "";
export const earliestDate = (...dates: string[]): string =>
  [...dates].sort()[0] ?? "";
