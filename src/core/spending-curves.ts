import { addMonths, daysInMonth, periodOf, periodRange } from "./dates.ts";
import { labelMatches } from "./labels.ts";
import { matchOccurrences } from "./matching.ts";
import { dailySpending, remainingDays } from "./projection.ts";
import type {
  ManualLink,
  RecurringRule,
  SpendingMethodKind,
  Tx,
} from "./types.ts";

/** Dépenses courantes cumulées d'un mois terminé, jour après jour. */
export interface MonthCurve {
  period: string;
  days: number;
  /** `cumCents[d]` : dépenses (positives) de `1` à `d` inclus ; `cumCents[0]` vaut 0. */
  cumCents: number[];
}

/** Mois en cours : réel jusqu'à la veille, puis projection de l'app. */
export interface CurrentCurve {
  period: string;
  days: number;
  /** Dernier jour comptabilisé (la veille de `today`). */
  through: number;
  /** Dépenses cumulées de 0 à `through`. */
  actualCents: number[];
  /** Dépenses cumulées en fin de mois d'après la moyenne des méthodes. */
  endCents: number;
  /** Idem pour chaque méthode disponible. */
  methods: { kind: SpendingMethodKind; endCents: number }[];
}

export interface SpendingCurves {
  months: MonthCurve[];
  current: CurrentCurve;
}

/**
 * Courbes de dépenses courantes cumulées pour comparer le mois en cours aux `previous`
 * mois précédents, chacun repartant de 0. Mêmes dépenses que la projection (`dailySpending`) :
 * débits du compte non rattachés à une règle et non « ignorer ». Les mois sans aucun débit
 * retenu (avant le début de l'historique) sont omis.
 * `txs` et `rules` couvrent tous les comptes : une opération ne sert qu'à une règle (matching).
 */
export function spendingCurves(
  account: string,
  txs: Tx[],
  rules: RecurringRule[],
  links: ManualLink[],
  today: string,
  previous = 2,
): SpendingCurves {
  const current = periodOf(today);
  const occurrences = matchOccurrences(
    rules,
    links,
    txs,
    periodRange(addMonths(current, -14), current),
    today,
  );
  const excluded = new Set(occurrences.flatMap((o) => o.txId ?? []));
  const own = txs.filter((t) => t.account === account);
  const ownRules = rules.filter((r) => r.account === account);
  const ignored = ownRules.filter((r) => r.active && r.kind === "ignore");
  const counted = own.filter(
    (t) =>
      t.cents < 0 &&
      !excluded.has(t.id) &&
      !ignored.some((r) => labelMatches(r.match, t.label)),
  );

  const cumulative = (period: string, upTo: number): number[] => {
    const perDay = Array<number>(upTo + 1).fill(0);
    for (const t of counted)
      if (periodOf(t.date) === period) {
        const day = Number(t.date.slice(8, 10));
        if (day <= upTo) perDay[day] -= t.cents;
      }
    let sum = 0;
    return perDay.map((c) => {
      sum += c;
      return sum;
    });
  };

  const months: MonthCurve[] = [];
  for (let i = previous; i >= 1; i--) {
    const period = addMonths(current, -i);
    const days = daysInMonth(period);
    const cumCents = cumulative(period, days);
    if (cumCents[days] > 0) months.push({ period, days, cumCents });
  }

  const days = daysInMonth(current);
  const through = Number(today.slice(8, 10)) - 1;
  const actualCents = cumulative(current, through);
  const spending = dailySpending(own, ownRules, excluded, today);
  const base = actualCents[through];
  return {
    months,
    current: {
      period: current,
      days,
      through,
      actualCents,
      endCents: base - spending.dailyCents * remainingDays(today),
      methods: spending.basis.methods.flatMap((m) =>
        m.estimateCents === undefined
          ? []
          : [{ kind: m.kind, endCents: base - m.estimateCents }],
      ),
    },
  };
}
