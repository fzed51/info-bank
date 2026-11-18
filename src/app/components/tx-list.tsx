import { useEffect, useMemo, useState } from "preact/hooks";
import type { PayloadTx } from "../../core/types.ts";
import { initialTxIndexes } from "../data.ts";
import {
  amountClass,
  formatCents,
  formatLongDate,
  formatShortDate,
} from "../format.ts";

const pageSize = 30;

interface Props {
  transactions: PayloadTx[];
  currency: string;
}

export function TxList({ transactions, currency }: Props) {
  // Au départ : opérations en cours + dernière comptabilisée ; puis `pageSize` de plus par clic.
  const [shown, setShown] = useState(0);
  // Une seule ligne dépliée à la fois (indice dans `transactions`).
  const [open, setOpen] = useState<number>();
  const initial = useMemo(() => initialTxIndexes(transactions), [transactions]);
  // Autre compte ou nouvelles données : l'indice ne désigne plus la même opération.
  useEffect(() => setOpen(undefined), [transactions]);
  const visible = transactions
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => i < shown || initial.has(i));
  const remaining = transactions.length - visible.length;
  const more = () => {
    // Reprend après la dernière opération déjà affichée.
    const last = visible.at(-1)?.i ?? -1;
    setShown(last + 1 + pageSize);
  };
  return (
    <section class="card" aria-labelledby="tx-title">
      <h2 id="tx-title" class="section-title">
        Dernières opérations
      </h2>
      {transactions.length === 0 ? (
        <p class="muted">Aucune opération récente.</p>
      ) : (
        <ul class="ledger">
          {visible.map(({ t, i }) => {
            const expanded = open === i;
            const detailId = `tx-detail-${i}`;
            return (
              <li
                key={`${t.date}-${i}`}
                class={t.pending ? "tx-item pending" : "tx-item"}
              >
                <button
                  type="button"
                  class="tx-toggle"
                  aria-expanded={expanded}
                  aria-controls={detailId}
                  onClick={() => setOpen(expanded ? undefined : i)}
                >
                  <span class="ledger-date figures">
                    {formatShortDate(t.date)}
                  </span>
                  <span
                    class={expanded ? "tx-label tx-full" : "tx-label truncate"}
                  >
                    {t.label}
                  </span>
                  <span class={`${amountClass(t.cents)} tx-amount`}>
                    {formatCents(t.cents, currency, true)}
                  </span>
                  {/* Annotations ; le chevron est un simple repère, la ligne entière est le bouton. */}
                  <span class="tx-meta muted small">
                    {[
                      t.pending ? "en cours" : "",
                      t.rule ?? "",
                      t.account ?? "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <svg
                    class="tx-chevron"
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M3.5 6l4.5 4.5L12.5 6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <div id={detailId} class="tx-detail" hidden={!expanded}>
                  <p class="muted small">
                    {[formatLongDate(t.date), t.pending ? "" : "enregistrée"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {remaining > 0 && (
        <button type="button" class="button" onClick={more}>
          Afficher plus ({remaining})
        </button>
      )}
    </section>
  );
}
