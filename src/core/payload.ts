import {
  addMonths,
  earliestDate,
  latestDate,
  periodOf,
  periodRange,
} from "./dates.ts";
import { checkBookedBalance, dailyHistory } from "./history.ts";
import { matchOccurrences } from "./matching.ts";
import { dailySpending, projectEndOfMonth } from "./projection.ts";
import { sortByAccountOrder } from "./rules.ts";
import type {
  AccountSource,
  BalancePoint,
  Payload,
  PayloadAccount,
  RulesFile,
} from "./types.ts";

/** Profondeur de l'historique publié, en mois. */
export const historyMonths = 12;
/** Opérations détaillées publiées : mois courant et `txMonths - 1` précédents. */
export const txMonths = 3;

/** IBAN masqué : « FR57 •••• E47 ». */
export const maskIban = (iban: string): string =>
  iban.length > 7 ? `${iban.slice(0, 4)} •••• ${iban.slice(-3)}` : iban;

/** Empreinte FNV-1a, identifiant opaque et stable d'un compte. */
export function opaqueKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const latest = (list: BalancePoint[], type: string): BalancePoint | undefined =>
  list
    .filter((b) => b.type === type)
    .reduce<BalancePoint | undefined>(
      (best, b) => (best === undefined || b.date > best.date ? b : best),
      undefined,
    );

export interface BuildStats {
  accounts: number;
  transactions: number;
  occurrences: number;
  /** Écart CLBD (centimes) par compte masqué, si les deux soldes sont connus. */
  bookedGaps: Record<string, number>;
  skipped: string[];
  /** Comptes masqués dans le backoffice, non publiés. */
  hidden: number;
}

/** Assemble le contenu publié à partir des données de connect-bank et des règles. */
export function buildPayload(
  sources: AccountSource[],
  rulesFile: RulesFile,
  today: string,
  generatedAt: string,
  syncError?: string,
): { payload: Payload; stats: BuildStats } {
  const stats: BuildStats = {
    accounts: 0,
    transactions: 0,
    occurrences: 0,
    bookedGaps: {},
    skipped: [],
    hidden: 0,
  };
  // Un compte masqué n'est pas publié du tout (ni onglet, ni Total, ni opérations).
  const hiddenSet = new Set(rulesFile.hiddenAccounts ?? []);
  const published = sortByAccountOrder(
    sources.filter((s) => !hiddenSet.has(s.account)),
    (s) => s.account,
    rulesFile.accountOrder,
  );
  stats.hidden = sources.length - published.length;
  const withBalance = published
    .map((s) => ({
      source: s,
      current: latest(s.balances, "XPCD") ?? latest(s.balances, "CLBD"),
    }))
    .filter((x) => {
      if (!x.current) stats.skipped.push(maskIban(x.source.account));
      return x.current !== undefined;
    });

  const asOf =
    withBalance.reduce(
      (max, x) => (x.current && x.current.date > max ? x.current.date : max),
      "",
    ) || today;
  const allTxs = published.flatMap((s) => s.txs);
  const firstTx = earliestDate(asOf, ...allTxs.map((t) => t.date));
  const limit = `${addMonths(periodOf(asOf), -historyMonths)}-01`;
  const historyStart = latestDate(firstTx, limit);

  const periods = periodRange(
    addMonths(periodOf(asOf), -historyMonths),
    periodOf(asOf),
  );
  const occurrences = matchOccurrences(
    rulesFile.rules,
    rulesFile.links,
    allTxs,
    periods,
    today,
  );
  const ruleOfTx = new Map<string, string>();
  for (const o of occurrences) if (o.txId) ruleOfTx.set(o.txId, o.name);

  const txSince = `${addMonths(periodOf(asOf), -(txMonths - 1))}-01`;
  const accounts: PayloadAccount[] = withBalance.map(({ source, current }) => {
    const ref = current as BalancePoint;
    const booked = latest(source.balances, "CLBD");
    if (ref.type === "XPCD" && booked)
      stats.bookedGaps[maskIban(source.account)] = checkBookedBalance(
        source.txs,
        ref,
        booked,
      );
    const own = occurrences.filter((o) => o.account === source.account);
    const thisMonth = own.filter((o) => o.period === periodOf(ref.date));
    const spending = dailySpending(
      source.txs,
      rulesFile.rules.filter((r) => r.account === source.account),
      new Set(ruleOfTx.keys()),
      ref.date,
    );
    const transactions = source.txs
      .filter((t) => t.date >= txSince)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((t) => ({
        date: t.date,
        label: t.label,
        cents: t.cents,
        pending: t.status === "pending",
        ...(ruleOfTx.has(t.id) ? { rule: ruleOfTx.get(t.id) } : {}),
      }));
    stats.accounts++;
    stats.transactions += transactions.length;
    stats.occurrences += thisMonth.length;
    return {
      key: opaqueKey(source.account),
      name:
        rulesFile.accountNames[source.account] ??
        `Compte ${source.account.slice(-3)}`,
      maskedIban: maskIban(source.account),
      currency: source.currency,
      balance: { cents: ref.cents, date: ref.date, type: ref.type },
      history: dailyHistory(source.txs, ref, historyStart, asOf),
      transactions,
      occurrences: thisMonth.map(({ account: _a, txId: _t, ...o }) => o),
      projection: projectEndOfMonth(
        ref.cents,
        ref.date,
        thisMonth,
        spending.dailyCents,
        spending.basis,
      ),
    };
  });

  return {
    payload: {
      v: 1,
      generatedAt,
      asOf,
      ...(syncError ? { syncError } : {}),
      historyStart,
      accounts,
    },
    stats,
  };
}
