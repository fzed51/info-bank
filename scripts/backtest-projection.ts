// Rejeu des méthodes d'estimation des dépenses courantes (src/core/projection.ts).
// Pour chaque jour J des mois complets de l'historique, chaque méthode est calculée avec les
// seules opérations antérieures à J, puis comparée aux dépenses courantes réelles de J à la
// fin du mois. Compare ensuite les méthodes seules, la moyenne à poids égaux (utilisée par
// l'app) et des poids ajustés, validés sur un mois laissé de côté.
// Lit des données réelles : la sortie ne contient que des pourcentages, aucun montant.
// Usage : npm run backtest
import { config } from "../src/build/config.ts";
import { loadRules } from "../src/build/rules-store.ts";
import { loadSources } from "../src/build/source.ts";
import {
  addDays,
  addMonths,
  localToday,
  periodOf,
  periodRange,
} from "../src/core/dates.ts";
import { labelMatches } from "../src/core/labels.ts";
import { matchOccurrences } from "../src/core/matching.ts";
import { dailySpending } from "../src/core/projection.ts";
import type { SpendingMethodKind } from "../src/core/types.ts";

interface Sample {
  month: string;
  /** Estimation de chaque méthode, dans l'ordre de `SpendingBasis.methods`. */
  estimates: (number | undefined)[];
  actualCents: number;
  monthCents: number;
}

interface Score {
  /** Erreur absolue moyenne, en % des dépenses courantes du mois. */
  mae: number;
  /** Erreur moyenne signée : positive si les dépenses sont sous-estimées. */
  bias: number;
  days: number;
}

const today = localToday();
const rulesFile = loadRules();
const sources = loadSources(config.connectBankOut).filter(
  (s) => s.txs.length > 0,
);
const allTxs = sources.flatMap((s) => s.txs);
const firstTx = allTxs.map((t) => t.date).sort()[0];
if (firstTx === undefined) {
  console.error("Aucune opération : rien à rejouer.");
  process.exitCode = 1;
} else run(firstTx);

