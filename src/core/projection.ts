import {
  addDays,
  addMonths,
  addMonthsToDate,
  daysInMonth,
  periodOf,
  weekdayOf,
} from "./dates.ts";
import { labelMatches } from "./labels.ts";
import type {
  Occurrence,
  Projection,
  RecurringRule,
  SpendingBasis,
  SpendingMethod,
  SpendingMethodKind,
  Tx,
} from "./types.ts";

/** Fenêtre glissante de la moyenne journalière, en jours. */
export const rollingDays = 90;
/** Profondeur des moyennes par jour de la semaine et par jour du mois, en mois. */
export const patternMonths = 12;

/**
 * Jours restants jusqu'à la fin du mois, `asOf` compris : la synchro tourne la nuit et les
 * paiements sont comptabilisés au plus tôt le lendemain, donc les dépenses du jour du
 * solde ne sont pas encore dans le solde.
 */
export const remainingDays = (asOf: string): number =>
  daysInMonth(periodOf(asOf)) - Number(asOf.slice(8, 10)) + 1;

/** Dates de `from` à `to` incluses (vide si `from` est postérieure). */
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Arrondi au centime, sans « −0 ». */
const roundCents = (x: number): number => Math.round(x) + 0;

/**
 * Dépense courante estimée jusqu'à la fin du mois de `asOf`, moyenne de quatre méthodes
 * (voir `SpendingMethodKind`). Seuls comptent les débits jusqu'à la veille de `asOf`
 * (le jour du solde est encore incomplet), non rattachés à une règle récurrente (`excluded`) et ne relevant pas d'une règle « ignorer ».
 * Une fenêtre commence au plus tôt à la première opération connue du compte ; le même mois
 * de l'année précédente n'est retenu que s'il est couvert en entier, et une moyenne par
 * jour n'est retenue que si chaque jour restant a au moins un jour de référence.
 * Rend la moyenne par jour (négative) et la base du calcul, affichée dans l'app.
 */
export function dailySpending(
  txs: Tx[],
  rules: RecurringRule[],
  excluded: ReadonlySet<string>,
  asOf: string,
): { dailyCents: number; basis: SpendingBasis } {
  const first = txs.reduce<string | undefined>(
    (min, t) => (min === undefined || t.date < min ? t.date : min),
    undefined,
  );
  // Fenêtres arrêtées à la veille : le jour du solde est presque vide à l'heure de la synchro.
  const end = addDays(asOf, -1);
  const lastYear = addMonths(periodOf(asOf), -12);
  const lastYearFrom = `${lastYear}-01`;
  const lastYearTo = addDays(`${addMonths(lastYear, 1)}-01`, -1);
  const rollingFrom = addDays(end, -(rollingDays - 1));
  const patternFrom = addMonthsToDate(asOf, -patternMonths);

  // Débits retenus et écartés, par jour.
  const ignored = rules.filter((r) => r.active && r.kind === "ignore");
  const days = new Map<
    string,
    { cents: number; count: number; excluded: number }
  >();
  for (const t of txs) {
    if (t.cents >= 0 || t.date < lastYearFrom || t.date > end) continue;
    const day = days.get(t.date) ?? { cents: 0, count: 0, excluded: 0 };
    days.set(t.date, day);
    if (
      excluded.has(t.id) ||
      ignored.some(
        (r) => r.account === t.account && labelMatches(r.match, t.label),
      )
    ) {
      day.excluded++;
      continue;
    }
    day.count++;
    day.cents += t.cents;
  }
  const debitOn = (d: string): number => days.get(d)?.cents ?? 0;

  const window = (
    kind: SpendingMethodKind,
    nominalFrom: string,
    to: string,
  ): { method: SpendingMethod; dates: string[] } => {
    // Sans historique dans la fenêtre, elle garde ses bornes nominales et reste vide.
    const covered = first !== undefined && first <= to;
    const from = covered && first > nominalFrom ? first : nominalFrom;
    const dates = covered ? eachDay(from, to) : [];
    const method: SpendingMethod = {
      kind,
      from,
      to,
      days: dates.length,
      partial: !covered || from !== nominalFrom,
      count: 0,
      totalCents: 0,
    };
    for (const d of dates) {
      method.count += days.get(d)?.count ?? 0;
      method.totalCents += debitOn(d);
    }
    return { method, dates };
  };

  const remaining = remainingDays(asOf);
  const future = eachDay(asOf, addDays(asOf, remaining - 1));
  /** Somme, sur les jours restants, de la moyenne des jours de référence de même clé. */
  const byKey = (
    dates: string[],
    key: (d: string) => number,
  ): number | undefined => {
    const n = new Map<number, number>();
    const sum = new Map<number, number>();
    for (const d of dates) {
      const k = key(d);
      n.set(k, (n.get(k) ?? 0) + 1);
      sum.set(k, (sum.get(k) ?? 0) + debitOn(d));
    }
    let total = 0;
    for (const d of future) {
      const k = key(d);
      const count = n.get(k);
      if (!count) return undefined;
      total += (sum.get(k) ?? 0) / count;
    }
    return total;
  };

  const rolling = window("rolling", rollingFrom, end);
  const sameMonth = window("lastYear", lastYearFrom, lastYearTo);
  const weekday = window("weekday", patternFrom, end);
  const monthDay = window("monthDay", patternFrom, end);
  const perDay = (m: SpendingMethod): number =>
    (m.totalCents / m.days) * remaining;
  const estimates: [SpendingMethod, number | undefined][] = [
    [
      rolling.method,
      rolling.method.days > 0 ? perDay(rolling.method) : undefined,
    ],
    [
      sameMonth.method,
      sameMonth.method.days > 0 && !sameMonth.method.partial
        ? perDay(sameMonth.method)
        : undefined,
    ],
    [weekday.method, byKey(weekday.dates, weekdayOf)],
    [monthDay.method, byKey(monthDay.dates, (d) => Number(d.slice(8, 10)))],
  ];
  const methods = estimates.map(([m, e]) =>
    e === undefined ? m : { ...m, estimateCents: roundCents(e) },
  );
  const used = estimates.flatMap(([m, e]) =>
    e === undefined ? [] : [{ m, e }],
  );

  // Débits écartés sur l'union des fenêtres retenues (elles se chevauchent jusqu'à la veille).
  let excludedCount = 0;
  if (used.length > 0) {
    const from = used.map(({ m }) => m.from).sort()[0];
    for (const [d, day] of days) if (d >= from) excludedCount += day.excluded;
  }
  const mean = used.reduce((s, { e }) => s + e, 0) / (used.length || 1);
  return {
    dailyCents: roundCents(mean / remaining),
    basis: { methods, excludedCount },
  };
}

