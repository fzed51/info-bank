import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  periodOf,
} from "./dates.ts";
import { labelMatches } from "./labels.ts";
import type {
  Occurrence,
  Projection,
  RecurringRule,
  SpendingBasis,
  Tx,
} from "./types.ts";

/** Nombre de mois complets servant à estimer les dépenses courantes. */
export const estimateMonths = 3;

/**
 * Dépense courante moyenne par jour (négative), sur les `estimateMonths` mois complets
 * précédant `asOf` : débits non rattachés à une règle récurrente (`excluded`) et ne
 * relevant pas d'une règle « ignorer ». La fenêtre commence au plus tôt à la première
 * opération connue du compte. Rend aussi la base du calcul, affichée dans l'app.
 */
export function dailySpending(
  txs: Tx[],
  rules: RecurringRule[],
  excluded: ReadonlySet<string>,
  asOf: string,
): { dailyCents: number; basis: SpendingBasis } {
  const period = periodOf(asOf);
  const to = addDays(`${period}-01`, -1);
  const nominal = `${addMonths(period, -estimateMonths)}-01`;
  const first = txs.reduce<string | undefined>(
    (min, t) => (min === undefined || t.date < min ? t.date : min),
    undefined,
  );
  const from = first !== undefined && first > nominal ? first : nominal;
  const days = first === undefined ? 0 : Math.max(0, daysBetween(from, to) + 1);
  const basis: SpendingBasis = {
    from,
    to,
    days,
    partial: from !== nominal,
    count: 0,
    totalCents: 0,
    excludedCount: 0,
  };
  if (days === 0) return { dailyCents: 0, basis };
  const ignored = rules.filter((r) => r.active && r.kind === "ignore");
  for (const t of txs) {
    if (t.cents >= 0 || t.date < from || t.date > to) continue;
    if (
      excluded.has(t.id) ||
      ignored.some(
        (r) => r.account === t.account && labelMatches(r.match, t.label),
      )
    ) {
      basis.excludedCount++;
      continue;
    }
    basis.count++;
    basis.totalCents += t.cents;
  }
  return { dailyCents: Math.round(basis.totalCents / days), basis };
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
  const daysRemaining = daysInMonth(period) - Number(asOf.slice(8, 10));
  const estimateCents = dailyEstimateCents * daysRemaining;
  return {
    balanceCents,
    plannedCents,
    plannedCount: remaining.length,
    estimateCents,
    dailyEstimateCents,
    daysRemaining,
    endCents: balanceCents + plannedCents + estimateCents,
    ...(basis ? { basis } : {}),
  };
}

/** Somme de plusieurs projections (vue « Total »). */
export function sumProjections(list: Projection[]): Projection {
  const sum = (k: Exclude<keyof Projection, "basis">): number =>
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
