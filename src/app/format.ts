// Seul point de formatage des montants et des dates (DESIGN.md §5).

const formatters = new Map<string, Intl.NumberFormat>();

const formatter = (currency: string): Intl.NumberFormat => {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", { style: "currency", currency });
    formatters.set(currency, f);
  }
  return f;
};

/** Signe moins typographique (U+2212) à la place du tiret. */
const minus = "−";

/**
 * `1 234,56 €`. `signed` : signe toujours affiché (`+` ou `−`), pour les opérations.
 */
export function formatCents(
  cents: number,
  currency = "EUR",
  signed = false,
): string {
  // Espace fine insécable (U+202F) → insécable (U+00A0) : Fraunces n'a pas de glyphe
  // pour la première, et le séparateur de milliers disparaissait du solde.
  const text = formatter(currency)
    .format(Math.abs(cents) / 100)
    .replaceAll("\u202f", "\u00a0");
  if (cents < 0) return `${minus}${text}`;
  return signed && cents > 0 ? `+${text}` : text;
}

/** Classe CSS de couleur d'un montant (toujours accompagnée du signe). */
export const amountClass = (cents: number): string =>
  cents < 0 ? "amount debit" : cents > 0 ? "amount credit" : "amount";

const at = (date: string): Date => new Date(`${date}T12:00:00`);

const shortDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
});
const longDate = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const monthShort = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const monthLong = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** « 8 nov. » */
export const formatShortDate = (date: string): string =>
  shortDate.format(at(date));
/** « dimanche 8 novembre » */
export const formatLongDate = (date: string): string =>
  longDate.format(at(date));
/** « nov. » */
export const formatMonthShort = (date: string): string =>
  monthShort.format(at(date));
/** « novembre 2026 » */
export const formatMonthLong = (period: string): string =>
  monthLong.format(at(`${period}-01`));
/** « 8 nov., 04:12 » pour un horodatage ISO. */
export const formatTimestamp = (iso: string): string =>
  timeFormat.format(new Date(iso));