function run(first: string): void {
  // Mois complets : du mois qui suit la première opération au mois précédent.
  const months = periodRange(
    addMonths(periodOf(first), 1),
    addMonths(periodOf(today), -1),
  );
  if (months.length === 0) {
    console.error("Pas encore de mois complet dans l'historique.");
    process.exitCode = 1;
    return;
  }
  // Rattachement aux règles comme au build (src/core/payload.ts).
  const occurrences = matchOccurrences(
    rulesFile.rules,
    rulesFile.links,
    allTxs,
    periodRange(addMonths(periodOf(first), -12), periodOf(today)),
    today,
  );
  const excluded = new Set(occurrences.flatMap((o) => o.txId ?? []));

  const samples: Sample[] = [];
  let kinds: SpendingMethodKind[] = [];
  for (const source of sources) {
    const rules = rulesFile.rules.filter((r) => r.account === source.account);
    const ignored = rules.filter((r) => r.active && r.kind === "ignore");
    const counted = source.txs.filter(
      (t) =>
        t.cents < 0 &&
        !excluded.has(t.id) &&
        !ignored.some((r) => labelMatches(r.match, t.label)),
    );
    const sum = (from: string, to: string): number =>
      counted
        .filter((t) => t.date >= from && t.date <= to)
        .reduce((s, t) => s + t.cents, 0);
    for (const month of months) {
      const last = addDays(`${addMonths(month, 1)}-01`, -1);
      const monthCents = sum(`${month}-01`, last);
      if (monthCents === 0) continue;
      for (let day = `${month}-01`; day <= last; day = addDays(day, 1)) {
        const { basis } = dailySpending(source.txs, rules, excluded, day);
        kinds = basis.methods.map((m) => m.kind);
        samples.push({
          month,
          estimates: basis.methods.map((m) => m.estimateCents),
          actualCents: sum(day, last),
          monthCents,
        });
      }
    }
  }

  const combine = (
    estimates: (number | undefined)[],
    weights: number[],
  ): number | undefined => {
    let w = 0;
    let e = 0;
    estimates.forEach((x, i) => {
      if (x !== undefined && weights[i] > 0) {
        w += weights[i];
        e += weights[i] * x;
      }
    });
    return w > 0 ? e / w : undefined;
  };
  const score = (list: Sample[], weights: number[]): Score => {
    let abs = 0;
    let signed = 0;
    let days = 0;
    for (const s of list) {
      const e = combine(s.estimates, weights);
      if (e === undefined) continue;
      const err = (e - s.actualCents) / Math.abs(s.monthCents);
      abs += Math.abs(err);
      signed += err;
      days++;
    }
    return days === 0
      ? { mae: Number.NaN, bias: Number.NaN, days }
      : { mae: (100 * abs) / days, bias: (100 * signed) / days, days };
  };
  const pct = (x: number): string =>
    `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)} %`;
  const show = (r: Score): string =>
    `erreur ${r.mae.toFixed(1).padStart(5)} %  biais ${pct(r.bias).padStart(8)}  (${r.days} j)`;
  const one = (i: number): number[] => kinds.map((_, j) => (j === i ? 1 : 0));
  const equal = kinds.map(() => 1);

  console.log(
    `Rejeu de ${months.join(", ")} : ${samples.length} jours. Erreur en % des dépenses courantes du mois ; biais positif = dépenses sous-estimées.`,
  );
  console.log("\nMéthodes seules :");
  kinds.forEach((k, i) => {
    const r = score(samples, one(i));
    console.log(
      `  ${k.padEnd(9)} ${r.days > 0 ? show(r) : "jamais disponible"}`,
    );
  });

  // Même périmètre : jours où toutes les méthodes déjà disponibles une fois existent.
  const usable = kinds
    .map((_, i) => i)
    .filter((i) => samples.some((s) => s.estimates[i] !== undefined));
  const common = samples.filter((s) =>
    usable.every((i) => s.estimates[i] !== undefined),
  );
  const names = (w: number[]): string =>
    usable.map((i) => `${kinds[i]} ${Math.round(w[i] * 100)} %`).join(" · ");
  console.log(`\nMême périmètre (${common.length} j) :`);
  for (const i of usable)
    console.log(
      `  ${`${kinds[i]} seul`.padEnd(22)} ${show(score(common, one(i)))}`,
    );
  console.log(
    `  ${"poids égaux (app)".padEnd(22)} ${show(score(common, equal))}`,
  );

  // Poids par pas de 5 % sur les méthodes disponibles.
  const steps = 20;
  const grid: number[][] = [];
  const fill = (rest: number, at: number, w: number[]): void => {
    if (at === usable.length - 1) {
      const full = kinds.map(() => 0);
      usable.forEach((k, j) => {
        full[k] = (j === at ? rest : w[j]) / steps;
      });
      grid.push(full);
      return;
    }
    for (let n = 0; n <= rest; n++) fill(rest - n, at + 1, [...w, n]);
  };
  if (usable.length > 0) fill(steps, 0, []);
  const best = (list: Sample[]): number[] =>
    grid
      .map((w) => ({ w, mae: score(list, w).mae }))
      .sort((a, b) => a.mae - b.mae)[0].w;
  const fitted = best(common);
  console.log(
    `\nMeilleurs poids sur tout le rejeu : ${names(fitted)}\n  ${show(score(common, fitted))}`,
  );
  // Validation : poids ajustés sans un mois, testés sur ce mois.
  if (months.length > 1)
    for (const month of months) {
      const test = common.filter((s) => s.month === month);
      if (test.length === 0) continue;
      const w = best(common.filter((s) => s.month !== month));
      console.log(
        `\n${month} laissé de côté, poids ajustés sur les autres mois : ${names(w)}\n  poids ajustés  ${show(score(test, w))}\n  poids égaux    ${show(score(test, equal))}`,
      );
    }
}
