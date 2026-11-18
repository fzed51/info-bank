import { useMemo } from "preact/hooks";
import { amountClass, formatCents, formatShortDate } from "../../app/format.ts";
import type { BackofficeData } from "../../build/backoffice-api.ts";
import { addDays, periodOf, periodRange } from "../../core/dates.ts";
import { matchOccurrences } from "../../core/matching.ts";

interface Props {
  account: string;
  data: BackofficeData;
}

/** Nombre de jours affichés, aujourd'hui compris. */
const windowDays = 30;

/** Opérations des 30 derniers jours du compte, avec la règle qui les couvre. */
export function OperationsPanel({ account, data }: Props) {
  const since = addDays(data.today, -(windowDays - 1));
  const currency =
    data.accounts.find((a) => a.account === account)?.currency ?? "EUR";

  const rows = useMemo(() => {
    // Même rapprochement que l'app : toutes les règles, une opération ne sert qu'une fois.
    const occurrences = matchOccurrences(
      data.rules.rules,
      data.rules.links,
      data.txs,
      periodRange(periodOf(since), periodOf(data.today)),
      data.today,
    );
    const ruleOfTx = new Map<string, string>();
    for (const o of occurrences) if (o.txId) ruleOfTx.set(o.txId, o.name);
    return data.txs
      .filter((t) => t.account === account && t.date >= since)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((t) => ({ t, rule: ruleOfTx.get(t.id) }));
  }, [data, account, since]);

  const credits = rows.reduce((s, { t }) => s + Math.max(t.cents, 0), 0);
  const debits = rows.reduce((s, { t }) => s + Math.min(t.cents, 0), 0);
  const pending = rows.filter(({ t }) => t.status === "pending").length;

  return (
    <section class="card stack">
      <h2 class="section-title">Opérations des {windowDays} derniers jours</h2>
      {rows.length === 0 ? (
        <p class="muted">
          Aucune opération depuis le {formatShortDate(since)}.
        </p>
      ) : (
        <>
          <p class="muted small">
            {rows.length} opération{rows.length > 1 ? "s" : ""} depuis le{" "}
            {formatShortDate(since)}
            {pending > 0 ? ` (dont ${pending} en cours)` : ""} · entrées{" "}
            <span class="amount credit">
              {formatCents(credits, currency, true)}
            </span>{" "}
            · sorties{" "}
            <span class="amount debit">{formatCents(debits, currency)}</span>
          </p>
          <div class="bo-scroll">
            <table class="bo-table bo-ops">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th class="num">Montant</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, rule }) => (
                  <tr
                    key={t.id}
                    class={t.status === "pending" ? "pending" : ""}
                  >
                    <td class="figures small nowrap">
                      {formatShortDate(t.date)}
                    </td>
                    <td class="bo-label">
                      {t.label}
                      {(t.status === "pending" || rule) && (
                        <span class="bo-sub muted small">
                          {[
                            t.status === "pending" ? "en cours" : "",
                            rule ? `règle ${rule}` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td class="num">
                      <span class={amountClass(t.cents)}>
                        {formatCents(t.cents, currency, true)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
