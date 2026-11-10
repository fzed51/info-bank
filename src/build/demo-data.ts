// Données entièrement fictives pour la version de démonstration (`npm run build:demo`).
// Aucune lecture de `.env`, de connect-bank ni de %APPDATA% : tout est fabriqué ici.
import {
  addDays,
  addMonths,
  daysInMonth,
  periodOf,
  weekdayOf,
} from "../core/dates.ts";
import type {
  AccountSource,
  RecurringRule,
  RulesFile,
  Tx,
} from "../core/types.ts";

/**
 * Clé de connexion de la démo. Elle protège des données fictives : elle peut être publiée
 * (README), contrairement à `IB_PASSPHRASE`.
 */
export const demoPassphrase = "galoche-buisson-sablier-clairiere-grenier";

/** Sel fixe (non secret) : la clé mémorisée sur un appareil reste valable d'un build à l'autre. */
export const demoSalt = "ZGVtby1pbmZvLWJhbmstMQ==";

export const demoChecking = "FR7600000000000000000000D01";
export const demoSavings = "FR7600000000000000000000D02";

/** Générateur pseudo-aléatoire déterministe (mulberry32) : deux builds donnent les mêmes dépenses. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const merchants = [
  "SUPERMARCHE DEMO",
  "BOULANGERIE DEMO",
  "PHARMACIE DEMO",
  "STATION CARBURANT DEMO",
  "CAFE DE LA PLACE DEMO",
  "LIBRAIRIE DEMO",
  "MARCHE DEMO",
  "RESTAURANT DEMO",
  "BRICOLAGE DEMO",
  "CINEMA DEMO",
];

const pad = (n: number): string => String(n).padStart(2, "0");
const shortDate = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Prélèvements et virements mensuels : jour du mois, libellé, montant signé en centimes. */
const monthly: { day: number; label: string; cents: () => number }[] = [
  { day: 5, label: "PRLV LOYER RESIDENCE DEMO", cents: () => -78000 },
  { day: 8, label: "PRLV FIBRE FOURNISSEUR DEMO", cents: () => -2999 },
  { day: 12, label: "PRLV ASSURANCE HABITATION DEMO", cents: () => -4650 },
  { day: 20, label: "PRLV ABONNEMENT VIDEO DEMO", cents: () => -1349 },
  { day: 27, label: "VIR SALAIRE ENTREPRISE DEMO", cents: () => 245000 },
  { day: 28, label: "VIR LIVRET EPARGNE DEMO", cents: () => -20000 },
];

/**
 * Deux comptes sur 13 mois jusqu'à la veille de `today` : un compte courant (paiements
 * par carte du lundi au vendredi, week-end regroupé le lundi comme chez une vraie banque,
 * prélèvements, salaire, deux opérations en cours) et un livret alimenté chaque mois.
 */