/**
 * Fin de mois estimée = solde + opérations prévues restantes (à venir ou en retard)
 * + dépense courante moyenne × jours restants.
 */
export function projectEndOfMonth(
  balanceCents: number,
  asOf: string,
  occurrences: Occurrence[],
  dailyEstimateCents: number,
  basis?: SpendingBasis,
): Projection {
  const period = periodOf(asOf);
  const remaining = occurrences.filter(
    (o) =>
      o.period === period &&
      (o.status === "a-venir" || o.status === "en-retard"),
  );
  const plannedCents = remaining.reduce((s, o) => s + o.expectedCents, 0);
  const daysRemaining = remainingDays(asOf);
  const estimateCents = dailyEstimateCents * daysRemaining;
  return {
    balanceCents,
    plannedCents,
    plannedCount: remaining.length,
    estimateCents,
    dailyEstimateCents,
    daysRemaining,
    endCents: balanceCents + plannedCents + estimateCents,
    ...(basis ? { spending: basis } : {}),
  };
}

/**
 * Solde non budgété : ce qui resterait sur le compte une fois payées toutes les
 * opérations prévues restantes du mois, avant les dépenses courantes estimées.
 * Jamais négatif : un découvert prévu n'est pas un solde « libre ».
 */
export const unbudgetedCents = (p: Projection): number =>
  Math.max(0, p.balanceCents + p.plannedCents);

/** Somme de plusieurs projections (vue « Total »). */
export function sumProjections(list: Projection[]): Projection {
  const sum = (k: Exclude<keyof Projection, "spending">): number =>
    list.reduce((s, p) => s + p[k], 0);
  return {
    balanceCents: sum("balanceCents"),
    plannedCents: sum("plannedCents"),
    plannedCount: sum("plannedCount"),
    estimateCents: sum("estimateCents"),
    dailyEstimateCents: sum("dailyEstimateCents"),
    daysRemaining: list[0]?.daysRemaining ?? 0,
    endCents: sum("endCents"),
  };
}
