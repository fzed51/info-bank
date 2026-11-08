import { useMemo, useState } from "preact/hooks";
import { StatusBadge } from "../../app/components/planned-list.tsx";
import { formatCents, formatShortDate } from "../../app/format.ts";
import { addMonths, periodOf, periodRange } from "../../core/dates.ts";
import { compileRegex } from "../../core/labels.ts";
import { matchOccurrences, txMatchesRule } from "../../core/matching.ts";
import { ruleError } from "../../core/rules.ts";
import { contiguousSpan, monthName, monthSpan } from "../../core/schedule.ts";
import type {
  AmountSpec,
  RecurringRule,
  Schedule,
  Tx,
} from "../../core/types.ts";
import { eurosText, parseEuros } from "../api-client.ts";

type Preset = "monthly" | "every" | "range" | "custom";

const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);

/** Préréglage correspondant à un calendrier existant. */
function presetOf(s: Schedule): Preset {
  if (s.every && s.every.n > 1) return "every";
  if (!s.months?.length || s.months.length === 12) return "monthly";
  return contiguousSpan(s.months) ? "range" : "custom";
}

/** Premier et dernier mois d'une plage continue (janvier à décembre sinon). */
const rangeOf = (months: number[]): [number, number] =>
  contiguousSpan(months) ?? [1, 12];

interface Props {
  rule: RecurringRule;
  /** Règle déjà enregistrée (sinon : création, éventuellement préremplie). */
  existing: boolean;
  txs: Tx[];
  today: string;
  onSave: (rule: RecurringRule) => void;
  onCancel: () => void;
}

