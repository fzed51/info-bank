import { useState } from "preact/hooks";
import { estimateMonths } from "../../core/projection.ts";
import type { PayloadAccount, Projection } from "../../core/types.ts";
import { amountClass, formatCents, formatShortDate } from "../format.ts";

interface Props {
  account: PayloadAccount;
}

const plural = (n: number, word: string): string =>
  `${n} ${word}${n > 1 ? "s" : ""}`;

/** Explique d'où vient la dépense moyenne journalière (bouton « ? »). */
function SpendingHelp({ p, currency }: { p: Projection; currency: string }) {
  const b = p.basis;
  const end = (
    <div class="help-row">
      <dt>Jusqu'à la fin du mois</dt>
      <dd class="amount">
        {formatCents(p.dailyEstimateCents, currency)} × {p.daysRemaining} j ={" "}
        {formatCents(p.estimateCents, currency, true)}
      </dd>
    </div>
  );
  if (!b)
    return (
      <>
        <p>
          Somme des moyennes journalières de chaque compte. Le détail du calcul
          est dans l'onglet de chaque compte.
        </p>
        <dl class="help-table">{end}</dl>
      </>
    );
  if (b.days === 0)
    return <p>Pas encore d'historique : aucune estimation possible.</p>;
  return (
    <>
      <p>
        {b.partial
          ? "Moyenne des débits depuis la première opération connue du compte."
          : `Moyenne des débits des ${estimateMonths} derniers mois complets.`}
      </p>
      <dl class="help-table">
        <div class="help-row">
          <dt>Période</dt>
          <dd class="figures">
            {formatShortDate(b.from)} → {formatShortDate(b.to)} · {b.days} j
          </dd>
        </div>
        <div class="help-row">
          <dt>
            {plural(b.count, "débit")} retenu{b.count > 1 ? "s" : ""}
          </dt>
          <dd class={amountClass(b.totalCents)}>
            {formatCents(b.totalCents, currency, true)}
          </dd>
        </div>
        <div class="help-row">
          <dt>Moyenne par jour</dt>
          <dd class="amount">
            ÷ {b.days} j = {formatCents(p.dailyEstimateCents, currency)}
          </dd>
        </div>
        {end}
      </dl>
      <p class="muted">
        Les crédits ne comptent pas.
        {b.excludedCount > 0 &&
          ` ${plural(b.excludedCount, "débit")} écarté${b.excludedCount > 1 ? "s" : ""} : déjà rattaché${b.excludedCount > 1 ? "s" : ""} à une opération prévue, ou à une règle « ignorer ».`}
      </p>
    </>
  );
}

export function ProjectionCard({ account }: Props) {
  const p = account.projection;
  const c = account.currency;
  const [help, setHelp] = useState(false);
  return (
    <section class="card" aria-labelledby="projection-title">
      <h2 id="projection-title" class="section-title">
        Fin du mois
      </h2>
      <dl class="addition">
        <div class="addition-row">
          <dt>Solde actuel</dt>
          <dd class={p.balanceCents < 0 ? "amount debit" : "amount"}>
            {formatCents(p.balanceCents, c)}
          </dd>
        </div>
        <div class="addition-row">
          <dt>
            Opérations prévues
            <span class="muted small">
              {" "}
              ({p.plannedCount} restante{p.plannedCount > 1 ? "s" : ""})
            </span>
          </dt>
          <dd class={amountClass(p.plannedCents)}>
            {formatCents(p.plannedCents, c, true)}
          </dd>
        </div>
        <div class="addition-row">
          <dt>
            Dépenses courantes
            <span class="muted small">
              {" "}
              ({formatCents(p.dailyEstimateCents, c)}/j × {p.daysRemaining} j)
            </span>
            <button
              type="button"
              class="help-button"
              aria-label="Comment est calculée la dépense moyenne par jour ?"
              aria-expanded={help}
              aria-controls="spending-help"
              onClick={() => setHelp(!help)}
            >
              <span class="help-glyph" aria-hidden="true">
                ?
              </span>
            </button>
          </dt>
          <dd class={amountClass(p.estimateCents)}>
            {formatCents(p.estimateCents, c, true)}
          </dd>
          <dd id="spending-help" class="addition-help" hidden={!help}>
            <SpendingHelp p={p} currency={c} />
          </dd>
        </div>
        <div class="addition-row total">
          <dt>Fin de mois estimée</dt>
          <dd class={p.endCents < 0 ? "amount debit big" : "amount big"}>
            {formatCents(p.endCents, c)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
