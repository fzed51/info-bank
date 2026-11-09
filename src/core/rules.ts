import { compileRegex } from "./labels.ts";
import type { RecurringRule, RulesFile, Schedule } from "./types.ts";

export const emptyRulesFile = (): RulesFile => ({
  v: 1,
  accountNames: {},
  rules: [],
  links: [],
});

const period = /^\d{4}-(0[1-9]|1[0-2])$/;
const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isCents = (v: unknown): v is number => isInt(v, 0, 1e11);

function scheduleError(s: Schedule): string | undefined {
  if (!isInt(s.day, 1, 31)) return "jour attendu entre 1 et 31";
  if (!isInt(s.windowDays, 0, 15)) return "tolérance entre 0 et 15 jours";
  if (
    s.months !== undefined &&
    (!Array.isArray(s.months) || !s.months.every((m) => isInt(m, 1, 12)))
  )
    return "mois entre 1 et 12";
  if (
    s.every !== undefined &&
    (!isInt(s.every.n, 1, 24) || !period.test(s.every.anchor))
  )
    return "périodicité : 1 à 24 mois et mois de départ YYYY-MM";
  if (s.start !== undefined && !period.test(s.start)) return "début YYYY-MM";
  if (s.end !== undefined && !period.test(s.end)) return "fin YYYY-MM";
  if (s.start && s.end && s.start > s.end) return "début après la fin";
  return undefined;
}

/** Message d'erreur de la règle, ou `undefined` si elle est valide. */
export function ruleError(r: RecurringRule): string | undefined {
  if (typeof r.id !== "string" || r.id === "") return "identifiant manquant";
  if (typeof r.account !== "string" || r.account === "")
    return "compte manquant";
  if (typeof r.name !== "string" || r.name.trim() === "") return "nom manquant";
  if (r.kind !== "recurring" && r.kind !== "ignore") return "type inconnu";
  if (r.direction !== "debit" && r.direction !== "credit")
    return "sens inconnu";
  if (typeof r.match?.pattern !== "string" || r.match.pattern.trim() === "")
    return "motif de libellé manquant";
  if (r.match.mode === "regex" && compileRegex(r.match.pattern) === null)
    return "expression régulière invalide";
  if (r.match.mode !== "regex" && r.match.mode !== "contains")
    return "mode de recherche inconnu";
  const a = r.amount;
  if (a?.kind === "fixed") {
    if (!isCents(a.cents) || !isCents(a.toleranceCents))
      return "montant fixe invalide";
  } else if (a?.kind === "variable") {
    if (!isCents(a.estimateCents)) return "estimation invalide";
    if (a.minCents !== undefined && !isCents(a.minCents))
      return "minimum invalide";
    if (a.maxCents !== undefined && !isCents(a.maxCents))
      return "maximum invalide";
    if (
      a.minCents !== undefined &&
      a.maxCents !== undefined &&
      a.minCents > a.maxCents
    )
      return "minimum supérieur au maximum";
  } else return "type de montant inconnu";
  return scheduleError(r.schedule ?? ({} as Schedule));
}

/** Contrôle un fichier de règles lu sur disque ou reçu par l'API ; lève une erreur explicite. */
export function validateRulesFile(value: unknown): RulesFile {
  const f = value as RulesFile;
  if (typeof f !== "object" || f === null || f.v !== 1)
    throw new Error("Fichier de règles : version inconnue.");
  if (
    typeof f.accountNames !== "object" ||
    f.accountNames === null ||
    !Object.values(f.accountNames).every((n) => typeof n === "string")
  )
    throw new Error("Fichier de règles : noms de comptes invalides.");
  for (const [field, label] of [
    ["hiddenAccounts", "comptes masqués"],
    ["accountOrder", "ordre des comptes"],
  ] as const) {
    const list = f[field];
    if (
      list !== undefined &&
      (!Array.isArray(list) || !list.every((a) => typeof a === "string"))
    )
      throw new Error(`Fichier de règles : ${label} invalides.`);
  }
  if (!Array.isArray(f.rules) || !Array.isArray(f.links))
    throw new Error("Fichier de règles : listes manquantes.");
  const ids = new Set<string>();
  for (const r of f.rules) {
    const error = ruleError(r);
    if (error) throw new Error(`Règle « ${r?.name ?? "?"} » : ${error}.`);
    if (ids.has(r.id)) throw new Error(`Règle en double : ${r.id}.`);
    ids.add(r.id);
  }
  for (const l of f.links) {
    if (
      !ids.has(l?.ruleId) ||
      !period.test(l.period) ||
      typeof l.txId !== "string"
    )
      throw new Error("Fichier de règles : liaison manuelle invalide.");
  }
  return f;
}

export const newRuleId = (): string => `r-${crypto.randomUUID().slice(0, 8)}`;

/**
 * Trie selon l'ordre choisi dans le backoffice : les comptes de `order` d'abord, dans cet
 * ordre, puis les autres dans leur ordre d'origine (nouveau compte : en dernier).
 */
export function sortByAccountOrder<T>(
  items: T[],
  accountOf: (item: T) => string,
  order: string[] = [],
): T[] {
  const rank = new Map(order.map((a, i) => [a, i]));
  const at = (item: T, i: number) =>
    rank.get(accountOf(item)) ?? order.length + i;
  return items
    .map((item, i) => ({ item, pos: at(item, i) }))
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.item);
}

export type RuleSortKey = "name" | "amount" | "schedule";

/** Montant attendu signé (débit négatif) ; `undefined` pour une règle « ignorer ». */
export function ruleAmountCents(r: RecurringRule): number | undefined {
  if (r.kind === "ignore") return undefined;
  const cents =
    r.amount.kind === "fixed" ? r.amount.cents : r.amount.estimateCents;
  return r.direction === "debit" ? -cents : cents;
}

/**
 * Règles triées par nom, montant signé ou jour du calendrier (puis par nom).
 * Les règles « ignorer », sans montant ni calendrier affichés, restent en fin de liste
 * quel que soit le sens du tri.
 */
export function sortRules(
  rules: RecurringRule[],
  key: RuleSortKey,
  dir: "asc" | "desc",
): RecurringRule[] {
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: RecurringRule, b: RecurringRule): number =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  const value = (r: RecurringRule): number | undefined =>
    key === "amount"
      ? ruleAmountCents(r)
      : r.kind === "ignore"
        ? undefined
        : r.schedule.day;
  return [...rules].sort((a, b) => {
    if (key === "name") return sign * byName(a, b);
    const va = value(a);
    const vb = value(b);
    if (va === undefined || vb === undefined)
      return va === vb ? byName(a, b) : va === undefined ? 1 : -1;
    return sign * (va - vb) || byName(a, b);
  });
}
