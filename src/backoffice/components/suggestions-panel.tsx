import { useMemo } from "preact/hooks";
import { formatCents } from "../../app/format.ts";
import type { BackofficeData } from "../../build/backoffice-api.ts";
import { addMonths, periodOf, periodRange } from "../../core/dates.ts";
import { matchOccurrences, txMatchesRule } from "../../core/matching.ts";
import { type Suggestion, suggestRecurring } from "../../core/suggest.ts";
import type { RecurringRule } from "../../core/types.ts";
import { blankRule } from "./rules-list.tsx";

interface Props {
  account: string;
  data: BackofficeData;
  onCreate: (rule: RecurringRule) => void;
}

const titleCase = (text: string): string =>
  text.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

/** Règle préremplie à partir d'une suggestion. */
function ruleFrom(s: Suggestion): RecurringRule {
  const base = blankRule(s.account);
  return {
    ...base,
    name: titleCase(s.pattern).slice(0, 40),
    direction: s.direction,
    match: { pattern: s.pattern, mode: "contains" },
    amount: s.variable
      ? {
          kind: "variable",
          estimateCents: s.medianCents,
          minCents: Math.floor(s.minCents * 0.8),
          maxCents: Math.ceil(s.maxCents * 1.2),
        }
      : { kind: "fixed", cents: s.medianCents, toleranceCents: 0 },
    schedule: { day: s.medianDay, windowDays: 3 },
  };
}

export function SuggestionsPanel({ account, data, onCreate }: Props) {
  const suggestions = useMemo(() => {
    const own = data.txs.filter((t) => t.account === account);
    const rules = data.rules.rules.filter(
      (r) => r.account === account && r.active,
    );
    // Opérations déjà couvertes : rattachées à une échéance, ou reconnues par une règle.
    const covered = new Set<string>();
    const periods = periodRange(
      addMonths(periodOf(data.today), -12),
      periodOf(data.today),
    );
    for (const o of matchOccurrences(
      rules,
      data.rules.links,
      own,
      periods,
      data.today,
    ))
      if (o.txId) covered.add(o.txId);
    for (const t of own)
      if (rules.some((r) => txMatchesRule(r, t))) covered.add(t.id);
    return suggestRecurring(own, covered, data.today);
  }, [account, data]);

  return (
    <section class="card">
      <h2 class="section-title">
        Opérations qui reviennent ({suggestions.length})
      </h2>
      <p class="muted small">
        Même libellé (sans chiffres) présent au moins 3 mois sur les 6 derniers
        et le mois en cours, hors opérations déjà couvertes par une règle. Les
        achats fréquents (plus de 2 par mois) sont écartés.
      </p>
      {suggestions.length === 0 ? (
        <p class="muted">Aucune suggestion pour ce compte.</p>
      ) : (
        <div class="bo-scroll">
          <table class="bo-table">
            <thead>
              <tr>
                <th>Libellé</th>
                <th>Mois</th>
                <th>Jour</th>
                <th>Montant</th>
                <th>
                  <span class="visually-hidden">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => {
                const sign = s.direction === "debit" ? -1 : 1;
                return (
                  <tr key={`${s.direction}|${s.pattern}`}>
                    <td>
                      <span class="figures small">{s.pattern}</span>
                      <br />
                      <span class="muted small">{s.sampleLabel}</span>
                    </td>
                    <td class="figures">{s.months}</td>
                    <td class="figures">~{s.medianDay}</td>
                    <td class="amount">
                      {formatCents(sign * s.medianCents, "EUR", true)}
                      {s.variable && (
                        <span class="muted small">
                          <br />
                          {formatCents(s.minCents)} à {formatCents(s.maxCents)}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        class="button"
                        onClick={() => onCreate(ruleFrom(s))}
                      >
                        Créer une règle
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
