// Génère le logo et les icônes de la PWA depuis une seule description géométrique :
// SVG (logo, favicon) et PNG (manifeste, Apple), sans dépendance — rastérisation avec
// suréchantillonnage et encodage PNG via node:zlib.
// Dessin : page de registre (marge rouge, lignes, double trait de total) et courbe
// d'encre qui monte vers un point bleu. Couleurs : thème clair de DESIGN.md.
// Usage : npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

const colors = {
  paper: "#F4EEDF",
  rule: "#D6CAB0",
  ruleStrong: "#8F7F62",
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

/** Trait horizontal ou vertical, bouts carrés. */
const rule = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
): Shape => {
  const h = width / 2;
  const [xa, xb] = y1 === y2 ? [x1, x2] : [x1 - h, x1 + h];
  const [ya, yb] = y1 === y2 ? [y1 - h, y1 + h] : [y1, y2];
  return {
    svg: `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${width}"/>`,
    hit: (px, py) => px >= xa && px <= xb && py >= ya && py <= yb,
    color,
  };
};

/** Ligne brisée, bouts et jonctions arrondis. */
const polyline = (
  points: [number, number][],
  width: number,
  color: string,
): Shape => ({
  svg: `<polyline points="${points.map((p) => p.join(",")).join(" ")}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  hit: (px, py) =>
    points.slice(1).some(([bx, by], i) => {
      const [ax, ay] = points[i];
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(
        0,
        Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
      );
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= width / 2;
    }),
  color,
});

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
  /** Version simplifiée, lisible à 16 px (favicon) : ni lignes ni trait de total. */
  simple: boolean;
}

/** Contenu du logo dans le repère `side` × `side`, peint dans l'ordre. */
function drawing(simple: boolean): Shape[] {
  const c = colors;
  if (simple)
    return [
      rule(150, 40, 150, 472, 32, c.margin),
      polyline(
        [
          [206, 368],
          [276, 262],
          [334, 312],
          [404, 176],
        ],
        60,
        c.ink,
      ),
      circle(404, 160, 72, c.paper),
      circle(404, 160, 54, c.accent),
    ];
  return [
    ...[200, 272, 344].map((y) => rule(96, y, 416, y, 8, c.rule)),
    rule(150, 64, 150, 448, 12, c.margin),
    rule(186, 400, 416, 400, 8, c.ruleStrong),
    rule(186, 420, 416, 420, 8, c.ruleStrong),
    polyline(
      [
        [198, 328],
        [264, 246],
        [316, 286],
        [384, 164],
      ],
      30,
      c.ink,
    ),
    circle(384, 140, 46, c.paper),
    circle(384, 140, 32, c.accent),
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
