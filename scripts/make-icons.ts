// Génère le logo et les icônes de la PWA depuis une seule description géométrique :
// SVG (logo, favicon) et PNG (manifeste, Apple), sans dépendance — rastérisation avec
// suréchantillonnage et encodage PNG via node:zlib.
// Dessin : feuille de registre cernée d'un trait (marge rouge, lignes de saisie, trait
// de total) et courbe d'encre qui monte vers un point bleu. Couleurs : thème clair de
// DESIGN.md.
// Usage : npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

const colors = {
  paper: "#F4EEDF",
  margin: "#D99A8C",
  ink: "#2A241E",
  accent: "#2A4A7F",
};

/** Côté du repère de dessin (unités SVG). */
const side = 512;

interface Shape {
  /** Élément SVG. */
  svg: string;
  /** Le point (x, y), en unités du repère, est-il couvert ? */
  hit: (x: number, y: number) => boolean;
  color: string;
}

const roundRect = (size: number, r: number, color: string): Shape => ({
  svg: `<rect width="${size}" height="${size}"${r ? ` rx="${r}"` : ""} fill="${color}"/>`,
  hit: (px, py) => {
    if (px < 0 || px > size || py < 0 || py > size) return false;
    const cx = Math.min(Math.max(px, r), size - r);
    const cy = Math.min(Math.max(py, r), size - r);
    return Math.hypot(px - cx, py - cy) <= r;
  },
  color,
});

type Point = [number, number];

/** Le point (px, py) est-il à moins de `radius` de la ligne brisée ? */
const nearPath = (
  points: Point[],
  radius: number,
  px: number,
  py: number,
): boolean =>
  points.slice(1).some(([bx, by], i) => {
    const [ax, ay] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
    );
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= radius;
  });

/** Ligne brisée, bouts et jonctions arrondis. */
const polyline = (points: Point[], width: number, color: string): Shape => ({
  svg: `<polyline points="${points.map((p) => p.join(",")).join(" ")}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  hit: (px, py) => nearPath(points, width / 2, px, py),
  color,
});

/** Courbe de Bézier cubique, bouts arrondis (échantillonnée pour la rastérisation). */
const curve = (
  from: Point,
  c1: Point,
  c2: Point,
  to: Point,
  width: number,
  color: string,
): Shape => {
  const steps = 64;
  const points = Array.from({ length: steps + 1 }, (_, i): Point => {
    const t = i / steps;
    const u = 1 - t;
    const at = (k: 0 | 1): number =>
      u ** 3 * from[k] +
      3 * u * u * t * c1[k] +
      3 * u * t * t * c2[k] +
      t ** 3 * to[k];
    return [at(0), at(1)];
  });
  return {
    svg: `<path d="M${from.join(" ")}C${[c1, c2, to].map((p) => p.join(" ")).join(",")}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`,
    hit: (px, py) => nearPath(points, width / 2, px, py),
    color,
  };
};

