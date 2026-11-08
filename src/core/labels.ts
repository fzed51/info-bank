import type { RecurringRule } from "./types.ts";

/**
 * Libellé normalisé pour comparer des opérations : majuscules sans accents,
 * sans dates (12/10, 12.10.26), ni longues suites de chiffres (cartes, références).
 * `keepNumbers` garde ces suites, pour un motif qui s'en sert comme discriminant.
 */
export function normalizeLabel(label: string, keepNumbers = false): string {
  const noDates = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, " ");
  return (keepNumbers ? noDates : noDates.replace(/\d{4,}/g, " "))
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Clé de regroupement des suggestions : libellé normalisé sans aucun chiffre. */
export const groupKey = (label: string): string =>
  normalizeLabel(label).replace(/\d+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Motif proposé pour une clé de regroupement : coupé avant les références techniques
 * des prélèvements SEPA (`ICS` identifiant créancier, puis `RUM` mandat et référence
 * propre à chaque échéance), illisibles et sans utilité pour reconnaître l'opération.
 * La clé entière est gardée si ce qui précède est trop court.
 */
export function suggestedPattern(key: string): string {
  const head = key.split(/(?:^|\s)ICS(?:\s|$)/)[0].trim();
  return head.length >= 3 ? head : key;
}

const regexCache = new Map<string, RegExp | null>();

/** Expression régulière compilée, ou `null` si elle est invalide. */
export function compileRegex(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      re = null;
    }
    regexCache.set(pattern, re);
  }
  return regexCache.get(pattern) ?? null;
}

export function labelMatches(
  match: RecurringRule["match"],
  label: string,
): boolean {
  if (match.mode === "regex")
    return compileRegex(match.pattern)?.test(label) ?? false;
  // Un motif qui contient des chiffres s'en sert pour distinguer des libellés
  // (« CARTE 0026 » / « CARTE 7857 ») : ils sont alors gardés des deux côtés.
  const keepNumbers = /\d/.test(match.pattern);
  const needle = normalizeLabel(match.pattern, keepNumbers);
  return needle !== "" && normalizeLabel(label, keepNumbers).includes(needle);
}
