import { useId, useState } from "preact/hooks";
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  periodOf,
} from "../../core/dates.ts";
import type { PayloadOccurrence, Projection } from "../../core/types.ts";
import { plannedSteps } from "../data.ts";
import { formatCents, formatMonthShort, formatShortDate } from "../format.ts";

const ranges = [1, 3, 6, 12] as const;
type Range = (typeof ranges)[number];

const width = 340;
const height = 200;
const padTop = 12;
const padBottom = 22;
const padRight = 58;

interface Props {
  history: number[];
  /** Date du premier point de `history`. */
  start: string;
  /** Date du dernier point. */
  asOf: string;
  projection: Projection;
  /** Opérations prévues du mois, pour la courbe « opérations prévues seules ». */
  occurrences: PayloadOccurrence[];
  currency: string;
}

const compact = new Map<string, Intl.NumberFormat>();
const axisLabel = (cents: number, currency: string): string => {
  let f = compact.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
    compact.set(currency, f);
  }
  return f.format(cents / 100).replace("-", "−");
};

/** Graduations « rondes » couvrant [min, max]. */
function ticks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 100;
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

export function HistoryChart({
  history,
  start,
  asOf,
  projection,
  occurrences,
  currency,
}: Props) {
  const [range, setRange] = useState<Range>(3);
  const patternId = useId();

  const monthEnd = `${periodOf(asOf)}-${daysInMonth(periodOf(asOf))}`;
  const wanted = addDays(asOf, -Math.round(range * 30.44));
  const offset = Math.max(0, daysBetween(start, wanted));
  const series = history.slice(offset);
  const first = addDays(start, offset);

  if (series.length === 0)
    return (
      <section class="card">
        <h2 class="section-title">Évolution</h2>
        <p class="muted">Pas encore d'historique.</p>
      </section>
    );

  const current = series[series.length - 1];
  const steps = plannedSteps(current, occurrences, asOf);
  const plannedEnd = steps.at(-1)?.cents ?? current;
  const values = [...series, projection.endCents, ...steps.map((s) => s.cents)];
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.05 || 100;
  min -= pad;
  max += pad;
  const totalDays = Math.max(1, daysBetween(first, monthEnd));
  const plotWidth = width - padRight;
  const plotHeight = height - padTop - padBottom;
  const x = (day: number) => (day / totalDays) * plotWidth;
  const y = (cents: number) =>
    padTop + ((max - cents) / (max - min)) * plotHeight;

  const line = series
    .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const lastX = x(series.length - 1);
  const lastY = y(series[series.length - 1]);
  const bottom = padTop + plotHeight;
  const area = `0,${bottom} ${line} ${lastX.toFixed(1)},${bottom}`;
  const endX = x(daysBetween(first, monthEnd));
  const endY = y(projection.endCents);
  // Escalier : palier jusqu'à la date de chaque opération prévue, puis saut.
  const stepPoints: [number, number][] = [[lastX, lastY]];
  let stepY = lastY;
  for (const s of steps) {
    const sx = x(daysBetween(first, s.date));
    stepPoints.push([sx, stepY]);
    stepY = y(s.cents);
    stepPoints.push([sx, stepY]);
  }
  stepPoints.push([endX, stepY]);
  const plannedLine = stepPoints
    .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
    .join(" ");

  const months: { x: number; label: string }[] = [];
  for (
    let p = addMonths(periodOf(first), 1);
    p <= periodOf(asOf);
    p = addMonths(p, range > 6 ? 2 : 1)
  ) {
    months.push({
      x: x(daysBetween(first, `${p}-01`)),
      label: formatMonthShort(`${p}-01`),
    });
  }

  const summary = `Évolution du solde du ${formatShortDate(first)} au ${formatShortDate(asOf)} : minimum ${formatCents(Math.min(...series), currency)}, maximum ${formatCents(Math.max(...series), currency)}, actuel ${formatCents(current, currency)}, fin de mois avec les seules opérations prévues ${formatCents(plannedEnd, currency)}, fin de mois estimée avec les dépenses courantes ${formatCents(projection.endCents, currency)}.`;

  return (
    <section class="card" aria-labelledby="chart-title">
      <div class="card-head">
        <h2 id="chart-title" class="section-title">
          Évolution
        </h2>
        <fieldset class="segmented">
          <legend class="visually-hidden">Période</legend>
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              class={r === range ? "segment active" : "segment"}
              aria-pressed={r === range}
              onClick={() => setRange(r)}
            >
              {r} m
            </button>
          ))}
        </fieldset>
      </div>
      <svg
        class="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={summary}
      >
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line class="chart-hatch" x1="0" y1="0" x2="0" y2="6" />
          </pattern>
        </defs>
        {ticks(min, max).map((t) => (
          <g key={t}>
            <line
              class="chart-grid"
              x1="0"
              x2={plotWidth}
              y1={y(t)}
              y2={y(t)}
            />
            <text
              class="chart-label"
              x={width - 2}
              y={y(t) + 4}
              text-anchor="end"
            >
              {axisLabel(t, currency)}
            </text>
          </g>
        ))}
        {min < 0 && max > 0 && (
          <line class="chart-zero" x1="0" x2={plotWidth} y1={y(0)} y2={y(0)} />
        )}
        <polygon points={area} fill={`url(#${patternId})`} />
        <polyline class="chart-line" points={line} />
        {steps.length > 0 && (
          <polyline class="chart-planned" points={plannedLine} />
        )}
        <line
          class="chart-projection"
          x1={lastX}
          y1={lastY}
          x2={endX}
          y2={endY}
        />
        {steps.length > 0 && (
          <circle
            class="chart-planned-end"
            cx={endX}
            cy={y(plannedEnd)}
            r="3"
          />
        )}
        <circle class="chart-end" cx={endX} cy={endY} r="3" />
        <circle class="chart-now" cx={lastX} cy={lastY} r="3" />
        {months.map((m) => (
          <text
            key={m.label + m.x}
            class="chart-label"
            x={m.x}
            y={height - 6}
            text-anchor="middle"
          >
            {m.label}
          </text>
        ))}
      </svg>
      <p class="muted small chart-legend">
        <span class="legend-item">
          <span class="legend-line" aria-hidden="true" /> solde
        </span>
        {steps.length > 0 && (
          <span class="legend-item">
            <span class="legend-dots" aria-hidden="true" /> opérations prévues
            seules
          </span>
        )}
        <span class="legend-item">
          <span class="legend-dash" aria-hidden="true" /> avec dépenses
          courantes
        </span>
      </p>
    </section>
  );
}