export function RuleEditor({
  rule: initial,
  existing,
  txs,
  today,
  onSave,
  onCancel,
}: Props) {
  const [rule, setRule] = useState(initial);
  const [preset, setPreset] = useState<Preset>(presetOf(initial.schedule));
  const a = initial.amount;
  const [amountText, setAmountText] = useState(
    eurosText(a.kind === "fixed" ? a.cents : a.estimateCents),
  );
  const [toleranceText, setToleranceText] = useState(
    eurosText(a.kind === "fixed" ? a.toleranceCents : 0),
  );
  const [minText, setMinText] = useState(
    eurosText(a.kind === "variable" ? a.minCents : undefined),
  );
  const [maxText, setMaxText] = useState(
    eurosText(a.kind === "variable" ? a.maxCents : undefined),
  );
  const [error, setError] = useState<string>();

  const set = (patch: Partial<RecurringRule>) => setRule({ ...rule, ...patch });
  const setSchedule = (patch: Partial<Schedule>) =>
    set({ schedule: { ...rule.schedule, ...patch } });

  const amount = (kind: AmountSpec["kind"]): AmountSpec | undefined => {
    const main = parseEuros(amountText);
    if (main === undefined) return undefined;
    if (kind === "fixed") {
      const tolerance =
        toleranceText.trim() === "" ? 0 : parseEuros(toleranceText);
      return tolerance === undefined
        ? undefined
        : { kind, cents: main, toleranceCents: tolerance };
    }
    const min = minText.trim() === "" ? undefined : parseEuros(minText);
    const max = maxText.trim() === "" ? undefined : parseEuros(maxText);
    if (
      (minText.trim() && min === undefined) ||
      (maxText.trim() && max === undefined)
    )
      return undefined;
    return {
      kind,
      estimateCents: main,
      ...(min !== undefined ? { minCents: min } : {}),
      ...(max !== undefined ? { maxCents: max } : {}),
    };
  };

  // Règle telle qu'elle serait enregistrée ; sert aussi à l'aperçu.
  const draft = useMemo((): RecurringRule => {
    const spec =
      rule.kind === "ignore"
        ? ({ kind: "variable", estimateCents: 0 } as const)
        : (amount(rule.amount.kind) ?? rule.amount);
    return { ...rule, name: rule.name.trim(), amount: spec };
  }, [rule, amountText, toleranceText, minText, maxText]);

  const regexInvalid =
    draft.match.mode === "regex" && compileRegex(draft.match.pattern) === null;
  const since = `${addMonths(periodOf(today), -12)}-01`;
  const matching = useMemo(
    () =>
      draft.match.pattern.trim() && !regexInvalid
        ? txs
            .filter((t) => t.date >= since && txMatchesRule(draft, t))
            .sort((x, y) => y.date.localeCompare(x.date))
        : [],
    [draft, txs],
  );
  const occurrences = useMemo(
    () =>
      draft.kind === "recurring" && !ruleError(draft)
        ? matchOccurrences(
            [draft],
            [],
            txs,
            periodRange(
              addMonths(periodOf(today), -6),
              addMonths(periodOf(today), 1),
            ),
            today,
          )
        : [],
    [draft, txs],
  );

  const submit = (event: Event) => {
    event.preventDefault();
    if (draft.kind === "recurring" && amount(rule.amount.kind) === undefined) {
      setError("Montant illisible (ex. 12,50).");
      return;
    }
    const err = ruleError(draft);
    if (err) {
      setError(`Règle invalide : ${err}.`);
      return;
    }
    onSave(draft);
  };

  const choosePreset = (p: Preset) => {
    setPreset(p);
    const { day, windowDays, start, end } = rule.schedule;
    const base: Schedule = {
      day,
      windowDays,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    };
    if (p === "every") base.every = { n: 2, anchor: periodOf(today) };
    if (p === "range") base.months = monthSpan(1, 10);
    if (p === "custom") base.months = [...allMonths];
    set({ schedule: base });
  };

  const s = rule.schedule;
  const [rangeFrom, rangeTo] = rangeOf(s.months ?? allMonths);

  return (
    <form class="card stack" onSubmit={submit}>
      <div class="card-head">
        <h2 class="section-title">
          {existing ? `Modifier « ${initial.name} »` : "Nouvelle règle"}
        </h2>
      </div>

      <div class="bo-grid">
        <label class="field">
          <span class="field-label">Nom</span>
          <input
            class="input"
            value={rule.name}
            onInput={(e) => set({ name: e.currentTarget.value })}
            required
          />
        </label>
        <label class="field">
          <span class="field-label">Type</span>
          <select
            class="select"
            value={rule.kind}
            onChange={(e) =>
              set({ kind: e.currentTarget.value as RecurringRule["kind"] })
            }
          >
            <option value="recurring">Opération récurrente</option>
            <option value="ignore">
              À ignorer dans l'estimation (virement interne…)
            </option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Sens</span>
          <select
            class="select"
            value={rule.direction}
            onChange={(e) =>
              set({
                direction: e.currentTarget.value as RecurringRule["direction"],
              })
            }
          >
            <option value="debit">Débit (sortie)</option>
            <option value="credit">Crédit (entrée)</option>
          </select>
        </label>
      </div>

      <fieldset class="bo-fieldset">
        <legend>Libellé</legend>
        <div class="bo-grid">
          <label class="field bo-wide">
            <span class="field-label">
              {rule.match.mode === "regex"
                ? "Expression régulière (insensible à la casse)"
                : "Le libellé contient (accents et dates ignorés ; numéros ignorés sauf s'il y en a dans le motif)"}
            </span>
            <input
              class="input figures"
              value={rule.match.pattern}
              aria-invalid={regexInvalid ? "true" : undefined}
              onInput={(e) =>
                set({
                  match: { ...rule.match, pattern: e.currentTarget.value },
                })
              }
              required
            />
          </label>
          <label class="field">
            <span class="field-label">Recherche</span>
            <select
              class="select"
              value={rule.match.mode}
              onChange={(e) =>
                set({
                  match: {
                    ...rule.match,
                    mode: e.currentTarget.value as "contains" | "regex",
                  },
                })
              }
            >
              <option value="contains">Contient</option>
              <option value="regex">Expression régulière</option>
            </select>
          </label>
        </div>
        {regexInvalid && (
          <p class="error small">Expression régulière invalide.</p>
        )}
      </fieldset>

      {rule.kind === "recurring" && (
        <>
          <fieldset class="bo-fieldset">
            <legend>Montant</legend>
            <div class="bo-grid">
              <label class="field">
                <span class="field-label">Nature</span>
                <select
                  class="select"
                  value={rule.amount.kind}
                  onChange={(e) => {
                    const kind = e.currentTarget.value as AmountSpec["kind"];
                    set({
                      amount:
                        kind === "fixed"
                          ? { kind, cents: 0, toleranceCents: 0 }
                          : { kind, estimateCents: 0 },
                    });
                  }}
                >
                  <option value="fixed">Fixe</option>
                  <option value="variable">Variable</option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">
                  {rule.amount.kind === "fixed"
                    ? "Montant (€)"
                    : "Estimation (€)"}
                </span>
                <input
                  class="input figures"
                  inputMode="decimal"
                  value={amountText}
                  onInput={(e) => setAmountText(e.currentTarget.value)}
                  required
                />
              </label>
              {rule.amount.kind === "fixed" ? (
                <label class="field">
                  <span class="field-label">Tolérance ± (€)</span>
                  <input
                    class="input figures"
                    inputMode="decimal"
                    value={toleranceText}
                    onInput={(e) => setToleranceText(e.currentTarget.value)}
                  />
                </label>
              ) : (
                <>
                  <label class="field">
                    <span class="field-label">Minimum (€, facultatif)</span>
                    <input
                      class="input figures"
                      inputMode="decimal"
                      value={minText}
                      onInput={(e) => setMinText(e.currentTarget.value)}
                    />
                  </label>
                  <label class="field">
                    <span class="field-label">Maximum (€, facultatif)</span>
                    <input
                      class="input figures"
                      inputMode="decimal"
                      value={maxText}
                      onInput={(e) => setMaxText(e.currentTarget.value)}
                    />
                  </label>
                </>
              )}
            </div>
          </fieldset>

          <fieldset class="bo-fieldset">
            <legend>Calendrier</legend>
            <div class="bo-grid">
              <label class="field">
                <span class="field-label">Jour attendu</span>
                <input
                  class="input figures"
                  type="number"
                  min="1"
                  max="31"
                  value={s.day}
                  onInput={(e) =>
                    setSchedule({ day: Number(e.currentTarget.value) })
                  }
                />
              </label>
              <label class="field">
                <span class="field-label">Tolérance ± jours</span>
                <input
                  class="input figures"
                  type="number"
                  min="0"
                  max="15"
                  value={s.windowDays}
                  onInput={(e) =>
                    setSchedule({ windowDays: Number(e.currentTarget.value) })
                  }
                />
              </label>
              <label class="field">
                <span class="field-label">Fréquence</span>
                <select
                  class="select"
                  value={preset}
                  onChange={(e) =>
                    choosePreset(e.currentTarget.value as Preset)
                  }
                >
                  <option value="monthly">Tous les mois</option>
                  <option value="every">Un mois sur N</option>
                  <option value="range">D'un mois à un autre</option>
                  <option value="custom">Mois choisis</option>
                </select>
              </label>
            </div>

            {preset === "every" && s.every && (
              <div class="bo-grid">
                <label class="field">
                  <span class="field-label">Tous les N mois</span>
                  <input
                    class="input figures"
                    type="number"
                    min="2"
                    max="24"
                    value={s.every.n}
                    onInput={(e) =>
                      setSchedule({
                        every: {
                          n: Number(e.currentTarget.value),
                          anchor: s.every?.anchor ?? periodOf(today),
                        },
                      })
                    }
                  />
                </label>
                <label class="field">
                  <span class="field-label">En partant de</span>
                  <input
                    class="input figures"
                    type="month"
                    value={s.every.anchor}
                    onInput={(e) =>
                      setSchedule({
                        every: {
                          n: s.every?.n ?? 2,
                          anchor: e.currentTarget.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
            )}

            {preset === "range" && (
              <div class="bo-grid">
                {(["De", "À"] as const).map((label, i) => (
                  <label key={label} class="field">
                    <span class="field-label">{label}</span>
                    <select
                      class="select"
                      value={i === 0 ? rangeFrom : rangeTo}
                      onChange={(e) => {
                        const m = Number(e.currentTarget.value);
                        setSchedule({
                          months:
                            i === 0
                              ? monthSpan(m, rangeTo)
                              : monthSpan(rangeFrom, m),
                        });
                      }}
                    >
                      {allMonths.map((m) => (
                        <option key={m} value={m}>
                          {monthName(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}

            {preset === "custom" && (
              <fieldset class="bo-months">
                <legend class="visually-hidden">Mois concernés</legend>
                {allMonths.map((m) => (
                  <label key={m} class="check">
                    <input
                      type="checkbox"
                      checked={s.months?.includes(m) ?? true}
                      onChange={(e) => {
                        const current = new Set(s.months ?? allMonths);
                        if (e.currentTarget.checked) current.add(m);
                        else current.delete(m);
                        setSchedule({
                          months: [...current].sort((x, y) => x - y),
                        });
                      }}
                    />
                    <span>{monthName(m)}</span>
                  </label>
                ))}
              </fieldset>
            )}

            <div class="bo-grid">
              <label class="field">
                <span class="field-label">Premier mois (facultatif)</span>
                <input
                  class="input figures"
                  type="month"
                  value={s.start ?? ""}
                  onInput={(e) =>
                    setSchedule({ start: e.currentTarget.value || undefined })
                  }
                />
              </label>
              <label class="field">
                <span class="field-label">Dernier mois (facultatif)</span>
                <input
                  class="input figures"
                  type="month"
                  value={s.end ?? ""}
                  onInput={(e) =>
                    setSchedule({ end: e.currentTarget.value || undefined })
                  }
                />
              </label>
            </div>
          </fieldset>
        </>
      )}

      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <div class="bo-actions">
        <button type="submit" class="button primary">
          Enregistrer
        </button>
        <button type="button" class="button" onClick={onCancel}>
          Annuler
        </button>
      </div>

      {occurrences.length > 0 && (
        <section class="stack">
          <h3 class="section-title">Aperçu des échéances</h3>
          <ul class="ledger">
            {occurrences.map((o) => (
              <li key={o.period} class="ledger-row">
                <span class="ledger-date figures">
                  {formatShortDate(o.expected)}
                </span>
                <span class="ledger-label">
                  {o.txDate ? `passée le ${formatShortDate(o.txDate)}` : "—"}
                  <StatusBadge status={o.status} />
                </span>
                <span class="amount">
                  {formatCents(o.txCents ?? o.expectedCents, "EUR", true)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="stack">
        <h3 class="section-title">
          Opérations correspondantes sur 12 mois ({matching.length})
        </h3>
        <p class="muted small">
          Même compte, même sens, libellé et montant compatibles, sans tenir
          compte de la date.
        </p>
        {matching.length > 0 && (
          <ul class="ledger">
            {matching.slice(0, 24).map((t) => (
              <li key={t.id} class="ledger-row">
                <span class="ledger-date figures">
                  {formatShortDate(t.date)}
                </span>
                <span class="ledger-label">
                  <span class="truncate">{t.label}</span>
                </span>
                <span class="amount">{formatCents(t.cents, "EUR", true)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </form>
  );
}
