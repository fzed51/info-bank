import { useMemo, useState } from "preact/hooks";
import { formatCents, formatShortDate } from "../../app/format.ts";
import { type RuleHits, ruleHits } from "../../core/matching.ts";
import { newRuleId } from "../../core/rules.ts";
import { describeSchedule } from "../../core/schedule.ts";
import type { RecurringRule, Tx } from "../../core/types.ts";

interface Props {
  account: string;
  rules: RecurringRule[];
  txs: Tx[];
  onEdit: (rule: RecurringRule) => void;
  onDelete: (id: string) => void;
  onToggle: (rule: RecurringRule) => void;
}

export const blankRule = (account: string): RecurringRule => ({
  id: newRuleId(),
  account,
  name: "",
  active: true,
  kind: "recurring",
  match: { pattern: "", mode: "contains" },
  direction: "debit",
  amount: { kind: "fixed", cents: 0, toleranceCents: 0 },
  schedule: { day: 1, windowDays: 3 },
});

/** Montant attendu sur la première ligne, puis une ligne par variation (tolérance, bornes). */
function AmountCell({ rule }: { rule: RecurringRule }) {
  const sign = rule.direction === "debit" ? -1 : 1;
  const a = rule.amount;
  const variations =
    a.kind === "fixed"
      ? a.toleranceCents
        ? [`± ${formatCents(a.toleranceCents)}`]
        : []
      : [
          "variable",
          ...(a.minCents !== undefined
            ? [`min ${formatCents(a.minCents)}`]
            : []),
          ...(a.maxCents !== undefined
            ? [`max ${formatCents(a.maxCents)}`]
            : []),
        ];
  return (
    <span class="bo-amount">
      <span class="amount">
        {a.kind === "fixed"
          ? formatCents(sign * a.cents, "EUR", true)
          : `≈ ${formatCents(sign * a.estimateCents, "EUR", true)}`}
      </span>
      {variations.map((v) => (
        <span key={v} class="amount muted small">
          {v}
        </span>
      ))}
    </span>
  );
}

/** Indique si la règle a déjà trouvé au moins une opération (texte + symbole, pas la couleur seule). */
function HitsBadge({ hits }: { hits: RuleHits }) {
  if (!hits.last)
    return (
      <span class="badge badge-nohit">
        <span aria-hidden="true">!</span> jamais
      </span>
    );
  return (
    <span class="bo-hits">
      <span class="badge badge-hit">
        <span aria-hidden="true">✓</span> {hits.count} op.
      </span>
      <span class="figures muted">
        dernière le {formatShortDate(hits.last)}
      </span>
    </span>
  );
}

export function RulesList({
  account,
  rules,
  txs,
  onEdit,
  onDelete,
  onToggle,
}: Props) {
  // Suppression en deux temps, sans boîte de dialogue du navigateur.
  const [confirming, setConfirming] = useState<string>();
  const own = rules
    .filter((r) => r.account === account)
    .sort(
      (a, b) => a.schedule.day - b.schedule.day || a.name.localeCompare(b.name),
    );
  const hits = useMemo(
    () => new Map(own.map((r) => [r.id, ruleHits(r, txs)])),
    [rules, txs, account],
  );
  return (
    <section class="card">
      <div class="card-head">
        <h2 class="section-title">Règles du compte ({own.length})</h2>
        <button
          type="button"
          class="button primary"
          onClick={() => onEdit(blankRule(account))}
        >
          Nouvelle règle
        </button>
      </div>
      {own.length === 0 ? (
        <p class="muted">
          Aucune règle. Partez de l'onglet « Suggestions » ou créez-en une.
        </p>
      ) : (
        <div class="bo-scroll">
          <table class="bo-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Libellé</th>
                <th>Montant</th>
                <th>Calendrier</th>
                <th title="Opérations déjà trouvées dans l'historique chargé, sans tenir compte de la date">
                  Correspondance
                </th>
                <th>Active</th>
                <th>
                  <span class="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {own.map((r) => (
                <tr key={r.id} class={r.active ? "" : "inactive"}>
                  <td>
                    {r.name}
                    {r.kind === "ignore" && (
                      <span class="muted small">
                        {" "}
                        (ignorée dans l'estimation)
                      </span>
                    )}
                  </td>
                  <td class="figures small">
                    {r.match.mode === "regex"
                      ? `/${r.match.pattern}/`
                      : r.match.pattern}
                  </td>
                  <td>
                    {r.kind === "ignore" ? (
                      <span class="muted">—</span>
                    ) : (
                      <AmountCell rule={r} />
                    )}
                  </td>
                  <td class="small">
                    {r.kind === "ignore" ? "—" : describeSchedule(r.schedule)}
                  </td>
                  <td class="small">
                    <HitsBadge hits={hits.get(r.id) ?? { count: 0 }} />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.active}
                      aria-label={`Activer ${r.name}`}
                      onChange={() => onToggle(r)}
                    />
                  </td>
                  <td class="bo-row-actions">
                    <div class="bo-row-buttons">
                      <button
                        type="button"
                        class="button bo-row-button"
                        aria-label={`Modifier ${r.name}`}
                        onClick={() => onEdit(r)}
                      >
                        <span aria-hidden="true">✎</span> Modifier
                      </button>
                      <button
                        type="button"
                        class={
                          confirming === r.id
                            ? "button bo-row-button danger confirming"
                            : "button bo-row-button danger"
                        }
                        aria-label={
                          confirming === r.id
                            ? `Confirmer la suppression de ${r.name}`
                            : `Supprimer ${r.name}`
                        }
                        onClick={() =>
                          confirming === r.id
                            ? onDelete(r.id)
                            : setConfirming(r.id)
                        }
                        onBlur={() => setConfirming(undefined)}
                      >
                        <span class="bo-swap" aria-hidden="true">
                          <span hidden={confirming === r.id}>× Supprimer</span>
                          <span hidden={confirming !== r.id}>! Confirmer</span>
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