const circle = (cx: number, cy: number, r: number, color: string): Shape => ({
  svg: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`,
  hit: (px, py) => Math.hypot(px - cx, py - cy) <= r,
  color,
});

interface Variant {
  /** Rayon des coins du fond (0 : carré plein, pour Apple et les icônes masquables). */
  corner: number;
  /** Échelle du dessin autour du centre (zone sûre des icônes masquables). */
  scale: number;
  /** Version simplifiée, lisible à 16 px (favicon) : traits épaissis, sans lignes de saisie. */
  simple: boolean;
}

/** Contour d'un rectangle, jonctions arrondies. */
const outline = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
): Shape =>
  polyline(
    [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1],
    ],
    width,
    color,
  );

/** Contenu du logo dans le repère `side` × `side`, peint dans l'ordre. */
function drawing(simple: boolean): Shape[] {
  const c = colors;
  if (simple)
    return [
      outline(100, 64, 412, 448, 28, c.ink),
      polyline(
        [
          [148, 92],
          [148, 420],
        ],
        20,
        c.margin,
      ),
      curve([190, 380], [262, 356], [322, 300], [338, 222], 36, c.ink),
      circle(344, 166, 46, c.paper),
      circle(344, 166, 34, c.accent),
    ];
  return [
    outline(136, 91, 376, 421, 7, c.ink),
    polyline(
      [
        [136, 408],
        [376, 408],
      ],
      7,
      c.ink,
    ),
    polyline(
      [
        [168, 94.5],
        [168, 404.5],
      ],
      6,
      c.margin,
    ),
    // Lignes de saisie : libellé, puis montant (les trous laissent la place du texte).
    ...(
      [
        [[184, 170, 312.5]],
        [
          [184, 226, 311],
          [333, 226, 347],
        ],
        [
          [184, 282, 279],
          [303, 282, 347],
        ],
      ] as [number, number, number][][]
    )
      .flat()
      .map(([x1, y, x2]) =>
        polyline(
          [
            [x1, y],
            [x2, y],
          ],
          5,
          c.ink,
        ),
      ),
    curve([187, 348], [255, 322.5], [305, 272.5], [333, 188], 6, c.ink),
    circle(340, 168, 19, c.accent),
  ];
}

const offsetOf = (v: Variant): number => (side * (1 - v.scale)) / 2;

function toSvg(v: Variant, title: string): string {
  const body = drawing(v.simple)
    .map((s) => `    ${s.svg}`)
    .join("\n");
  const transform =
    v.scale === 1
      ? ""
      : ` transform="translate(${offsetOf(v)} ${offsetOf(v)}) scale(${v.scale})"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}">
  <title>${title}</title>
  ${roundRect(side, v.corner, colors.paper).svg}
  <g${transform}>
${body}
  </g>
</svg>
`;
}

type Rgb = [number, number, number];
const rgb = (h: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

/** PNG RGBA : coins transparents si le fond est arrondi. */
function render(size: number, v: Variant): Buffer {
  const background = roundRect(side, v.corner, colors.paper);
  const content = drawing(v.simple);
  const offset = offsetOf(v);
  const samples = 4;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let py = 0; py < size; py++) {
    raw[py * stride] = 0; // filtre PNG « aucun »
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      let covered = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const ux = ((px + (sx + 0.5) / samples) / size) * side;
          const uy = ((py + (sy + 0.5) / samples) / size) * side;
          if (!background.hit(ux, uy)) continue;
          let color = background.color;
          const cx = (ux - offset) / v.scale;
          const cy = (uy - offset) / v.scale;
          for (const s of content) if (s.hit(cx, cy)) color = s.color;
          const [r, g, b] = rgb(color);
          acc[0] += r;
          acc[1] += g;
          acc[2] += b;
          covered++;
        }
      const o = py * stride + 1 + px * 4;
      for (let k = 0; k < 3; k++)
        raw[o + k] = covered ? Math.round(acc[k] / covered) : 0;
      raw[o + 3] = Math.round((covered / samples ** 2) * 255);
    }
  }
  return png(size, raw);
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(size: number, raw: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const tile: Variant = { corner: 112, scale: 1, simple: false };
const favicon: Variant = { corner: 112, scale: 1, simple: true };
// Zone sûre des icônes masquables : cercle de 80 % du côté.
const maskable: Variant = { corner: 0, scale: 0.8, simple: false };
// iOS arrondit lui-même les coins et refuse la transparence.
const apple: Variant = { corner: 0, scale: 0.92, simple: false };

const dir = join("public", "icons");
mkdirSync(dir, { recursive: true });
for (const [name, v] of [
  ["logo.svg", tile],
  ["favicon.svg", favicon],
] as const) {
  writeFileSync(join(dir, name), toSvg(v, "Comptes"));
  console.log(name);
}
for (const [name, size, v] of [
  ["favicon-32.png", 32, favicon],
  ["icon-192.png", 192, tile],
  ["icon-512.png", 512, tile],
  ["icon-maskable-512.png", 512, maskable],
  ["apple-touch-icon.png", 180, apple],
] as const) {
  writeFileSync(join(dir, name), render(size, v));
  console.log(`${name} (${size} px)`);
}