export function demoSources(today: string): AccountSource[] {
  const rand = prng(20261109);
  const between = (min: number, max: number): number =>
    min + Math.floor(rand() * (max - min + 1));
  const start = `${addMonths(periodOf(today), -13)}-01`;
  const last = addDays(today, -1);
  let seq = 0;
  const checking: Tx[] = [];
  const savings: Tx[] = [];
  const add = (
    list: Tx[],
    account: string,
    date: string,
    label: string,
    cents: number,
    pending = false,
  ): void => {
    list.push({
      id: `demo-${++seq}`,
      account,
      date,
      label,
      cents,
      status: pending ? "pending" : "booked",
    });
  };

  for (let d = start; d <= last; d = addDays(d, 1)) {
    const weekday = weekdayOf(d);
    if (weekday === 0 || weekday === 6) continue;
    const count = weekday === 1 ? between(4, 6) : between(2, 3);
    for (let i = 0; i < count; i++) {
      const big = rand() < 0.06;
      const cents = -(big ? between(5000, 10000) : between(400, 4000));
      const merchant = merchants[between(0, merchants.length - 1)];
      add(
        checking,
        demoChecking,
        d,
        `CARTE ${shortDate(d)} ${merchant}`,
        cents,
      );
    }
  }
  for (let p = periodOf(start); p <= periodOf(last); p = addMonths(p, 1)) {
    for (const m of monthly) {
      // Pas de comptabilisation le week-end : reportée au lundi.
      let d = `${p}-${pad(Math.min(m.day, daysInMonth(p)))}`;
      while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = addDays(d, 1);
      if (d > last) continue;
      add(checking, demoChecking, d, m.label, m.cents());
      if (m.label.startsWith("VIR LIVRET"))
        add(savings, demoSavings, d, "VIR COMPTE COURANT DEMO", 20000);
    }
    // Électricité : montant variable d'un mois à l'autre.
    const d = `${p}-15`;
    if (d <= last && weekdayOf(d) !== 0 && weekdayOf(d) !== 6)
      add(checking, demoChecking, d, "PRLV ENERGIE DEMO", -between(5500, 7200));
  }
  // Opérations en cours : achats de la veille pas encore comptabilisés.
  add(
    checking,
    demoChecking,
    last,
    `CARTE ${shortDate(last)} CAFE DE LA PLACE DEMO`,
    -450,
    true,
  );
  add(
    checking,
    demoChecking,
    last,
    `CARTE ${shortDate(last)} SUPERMARCHE DEMO`,
    -3180,
    true,
  );

  const net = (list: Tx[]): number => list.reduce((s, t) => s + t.cents, 0);
  /** Solde actuel tel que le solde quotidien reste au moins à `floor` sur tout l'historique. */
  const balanceFor = (list: Tx[], floor: number): number => {
    let sum = 0;
    let lowest = 0;
    for (const t of [...list].sort((x, y) => x.date.localeCompare(y.date))) {
      sum += t.cents;
      lowest = Math.min(lowest, sum);
    }
    return floor - lowest + net(list);
  };
  return [
    {
      account: demoChecking,
      currency: "EUR",
      txs: checking,
      balances: [
        {
          type: "XPCD",
          date: today,
          cents: balanceFor(checking, 60000),
        },
      ],
    },
    {
      account: demoSavings,
      currency: "EUR",
      txs: savings,
      balances: [
        { type: "XPCD", date: today, cents: balanceFor(savings, 300000) },
      ],
    },
  ];
}

const rule = (
  id: string,
  name: string,
  pattern: string,
  direction: "debit" | "credit",
  amount: RecurringRule["amount"],
  day: number,
): RecurringRule => ({
  id,
  account: demoChecking,
  name,
  active: true,
  kind: "recurring",
  match: { pattern, mode: "contains" },
  direction,
  amount,
  schedule: { day, windowDays: 3 },
});

/** Règles de la démo : échéances du compte courant et virement d'épargne ignoré des dépenses. */
export function demoRules(): RulesFile {
  return {
    v: 1,
    accountNames: {
      [demoChecking]: "Compte courant",
      [demoSavings]: "Livret",
    },
    accountOrder: [demoChecking, demoSavings],
    rules: [
      rule(
        "demo-loyer",
        "Loyer",
        "LOYER RESIDENCE",
        "debit",
        { kind: "fixed", cents: 78000, toleranceCents: 0 },
        5,
      ),
      rule(
        "demo-fibre",
        "Internet",
        "FIBRE FOURNISSEUR",
        "debit",
        { kind: "fixed", cents: 2999, toleranceCents: 0 },
        8,
      ),
      rule(
        "demo-assurance",
        "Assurance habitation",
        "ASSURANCE HABITATION",
        "debit",
        { kind: "fixed", cents: 4650, toleranceCents: 0 },
        12,
      ),
      rule(
        "demo-energie",
        "Électricité",
        "ENERGIE",
        "debit",
        {
          kind: "variable",
          estimateCents: 6400,
          minCents: 5000,
          maxCents: 8000,
        },
        15,
      ),
      rule(
        "demo-video",
        "Abonnement vidéo",
        "ABONNEMENT VIDEO",
        "debit",
        { kind: "fixed", cents: 1349, toleranceCents: 0 },
        20,
      ),
      rule(
        "demo-salaire",
        "Salaire",
        "SALAIRE ENTREPRISE",
        "credit",
        { kind: "fixed", cents: 245000, toleranceCents: 0 },
        27,
      ),
      {
        ...rule(
          "demo-epargne",
          "Virement vers le livret",
          "LIVRET EPARGNE",
          "debit",
          { kind: "fixed", cents: 0, toleranceCents: 0 },
          1,
        ),
        kind: "ignore",
      },
    ],
    links: [],
  };
}
