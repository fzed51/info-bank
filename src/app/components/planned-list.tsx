import { useState } from "preact/hooks";
import type { OccurrenceStatus, PayloadOccurrence } from "../../core/types.ts";
import { amountClass, formatCents, formatShortDate } from "../format.ts";

interface Props {
  occurrences: PayloadOccurrence[];
  currency: string;
}

/** Texte et symbole de chaque statut : la couleur n'est jamais seule (DESIGN.md §6). */
export const statusLabels: Record<OccurrenceStatus, [string, string]> = {
  passee: ["✓", "passée"],
  "a-venir": ["○", "à venir"],
  "en-retard": ["!", "en retard"],
  ignoree: ["—", "ignorée"],
};

export function StatusBadge({ status }: { status: OccurrenceStatus }) {
  const [symbol, text] = statusLabels[status];
  return (
    <span class={`badge badge-${status}`}>
      <span aria-hidden="true">{symbol}</span> {text}
    </span>
  );
}

/** Encore attendue ce mois-ci (à venir ou en retard), par opposition à passée ou ignorée. */
export const isPending = (o: PayloadOccurrence): boolean =>
  o.status === "a-venir" || o.status === "en-retard";

function Row({ o, currency }: { o: PayloadOccurrence; currency: string }) {
  const done = o.status === "passee";
  const cents = done && o.txCents !== undefined ? o.txCents : o.expectedCents;
  return (
    <li class="ledger-row">
      <span class="ledger-date figures">
        {formatShortDate(done && o.txDate ? o.txDate : o.expected)}
      </span>
      <span class="ledger-label">
        {o.name}
        <StatusBadge status={o.status} />
      </span>
      <span
        class={`${amountClass(cents)}${o.status === "ignoree" ? " struck" : ""}`}
      >
        {done ? "" : "≈ "}
        {formatCents(cents, currency, true)}
      </span>
    </li>
  );
}

export function PlannedList({ occurrences, currency }: Props) {
  // Les opérations encore attendues d'abord ; les passées (et ignorées) à la demande.
  const [showPast, setShowPast] = useState(false);
  const upcoming = occurrences.filter(isPending);
  const past = occurrences.filter((o) => !isPending(o));
  return (
    <section class="card" aria-labelledby="planned-title">
      <h2 id="planned-title" class="section-title">
        Opérations prévues ce mois-ci
      </h2>
      {occurrences.length === 0 ? (
        <p class="muted">
          Aucune opération récurrente déclarée (backoffice local).
        </p>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <p class="muted">Plus aucune opération attendue ce mois-ci.</p>
          ) : (
            <ul class="ledger">
              {upcoming.map((o) => (
                <Row key={o.ruleId + o.period} o={o} currency={currency} />
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <button
              type="button"
              class="button"
              aria-expanded={showPast}
              aria-controls="planned-past"
              onClick={() => setShowPast(!showPast)}
            >
              {showPast
                ? "Masquer les opérations passées"
                : `Afficher les opérations passées (${past.length})`}
            </button>
          )}
          {showPast && (
            <ul
              id="planned-past"
              class="ledger"
              aria-label="Opérations passées ce mois-ci"
            >
              {past.map((o) => (
                <Row key={o.ruleId + o.period} o={o} currency={currency} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
