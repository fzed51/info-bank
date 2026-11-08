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
    const txs: Tx[] = raw.map((t) => ({
      id: t.id,
      account: entry.name,
      date: t.date,
      label: t.label,
      cents: toCents(t.amount),
      status: t.status,
    }));
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
