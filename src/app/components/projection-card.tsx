import { useState } from "preact/hooks";
import { patternMonths, rollingDays } from "../../core/projection.ts";
import type {
  PayloadAccount,
  Projection,
  SpendingMethod,
  SpendingMethodKind,
} from "../../core/types.ts";
import {
  amountClass,
  formatCents,
  formatMonthLong,
  formatShortDate,
} from "../format.ts";

interface Props {
  account: PayloadAccount;
}

const plural = (n: number, word: string): string =>
  `${n} ${word}${n > 1 ? "s" : ""}`;

const methodTitles: Record<SpendingMethodKind, string> = {
  rolling: `Moyenne des ${rollingDays} derniers jours`,
  lastYear: "Même mois l'an dernier",
  weekday: "Par jour de la semaine",
  monthDay: "Par jour du mois",
};

/** Période et base d'une méthode, ou raison de son exclusion. */
function methodDetail(m: SpendingMethod, currency: string): string {
  const daily =
    m.days > 0
      ? ` · ${formatCents(Math.round(m.totalCents / m.days), currency)}/j`
      : "";
  if (m.kind === "lastYear") {
    const month = formatMonthLong(m.to.slice(0, 7));
    return m.estimateCents === undefined
      ? `${month} : historique incomplet`
      : `${month}${daily}`;
  }
  if (m.estimateCents === undefined) return "historique trop court";
  // Fenêtre raccourcie : elle commence à la première opération connue du compte.
  const since = `depuis le ${formatShortDate(m.from)} (${m.days} j)`;
  if (m.kind === "rolling")
    return m.partial
      ? `${since}${daily}`
      : `${formatShortDate(m.from)} → ${formatShortDate(m.to)}${daily}`;
  return m.partial ? since : `sur ${patternMonths} mois`;
}

/** Explique d'où vient la dépense moyenne journalière (bouton « ? »). */
function SpendingHelp({ p, currency }: { p: Projection; currency: string }) {
  const b = p.spending;
  const end = (
    <div class="help-row">
      <dt>Jusqu'à la fin du mois, aujourd'hui compris</dt>
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
  const used = b.methods.filter((m) => m.estimateCents !== undefined);
  if (used.length === 0)
    return <p>Pas encore d'historique : aucune estimation possible.</p>;
  return (
    <>
      <p>
        Moyenne de plusieurs estimations des dépenses d'ici la fin du mois. Une
        méthode sans assez d'historique est écartée.
      </p>
      <dl class="help-table">
        {b.methods.map((m) => (
          <div class="help-row" key={m.kind}>
            <dt>
              {methodTitles[m.kind]}
              <br />
              <span class="muted">{methodDetail(m, currency)}</span>
            </dt>
            {m.estimateCents === undefined ? (
              <dd class="muted">écartée</dd>
            ) : (
              <dd class={amountClass(m.estimateCents)}>
                {formatCents(m.estimateCents, currency, true)}
              </dd>
            )}
          </div>
        ))}
        {p.daysRemaining > 0 && (
          <div class="help-row">
            <dt>
              {used.length > 1
                ? `Moyenne des ${used.length} méthodes ÷ ${p.daysRemaining} j`
                : `÷ ${p.daysRemaining} j`}
            </dt>
            <dd class="amount">
              {formatCents(p.dailyEstimateCents, currency)}/j
            </dd>
          </div>
        )}
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
