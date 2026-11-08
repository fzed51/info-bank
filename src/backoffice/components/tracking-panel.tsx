import { useMemo, useState } from "preact/hooks";
import { StatusBadge } from "../../app/components/planned-list.tsx";
import {
  formatCents,
  formatMonthLong,
  formatShortDate,
} from "../../app/format.ts";
import type { BackofficeData } from "../../build/backoffice-api.ts";
import {
  addMonths,
  daysBetween,
  periodOf,
  periodRange,
} from "../../core/dates.ts";
import { labelMatches } from "../../core/labels.ts";
import { matchOccurrences } from "../../core/matching.ts";
import type { ManualLink, Occurrence, RulesFile } from "../../core/types.ts";

interface Props {
  account: string;
  data: BackofficeData;
  onSave: (rules: RulesFile) => void;
}

/** Fenêtre de recherche des opérations proposées pour une liaison manuelle. */
const linkWindowDays = 20;

export function TrackingPanel({ account, data, onSave }: Props) {
  const [open, setOpen] = useState<Occurrence>();
  const current = periodOf(data.today);
  const periods = periodRange(addMonths(current, -5), addMonths(current, 1));
  const rules = data.rules.rules.filter(
    (r) => r.account === account && r.active && r.kind === "recurring",
  );

  // Toutes les règles du fichier participent au matching (une opération ne sert qu'une fois).
  const occurrences = useMemo(
    () =>
      matchOccurrences(
        data.rules.rules,
        data.rules.links,
        data.txs,
        periods,
        data.today,
      ),
    [data, current],
  );
  const cell = (ruleId: string, period: string) =>
    occurrences.find((o) => o.ruleId === ruleId && o.period === period);

  const setLink = (occ: Occurrence, txId: string | undefined) => {
    const links: ManualLink[] = data.rules.links.filter(
      (l) => !(l.ruleId === occ.ruleId && l.period === occ.period),
    );
    if (txId) links.push({ ruleId: occ.ruleId, period: occ.period, txId });
    onSave({ ...data.rules, links });
    setOpen(undefined);
  };

  if (rules.length === 0)
    return (
      <section class="card">
        <p class="muted">
          Aucune règle active pour ce compte : commencez par l'onglet «
          Suggestions ».
        </p>
      </section>
    );

  return (
    <section class="card stack">
      <h2 class="section-title">Échéances des 6 derniers mois</h2>
      <p class="muted small">
        Cliquez sur une case pour lier une autre opération, ou indiquer que
        l'échéance n'a pas lieu ce mois-là. Les cases marquées ✎ ont été
        corrigées à la main.
      </p>
      <div class="bo-scroll">
        <table class="bo-table bo-grid-table">
          <thead>
            <tr>
              <th>Règle</th>
              {periods.map((p) => (
                <th key={p} class={p === current ? "current" : ""}>
                  {formatMonthLong(p)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                {periods.map((p) => {
                  const o = cell(r.id, p);
                  return (
                    <td key={p} class={p === current ? "current" : ""}>
                      {o ? (
                        <button
                          type="button"
                          class="bo-cell"
                          onClick={() => setOpen(o)}
                        >
                          <StatusBadge status={o.status} />
                          {o.manual && (
                            <span>
                              <span aria-hidden="true"> ✎</span>
                              <span class="visually-hidden">
                                corrigée à la main
                              </span>
                            </span>
                          )}
                          <span class="figures small">
                            {o.txDate
                              ? formatShortDate(o.txDate)
                              : formatShortDate(o.expected)}
                          </span>
                          {o.txCents !== undefined && (
                            <span class="amount small">
                              {formatCents(o.txCents, "EUR", true)}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span class="muted">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <LinkPanel
          occ={open}
          data={data}
          onLink={(txId) => setLink(open, txId)}
          onSkip={() => setLink(open, "skip")}
          onAuto={() => setLink(open, undefined)}
          onClose={() => setOpen(undefined)}
        />
      )}
    </section>
  );
}

interface LinkProps {
  occ: Occurrence;
  data: BackofficeData;
  onLink: (txId: string) => void;
  onSkip: () => void;
  onAuto: () => void;
  onClose: () => void;
}

function LinkPanel({ occ, data, onLink, onSkip, onAuto, onClose }: LinkProps) {
  const rule = data.rules.rules.find((r) => r.id === occ.ruleId);
  const candidates = data.txs
    .filter(
      (t) =>
        t.account === occ.account &&
        Math.abs(daysBetween(occ.expected, t.date)) <= linkWindowDays,
    )
    .map((t) => ({
      t,
      score:
        (rule && labelMatches(rule.match, t.label) ? 0 : 1000) +
        Math.abs(daysBetween(occ.expected, t.date)),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 40);
  return (
    <section class="card bo-link" aria-labelledby="link-title">
      <div class="card-head">
        <h3 id="link-title" class="section-title">
          {occ.name} — {formatMonthLong(occ.period)} (attendue le{" "}
          {formatShortDate(occ.expected)})
        </h3>
        <button type="button" class="button ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div class="bo-actions">
        <button type="button" class="button" onClick={onSkip}>
          Pas ce mois-ci
        </button>
        <button type="button" class="button" onClick={onAuto}>
          Détection automatique
        </button>
      </div>
      <p class="muted small">
        Opérations à ± {linkWindowDays} jours, libellés correspondants en
        premier :
      </p>
      <ul class="ledger">
        {candidates.map(({ t }) => (
          <li
            key={t.id}
            class={t.id === occ.txId ? "ledger-row selected" : "ledger-row"}
          >
            <span class="ledger-date figures">{formatShortDate(t.date)}</span>
            <span class="ledger-label">
              <span class="truncate">{t.label}</span>
            </span>
            <span class="bo-actions">
              <span class="amount">{formatCents(t.cents, "EUR", true)}</span>
              <button
                type="button"
                class="button ghost"
                onClick={() => onLink(t.id)}
              >
                Lier
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
