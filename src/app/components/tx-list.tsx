import { useMemo, useState } from "preact/hooks";
import type { PayloadTx } from "../../core/types.ts";
import { initialTxIndexes } from "../data.ts";
import { amountClass, formatCents, formatShortDate } from "../format.ts";

const pageSize = 30;

interface Props {
  transactions: PayloadTx[];
  currency: string;
}

export function TxList({ transactions, currency }: Props) {
  // Au départ : opérations en cours + dernière comptabilisée ; puis `pageSize` de plus par clic.
  const [shown, setShown] = useState(0);
  const initial = useMemo(() => initialTxIndexes(transactions), [transactions]);
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
          {visible.map(({ t, i }) => (
            <li
              key={`${t.date}-${i}`}
              class={t.pending ? "ledger-row pending" : "ledger-row"}
            >
              <span class="ledger-date figures">{formatShortDate(t.date)}</span>
              <span class="ledger-label">
                <span class="truncate">{t.label}</span>
                {(t.pending || t.rule || t.account) && (
                  <span class="muted small">
                    {[
                      t.pending ? "en cours" : "",
                      t.rule ?? "",
                      t.account ?? "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
              <span class={amountClass(t.cents)}>
                {formatCents(t.cents, currency, true)}
              </span>
            </li>
          ))}
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
