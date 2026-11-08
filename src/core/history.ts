import { addDays, daysBetween } from "./dates.ts";
import type { Tx } from "./types.ts";

export interface Reference {
  cents: number;
  date: string;
}

const netByDate = (txs: Tx[]): Map<string, number> => {
  const net = new Map<string, number>();
  for (const t of txs) net.set(t.date, (net.get(t.date) ?? 0) + t.cents);
  return net;
};

/**
 * Solde de fin de journée pour chaque jour de `start` à `end`, reconstruit à partir
 * d'un solde de référence (connect-bank n'a pas d'historique de soldes antérieur à sa
 * mise en service) : solde(J) = référence − opérations de ]J, réf] + opérations de ]réf, J].
 */
export function dailyHistory(
  txs: Tx[],
  ref: Reference,
  start: string,
  end: string,
): number[] {
  const length = daysBetween(start, end) + 1;
  if (length <= 0) return [];
  const net = netByDate(txs);
  let balance = ref.cents;
  for (const [date, cents] of net) {
    if (date > start && date <= ref.date) balance -= cents;
    else if (date > ref.date && date <= start) balance += cents;
  }
  const out = [balance];
  for (let i = 1; i < length; i++) {
    balance += net.get(addDays(start, i)) ?? 0;
    out.push(balance);
  }
  return out;
}

/**
 * Écart entre le solde comptable relevé (`CLBD`) et celui déduit du solde provisoire
 * (`XPCD`, qui inclut les opérations en attente). Un écart non nul signale des
 * opérations manquantes ou des dates incohérentes.
 */
export function checkBookedBalance(
  txs: Tx[],
  provisional: Reference,
  booked: Reference,
): number {
  let computed = provisional.cents;
  for (const t of txs) {
    if (t.date > booked.date && t.date <= provisional.date) computed -= t.cents;
    else if (t.status === "pending" && t.date <= booked.date)
      computed -= t.cents;
  }
  return booked.cents - computed;
}
