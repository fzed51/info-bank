import { useMemo, useState } from "preact/hooks";
import { axisLabel, ticks } from "../../app/components/history-chart.tsx";
import {
  formatCents,
  formatMonthLong,
  formatMonthShort,
  formatShortDate,
} from "../../app/format.ts";
import type { BackofficeData } from "../../build/backoffice-api.ts";
import { spendingCurves } from "../../core/spending-curves.ts";
import type { SpendingMethodKind } from "../../core/types.ts";

interface Props {
  account: string;
  data: BackofficeData;
}

const width = 720;
const height = 340;
const padLeft = 54;
const padRight = 104;
const padTop = 14;
const padBottom = 28;
const plotWidth = width - padLeft - padRight;
const plotHeight = height - padTop - padBottom;
const axisDays = 31;

const methodNames: Record<SpendingMethodKind, string> = {
  rolling: "90 jours glissants",
  lastYear: "même mois l'an dernier",
  weekday: "jour de la semaine",
  monthDay: "jour du mois",
};

interface Line {
  key: string;
  /** Classe de couleur : `curve-0`, `curve-1` (mois terminés), `curve-now`. */
  cls: string;
  name: string;
  days: number;
  /** Dépenses cumulées à la fin du jour `d` (`d` ≤ `days`). */
  at: (d: number) => number;
  /** Valeur de fin de mois (projection pour le mois en cours). */
  end: number;
}

