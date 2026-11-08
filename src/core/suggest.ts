import { addMonths, periodOf } from "./dates.ts";
import { groupKey, suggestedPattern } from "./labels.ts";
import type { Tx } from "./types.ts";

export interface Suggestion {
  account: string;
  direction: "debit" | "credit";
  /** Motif proposé (libellé normalisé, sans chiffres ni références SEPA après `ICS`). */
  pattern: string;
  sampleLabel: string;
  /** Nombre de mois distincts où l'opération apparaît. */
  months: number;
  medianDay: number;
  medianCents: number;
  minCents: number;
  maxCents: number;
  /** Montant qui varie de plus de 5 % autour de la médiane. */
  variable: boolean;
  txIds: string[];
}

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/**
 * Opérations qui reviennent : même compte, même sens, même libellé normalisé, présentes
 * dans au moins `minMonths` mois distincts parmi les `lookbackMonths` derniers.
 * `covered` : opérations déjà rattachées à une règle, exclues.
 */
export function suggestRecurring(
  txs: Tx[],
  covered: ReadonlySet<string>,
  today: string,
  lookbackMonths = 6,
  minMonths = 3,
): Suggestion[] {
  const since = `${addMonths(periodOf(today), -lookbackMonths)}-01`;
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (t.date < since || covered.has(t.id) || t.cents === 0) continue;
    // Regroupement sur le motif proposé : un mandat renouvelé (RUM) reste dans le même groupe.
    const key = suggestedPattern(groupKey(t.label));
    if (key.length < 3) continue;
    const id = `${t.account}|${t.cents < 0 ? "debit" : "credit"}|${key}`;
    const list = groups.get(id);
    if (list) list.push(t);
    else groups.set(id, [t]);
  }
  const out: Suggestion[] = [];
  for (const [id, list] of groups) {
    const months = new Set(list.map((t) => periodOf(t.date)));
    if (months.size < minMonths) continue;
    // Plus de 2 opérations par mois en moyenne : achat fréquent, pas une échéance.
    if (list.length > months.size * 2) continue;
    const [account, direction, pattern] = id.split("|");
    const amounts = list.map((t) => Math.abs(t.cents));
    const med = median(amounts);
    const minCents = Math.min(...amounts);
    const maxCents = Math.max(...amounts);
    out.push({
      account,
      direction: direction as Suggestion["direction"],
      pattern,
      sampleLabel: list[list.length - 1].label,
      months: months.size,
      medianDay: median(list.map((t) => Number(t.date.slice(8, 10)))),
      medianCents: med,
      minCents,
      maxCents,
      variable: maxCents - minCents > med * 0.05,
      txIds: list.map((t) => t.id),
    });
  }
  return out.sort(
    (a, b) => b.months - a.months || b.medianCents - a.medianCents,
  );
}
