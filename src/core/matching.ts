import { addDays, daysBetween } from "./dates.ts";
import { labelMatches } from "./labels.ts";
import { expectedDate } from "./schedule.ts";
import type { ManualLink, Occurrence, RecurringRule, Tx } from "./types.ts";

/** Montant attendu signé d'une règle (fixe, ou estimation si variable). */
export function expectedCents(rule: RecurringRule): number {
  const abs =
    rule.amount.kind === "fixed"
      ? rule.amount.cents
      : rule.amount.estimateCents;
  return rule.direction === "debit" ? -Math.abs(abs) : Math.abs(abs);
}

/** Le montant de l'opération est-il compatible avec la règle (sens et valeur) ? */
export function amountMatches(rule: RecurringRule, cents: number): boolean {
  if (rule.direction === "debit" ? cents >= 0 : cents <= 0) return false;
  const abs = Math.abs(cents);
  const a = rule.amount;
  if (a.kind === "fixed") return Math.abs(abs - a.cents) <= a.toleranceCents;
  if (a.minCents !== undefined && abs < a.minCents) return false;
  if (a.maxCents !== undefined && abs > a.maxCents) return false;
  return true;
}

/** Opération qui correspond à la règle, indépendamment de la date. */
export const txMatchesRule = (rule: RecurringRule, tx: Tx): boolean =>
  tx.account === rule.account &&
  amountMatches(rule, tx.cents) &&
  labelMatches(rule.match, tx.label);

/** Correspondances d'une règle sur tout l'historique chargé. */
export interface RuleHits {
  count: number;
  /** Date de la plus récente (YYYY-MM-DD), absente si aucune. */
  last?: string;
}

/**
 * Opérations qui correspondent à la règle (même critère que l'éditeur : compte, sens,
 * libellé et montant), sans tenir compte de la date ni de l'état actif de la règle.
 */
export function ruleHits(rule: RecurringRule, txs: Tx[]): RuleHits {
  let count = 0;
  let last: string | undefined;
  for (const tx of txs) {
    if (!txMatchesRule(rule, tx)) continue;
    count++;
    if (last === undefined || tx.date > last) last = tx.date;
  }
  return last === undefined ? { count } : { count, last };
}

interface Slot {
  occ: Occurrence;
  rule: RecurringRule;
}

/**
 * Détermine, pour chaque règle récurrente active et chaque mois demandé, si l'opération
 * prévue est passée. Les liaisons manuelles priment ; ensuite, affectation gloutonne
 * globale (écart de date, puis de montant) : une opération ne sert qu'une fois, y compris
 * entre deux mois voisins.
 */
export function matchOccurrences(
  rules: RecurringRule[],
  links: ManualLink[],
  txs: Tx[],
  periods: string[],
  today: string,
): Occurrence[] {
  const txById = new Map(txs.map((t) => [t.id, t]));
  const used = new Set<string>();
  const open: Slot[] = [];
  const all: Occurrence[] = [];

  for (const rule of rules) {
    if (!rule.active || rule.kind !== "recurring") continue;
    for (const period of periods) {
      const expected = expectedDate(rule.schedule, period);
      if (!expected) continue;
      const occ: Occurrence = {
        ruleId: rule.id,
        account: rule.account,
        name: rule.name,
        period,
        expected,
        expectedCents: expectedCents(rule),
        status: "a-venir",
      };
      all.push(occ);
      const link = links.find(
        (l) => l.ruleId === rule.id && l.period === period,
      );
      const linked = link && txById.get(link.txId);
      if (link?.txId === "skip") {
        occ.status = "ignoree";
        occ.manual = true;
      } else if (linked && !used.has(linked.id)) {
        assign(occ, linked, true);
        used.add(linked.id);
      } else open.push({ occ, rule });
    }
  }

  const candidates: { slot: Slot; tx: Tx; cost: number }[] = [];
  for (const slot of open) {
    const { rule, occ } = slot;
    const window = rule.schedule.windowDays;
    for (const tx of txs) {
      if (used.has(tx.id)) continue;
      const gap = Math.abs(daysBetween(occ.expected, tx.date));
      if (gap > window || !txMatchesRule(rule, tx)) continue;
      const amountGap = Math.abs(
        Math.abs(tx.cents) - Math.abs(occ.expectedCents),
      );
      candidates.push({ slot, tx, cost: gap * 1e9 + amountGap });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const done = new Set<Slot>();
  for (const { slot, tx } of candidates) {
    if (done.has(slot) || used.has(tx.id)) continue;
    assign(slot.occ, tx, false);
    used.add(tx.id);
    done.add(slot);
  }

  for (const { occ, rule } of open) {
    if (occ.txId) continue;
    const deadline = addDays(occ.expected, rule.schedule.windowDays);
    occ.status = today > deadline ? "en-retard" : "a-venir";
  }
  return all.sort(
    (a, b) =>
      a.expected.localeCompare(b.expected) || a.name.localeCompare(b.name),
  );
}

function assign(occ: Occurrence, tx: Tx, manual: boolean): void {
  occ.status = "passee";
  occ.txId = tx.id;
  occ.txDate = tx.date;
  occ.txCents = tx.cents;
  if (manual) occ.manual = true;
}