/** Dépenses courantes cumulées de deux mois terminés et du mois en cours (réel + projection). */
export function SpendingPanel({ account, data }: Props) {
  const [hover, setHover] = useState<number>();
  const currency =
    data.accounts.find((a) => a.account === account)?.currency ?? "EUR";
  const curves = useMemo(
    () =>
      spendingCurves(
        account,
        data.txs,
        data.rules.rules,
        data.rules.links,
        data.today,
      ),
    [account, data],
  );
  const { current } = curves;

  const projectedAt = (d: number): number =>
    current.actualCents[current.through] +
    ((current.endCents - current.actualCents[current.through]) *
      (d - current.through)) /
      (current.days - current.through);
  const lines: Line[] = [
    ...curves.months.map((m, i) => ({
      key: m.period,
      cls: `curve-${i}`,
      name: formatMonthLong(m.period),
      days: m.days,
      at: (d: number) => m.cumCents[d],
      end: m.cumCents[m.days],
    })),
    {
      key: current.period,
      cls: "curve-now",
      name: formatMonthLong(current.period),
      days: current.days,
      at: (d: number) =>
        d <= current.through ? current.actualCents[d] : projectedAt(d),
      end: current.endCents,
    },
  ];

  if (current.through === 0 && curves.months.length === 0)
    return (
      <section class="card">
        <p class="muted">Pas encore de dépenses à comparer pour ce compte.</p>
      </section>
    );

  const max =
    Math.max(
      ...lines.map((l) => l.end),
      ...current.methods.map((m) => m.endCents),
    ) * 1.04 || 100;
  const x = (d: number) => padLeft + (d / axisDays) * plotWidth;
  const y = (cents: number) => padTop + ((max - cents) / max) * plotHeight;
  const path = (line: Line, from: number, to: number) =>
    Array.from(
      { length: to - from + 1 },
      (_, i) => `${x(from + i).toFixed(1)},${y(line.at(from + i)).toFixed(1)}`,
    ).join(" ");
  const now = lines[lines.length - 1];

  // Étiquettes en bout de courbe, écartées si elles se touchent.
  const labels = lines
    .map((l) => ({ line: l, y: y(l.end) }))
    .sort((a, b) => a.y - b.y);
  let floor = Number.NEGATIVE_INFINITY;
  for (const l of labels) {
    l.y = Math.max(l.y, floor + 30);
    floor = l.y;
  }

  const day = hover ?? Math.max(1, current.through);
  const readout = lines.filter((l) => day <= l.days);
  const summary = `Dépenses courantes cumulées jour par jour. ${lines
    .map((l) =>
      l === now
        ? `${l.name} : ${formatCents(current.actualCents[current.through], currency)} au ${current.through}, projection ${formatCents(l.end, currency)} en fin de mois`
        : `${l.name} : ${formatCents(l.end, currency)} en fin de mois`,
    )
    .join(" ; ")}.`;

  const onMove = (e: PointerEvent) => {
    const svg = (e.currentTarget as SVGRectElement).ownerSVGElement;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    setHover(
      Math.min(
        axisDays,
        Math.max(1, Math.round(((px - padLeft) / plotWidth) * axisDays)),
      ),
    );
  };

  return (
    <section class="card stack" aria-labelledby="spending-title">
      <h2 id="spending-title" class="section-title">
        Dépenses cumulées, mois par mois
      </h2>
      <p class="muted small">
        Chaque courbe repart de 0 au 1er du mois. Ce sont les dépenses courantes
        de la projection : débits non rattachés à une règle ni ignorés. Le mois
        en cours est réel jusqu'au {current.through} (dernier jour
        comptabilisé), puis suit la projection de l'app.
      </p>

      <div class="bo-scroll">
        <svg
          class="chart spending-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={summary}
        >
          {ticks(0, max, 5).map((t) => (
            <g key={t}>
              <line
                class="chart-grid"
                x1={padLeft}
                x2={padLeft + plotWidth}
                y1={y(t)}
                y2={y(t)}
              />
              <text
                class="chart-label"
                x={padLeft - 6}
                y={y(t) + 4}
                text-anchor="end"
              >
                {axisLabel(t, currency)}
              </text>
            </g>
          ))}
          {[1, 5, 10, 15, 20, 25, 30].map((d) => (
            <text
              key={d}
              class="chart-label"
              x={x(d)}
              y={height - 8}
              text-anchor="middle"
            >
              {d}
            </text>
          ))}

          {lines.slice(0, -1).map((l) => (
            <polyline
              key={l.key}
              class={`curve ${l.cls}`}
              points={path(l, 0, l.days)}
            />
          ))}
          <polyline
            class="curve curve-now"
            points={path(now, 0, current.through)}
          />
          <line
            class="curve-proj"
            x1={x(current.through)}
            y1={y(now.at(current.through))}
            x2={x(current.days)}
            y2={y(current.endCents)}
          />
          {current.methods.map((m) => (
            <circle
              key={m.kind}
              class="curve-method"
              cx={x(current.days)}
              cy={y(m.endCents)}
              r="4"
            >
              <title>{`${methodNames[m.kind]} : ${formatCents(m.endCents, currency)} en fin de mois`}</title>
            </circle>
          ))}
          <circle
            class="curve-dot curve-now-dot"
            cx={x(current.through)}
            cy={y(now.at(current.through))}
            r="4"
          />

          {labels.map(({ line: l, y: ly }) => (
            <g key={l.key}>
              <circle
                class={`curve-dot ${l.cls}-dot`}
                cx={x(l.days)}
                cy={y(l.end)}
                r="3.5"
              />
              <text
                class="chart-end-label"
                x={width - padRight + 10}
                y={ly - 2}
              >
                {formatMonthShort(`${l.key}-01`)}
                {l === now ? " (proj.)" : ""}
              </text>
              <text class="chart-label" x={width - padRight + 10} y={ly + 12}>
                {formatCents(l.end, currency)}
              </text>
            </g>
          ))}

          <line
            class="chart-cursor"
            x1={x(day)}
            x2={x(day)}
            y1={padTop}
            y2={padTop + plotHeight}
          />
          {readout.map((l) => (
            <circle
              key={l.key}
              class={`curve-dot ${l.cls}-dot`}
              cx={x(day)}
              cy={y(l.at(day))}
              r="4"
            />
          ))}
          <rect
            x={padLeft}
            y={padTop}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(undefined)}
          />
        </svg>
      </div>

      <p class="chart-legend small">
        {lines.map((l) => (
          <span key={l.key} class="legend-item">
            <span class={`legend-line legend-${l.cls}`} aria-hidden="true" />{" "}
            {l.name}
            {l === now ? " (réel)" : ""}
          </span>
        ))}
        <span class="legend-item">
          <span class="legend-dash" aria-hidden="true" /> {now.name}{" "}
          (projection)
        </span>
        <span class="legend-item">
          <span class="legend-ring" aria-hidden="true" /> estimation de chaque
          méthode en fin de mois
        </span>
      </p>

      <p class="small" aria-live="polite">
        <strong>Au {day}</strong> :{" "}
        {readout.map((l, i) => (
          <span key={l.key}>
            {i > 0 && " · "}
            {formatMonthShort(`${l.key}-01`)}{" "}
            <span class="figures">{formatCents(l.at(day), currency)}</span>
            {l === now && day > current.through ? " (projection)" : ""}
          </span>
        ))}
      </p>

      <details>
        <summary class="muted small">Voir les valeurs (tableau)</summary>
        <div class="bo-scroll">
          <table class="bo-table">
            <thead>
              <tr>
                <th scope="col">Jour</th>
                {lines.map((l) => (
                  <th key={l.key} scope="col" class="num">
                    {l.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: axisDays }, (_, i) => i + 1).map((d) => (
                <tr key={d}>
                  <td>{d}</td>
                  {lines.map((l) => (
                    <td key={l.key} class="num figures">
                      {d <= l.days ? formatCents(l.at(d), currency) : ""}
                      {l === now && d > current.through && d <= l.days
                        ? " *"
                        : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="muted small">
          * projection : {formatShortDate(data.today)} → fin de mois, répartie à
          plat sur les jours restants.
        </p>
      </details>
    </section>
  );
}
