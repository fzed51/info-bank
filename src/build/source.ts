import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AccountSource, BalancePoint, Tx } from "../core/types.ts";

/** Montant « -12.50 » (point décimal, format connect-bank) → centimes entiers, sans flottant. */
export function toCents(amount: string): number {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new Error(`Montant illisible : ${amount}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

// Formats écrits par connect-bank (src/model.ts) : seuls les champs utilisés sont décrits.
interface CbTransaction {
  id: string;
  account: string;
  date: string;
  label: string;
  amount: string;
  currency: string;
  status: "booked" | "pending";
}
interface CbBalance {
  type: string;
  amount: string;
  currency: string;
  referenceDate: string;
}

/** Id calculé par connect-bank sur le contenu (`eb:<hash>#<rang>`), faute d'identifiant bancaire. */
const isContentId = (id: string): boolean => /#\d+$/.test(id);

/**
 * connect-bank dédoublonne par id : une opération d'abord stockée sous un id de contenu revient,
 * une fois la référence bancaire attribuée, sous cet id avec un libellé complété, et les deux
 * copies restent. On écarte alors la copie à id de contenu quand une copie à id bancaire a le même
 * compte, la même date, le même montant et un libellé qui contient le sien (une pour une : deux
 * opérations identiques le même jour restent deux).
 */
export function dropSupersededTxs(txs: Tx[]): Tx[] {
  const norm = (label: string): string => label.replace(/\s+/g, " ").trim();
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    const key = `${t.account}|${t.date}|${t.cents}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const dropped = new Set<string>();
  for (const group of groups.values()) {
    const bank = group.filter((t) => !isContentId(t.id));
    const taken = new Set<string>();
    for (const t of group.filter((x) => isContentId(x.id))) {
      const twin = bank.find(
        (b) =>
          !taken.has(b.id) &&
          b.label !== t.label &&
          norm(b.label).includes(norm(t.label)),
      );
      if (!twin) continue;
      taken.add(twin.id);
      dropped.add(t.id);
    }
  }
  return dropped.size === 0 ? txs : txs.filter((t) => !dropped.has(t.id));
}

const readJson = <T>(file: string): T[] =>
  existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T[]) : [];

/** Lit les comptes de connect-bank : `<out>/<IBAN>/api/{transactions,balances}.json`. */
export function loadSources(outDir: string): AccountSource[] {
  if (!existsSync(outDir))
    throw new Error(
      `Dossier de connect-bank introuvable : ${outDir} (CONNECT_BANK_DIR).`,
    );
  const sources: AccountSource[] = [];
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(outDir, entry.name, "api");
    if (!existsSync(dir)) continue;
    const raw = readJson<CbTransaction>(join(dir, "transactions.json"));
    const rawBalances = readJson<CbBalance>(join(dir, "balances.json"));
    const txs: Tx[] = dropSupersededTxs(
      raw.map((t) => ({
        id: t.id,
        account: entry.name,
        date: t.date,
        label: t.label,
        cents: toCents(t.amount),
        status: t.status,
      })),
    );
    const balances: BalancePoint[] = rawBalances.map((b) => ({
      type: b.type,
      date: b.referenceDate,
      cents: toCents(b.amount),
    }));
    sources.push({
      account: entry.name,
      currency: rawBalances[0]?.currency ?? raw[0]?.currency ?? "EUR",
      txs,
      balances,
    });
  }
  return sources;
}
