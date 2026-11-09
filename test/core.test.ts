// Tests hors ligne : données fabriquées uniquement, aucune donnée bancaire réelle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { initialTxIndexes, plannedSteps } from "../src/app/data.ts";
import { toCents } from "../src/build/source.ts";
import {
  decryptJson,
  deriveKey,
  encryptJson,
  newKdfParams,
  WrongKeyError,
} from "../src/core/crypto.ts";
import {
  addDays,
  addMonths,
  addMonthsToDate,
  daysInMonth,
  periodRange,
  weekdayOf,
} from "../src/core/dates.ts";
import { checkBookedBalance, dailyHistory } from "../src/core/history.ts";
import {
  labelMatches,
  normalizeLabel,
  suggestedPattern,
} from "../src/core/labels.ts";
import { matchOccurrences, ruleHits } from "../src/core/matching.ts";
import { buildPayload, maskIban } from "../src/core/payload.ts";
import {
  dailySpending,
  projectEndOfMonth,
  remainingDays,
} from "../src/core/projection.ts";
import { emptyRulesFile, validateRulesFile } from "../src/core/rules.ts";
import { expectedDate, monthSpan } from "../src/core/schedule.ts";
import { spendingCurves } from "../src/core/spending-curves.ts";
import { suggestRecurring } from "../src/core/suggest.ts";
import type {
  AccountSource,
  PayloadOccurrence,
  RecurringRule,
  Schedule,
  Tx,
} from "../src/core/types.ts";

const acc = "FR7600000000000000000000X01";
let seq = 0;
const tx = (
  date: string,
  label: string,
  cents: number,
  pending = false,
): Tx => ({
  id: `t${++seq}`,
  account: acc,
  date,
  label,
  cents,
  status: pending ? "pending" : "booked",
});

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: "loyer",
  account: acc,
  name: "Loyer",
  active: true,
  kind: "recurring",
  match: { pattern: "loyer", mode: "contains" },
  direction: "debit",
  amount: { kind: "fixed", cents: 80000, toleranceCents: 0 },
  schedule: { day: 5, windowDays: 3 },
  ...over,
});

test("Dates : fin de mois, ajout de mois, plage", () => {
  assert.equal(daysInMonth("2028-02"), 29);
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(addMonths("2026-11", 3), "2027-02");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonthsToDate("2028-02-29", -12), "2027-02-28");
  assert.equal(addMonthsToDate("2026-11-08", -12), "2025-11-08");
  assert.equal(weekdayOf("2026-11-08"), 0); // dimanche
  assert.deepEqual(periodRange("2026-11", "2027-01"), [
    "2026-11",
    "2026-12",
    "2027-01",
  ]);
});

test("Calendrier : tous les mois, 31 en février, mois choisis, 1 mois sur 2, bornes", () => {
  const s = (o: Partial<Schedule>): Schedule => ({
    day: 31,
    windowDays: 2,
    ...o,
  });
  assert.equal(expectedDate(s({}), "2026-02"), "2026-02-28");
  assert.equal(expectedDate(s({}), "2026-04"), "2026-04-30");
  const janToOct = s({ day: 10, months: monthSpan(1, 10) });
  assert.equal(expectedDate(janToOct, "2026-10"), "2026-10-10");
  assert.equal(expectedDate(janToOct, "2026-11"), undefined);
  assert.deepEqual(monthSpan(11, 2), [11, 12, 1, 2]);
  const bimonthly = s({ day: 1, every: { n: 2, anchor: "2026-01" } });
  assert.equal(expectedDate(bimonthly, "2026-03"), "2026-03-01");
  assert.equal(expectedDate(bimonthly, "2026-04"), undefined);
  assert.equal(expectedDate(bimonthly, "2025-11"), "2025-11-01");
  const bounded = s({ day: 1, start: "2026-03", end: "2026-05" });
  assert.equal(expectedDate(bounded, "2026-02"), undefined);
  assert.equal(expectedDate(bounded, "2026-05"), "2026-05-01");
  assert.equal(expectedDate(bounded, "2026-06"), undefined);
});

test("Libellés : normalisation et motifs", () => {
  assert.equal(
    normalizeLabel("CB Prélèv. EDF 12/10 4979xxxx1234"),
    "CB PRELEV EDF XXXX",
  );
  assert.ok(
    labelMatches({ pattern: "edf", mode: "contains" }, "PRLV SEPA EDF CLIENTS"),
  );
  assert.ok(
    labelMatches({ pattern: "^PRLV .*EDF", mode: "regex" }, "PRLV SEPA EDF"),
  );
  assert.ok(!labelMatches({ pattern: "(", mode: "regex" }, "X"));
  assert.ok(!labelMatches({ pattern: "", mode: "contains" }, "X"));
});

test("Libellés : les chiffres d'un motif servent de discriminant", () => {
  const a = "COTISATION MENSUELLE CARTE COTISATION MENSUELLE CARTE 0026";
  const b = "COTISATION MENSUELLE CARTE COTISATION MENSUELLE CARTE 7857";
  const card = (pattern: string) => ({ pattern, mode: "contains" }) as const;
  assert.ok(labelMatches(card("Cotisation mensuelle carte 0026"), a));
  assert.ok(!labelMatches(card("Cotisation mensuelle carte 0026"), b));
  assert.ok(labelMatches(card("CARTE 7857"), b));
  // Sans chiffres dans le motif : numéros toujours ignorés, les deux correspondent.
  assert.ok(labelMatches(card("COTISATION MENSUELLE CARTE"), a));
  assert.ok(labelMatches(card("COTISATION MENSUELLE CARTE"), b));
  // Les dates restent ignorées, même avec des chiffres dans le motif.
  assert.ok(labelMatches(card("CARTE 0026"), "CB 12/10 CARTE 0026"));
});

test("Matching : passée, à venir, en retard, tolérance, une opération ne sert qu'une fois", () => {
  const txs = [
    tx("2026-10-06", "PRLV LOYER OCTOBRE", -80000),
    tx("2026-09-20", "PRLV LOYER", -80000), // hors fenêtre de septembre (5 ± 3)
    tx("2026-11-04", "PRLV LOYER", -79999), // hors tolérance (0)
  ];
  const occ = matchOccurrences(
    [rule()],
    [],
    txs,
    ["2026-09", "2026-10", "2026-11"],
    "2026-11-08",
  );
  const byPeriod = Object.fromEntries(occ.map((o) => [o.period, o]));
  assert.equal(byPeriod["2026-10"].status, "passee");
  assert.equal(byPeriod["2026-10"].txId, txs[0].id);
  assert.equal(byPeriod["2026-09"].status, "en-retard");
  assert.equal(byPeriod["2026-11"].status, "a-venir"); // fenêtre 5 ± 3 : encore ouverte le 8
  assert.equal(
    matchOccurrences([rule()], [], txs, ["2026-11"], "2026-11-09")[0].status,
    "en-retard",
  );
  const tolerant = matchOccurrences(
    [rule({ amount: { kind: "fixed", cents: 80000, toleranceCents: 100 } })],
    [],
    txs,
    ["2026-11"],
    "2026-11-06",
  );
  assert.equal(tolerant[0].status, "passee");
  const future = matchOccurrences([rule()], [], [], ["2026-11"], "2026-11-08");
  assert.equal(
    matchOccurrences(
      [rule({ schedule: { day: 20, windowDays: 3 } })],
      [],
      [],
      ["2026-11"],
      "2026-11-08",
    )[0].status,
    "a-venir",
  );
  assert.equal(future[0].expectedCents, -80000);

  // Deux règles identiques, une seule opération : une seule passe.
  const twice = matchOccurrences(
    [rule({ id: "a" }), rule({ id: "b" })],
    [],
    [txs[0]],
    ["2026-10"],
    "2026-10-07",
  );
  assert.deepEqual(twice.map((o) => o.status).sort(), ["a-venir", "passee"]);
});

test("Matching : montant variable, sens, opération en attente, liaisons manuelles", () => {
  const edf = rule({
    id: "edf",
    name: "EDF",
    match: { pattern: "EDF", mode: "contains" },
    amount: {
      kind: "variable",
      estimateCents: 6000,
      minCents: 3000,
      maxCents: 12000,
    },
    schedule: { day: 15, windowDays: 4 },
  });
  const txs = [
    tx("2026-11-14", "PRLV EDF", -9500, true),
    tx("2026-10-16", "REMB EDF", 9500), // crédit : mauvais sens
    tx("2026-09-15", "PRLV EDF", -15000), // au-dessus du maximum
    tx("2026-09-02", "PRLV EDF", -5000),
  ];
  const occ = matchOccurrences(
    [edf],
    [],
    txs,
    ["2026-09", "2026-10", "2026-11"],
    "2026-11-20",
  );
  const st = Object.fromEntries(occ.map((o) => [o.period, o.status]));
  assert.deepEqual(st, {
    "2026-09": "en-retard",
    "2026-10": "en-retard",
    "2026-11": "passee",
  });

  const linked = matchOccurrences(
    [edf],
    [
      { ruleId: "edf", period: "2026-09", txId: txs[3].id },
      { ruleId: "edf", period: "2026-10", txId: "skip" },
    ],
    txs,
    ["2026-09", "2026-10"],
    "2026-11-20",
  );
  assert.equal(linked[0].status, "passee");
  assert.equal(linked[0].manual, true);
  assert.equal(linked[1].status, "ignoree");
});

test("Matching : correspondances d'une règle (nombre, plus récente, jamais)", () => {
  const txs = [
    tx("2026-09-05", "PRLV LOYER", -80000),
    tx("2026-10-04", "PRLV LOYER", -80000, true),
    tx("2026-08-05", "PRLV LOYER", -80000),
    tx("2026-10-20", "PRLV LOYER", -1000), // montant hors tolérance
    tx("2026-10-21", "REMB LOYER", 80000), // mauvais sens
    { ...tx("2026-10-22", "PRLV LOYER", -80000), account: "FR76AUTRE" },
  ];
  assert.deepEqual(ruleHits(rule(), txs), { count: 3, last: "2026-10-04" });
  assert.deepEqual(ruleHits(rule({ active: false }), txs), {
    count: 3,
    last: "2026-10-04",
  });
  assert.deepEqual(
    ruleHits(rule({ match: { pattern: "EDF", mode: "contains" } }), txs),
    { count: 0 },
  );
});

test("Historique : reconstruction à rebours et contrôle du solde comptable", () => {
  const txs = [
    tx("2026-11-02", "A", -1000),
    tx("2026-11-04", "B", 5000),
    tx("2026-11-05", "C", -200, true),
  ];
  const ref = { cents: 10000, date: "2026-11-05" };
  assert.deepEqual(
    dailyHistory(txs, ref, "2026-11-01", "2026-11-06"),
    [6200, 5200, 5200, 10200, 10000, 10000],
  );
  // Référence au milieu de la période : les opérations postérieures s'ajoutent.
  assert.deepEqual(
    dailyHistory(
      txs,
      { cents: 5200, date: "2026-11-02" },
      "2026-11-01",
      "2026-11-05",
    ),
    [6200, 5200, 5200, 10200, 10000],
  );
  // CLBD au 04 = 10200 ; XPCD au 05 = 10000 inclut l'opération en attente du 05.
  assert.equal(
    checkBookedBalance(txs, ref, { cents: 10200, date: "2026-11-04" }),
    0,
  );
  assert.equal(
    checkBookedBalance(txs, ref, { cents: 10000, date: "2026-11-04" }),
    -200,
  );
});

/** Un débit par jour de `from` à `to`, montant choisi selon la date. */
const dailyTxs = (
  from: string,
  to: string,
  cents: (date: string) => number,
): Tx[] => {
  const out: Tx[] = [];
  for (let d = from; d <= to; d = addDays(d, 1))
    out.push(tx(d, "CARTE", cents(d)));
  return out;
};

test("Projection : moyenne des méthodes, hors règles et hors « ignorer »", () => {
  // Le 28/11/2026 est un samedi : restent le samedi 28 (jour du solde, encore incomplet),
  // le dimanche 29 et le lundi 30. Les fenêtres s'arrêtent la veille, le 27.
  // Débits de carte : 40 € le dimanche, 10 € les autres jours, depuis le 01/09.
  const cards = dailyTxs("2026-09-01", "2026-11-28", (d) =>
    weekdayOf(d) === 0 ? -4000 : -1000,
  );
  const txs = [
    ...cards,
    tx("2026-10-05", "PRLV LOYER", -80000),
    tx("2026-10-31", "VIR INTERNE EPARGNE", -50000),
    tx("2026-10-20", "SALAIRE", 250000),
  ];
  const ignore = rule({
    id: "int",
    kind: "ignore",
    match: { pattern: "VIR INTERNE", mode: "contains" },
  });
  const loyer = txs[cards.length];
  const { dailyCents, basis } = dailySpending(
    txs,
    [ignore],
    new Set([loyer.id]),
    "2026-11-28",
  );
  const [rolling, lastYear, weekday, monthDay] = basis.methods;
  // 90 jours glissants raccourcis à l'historique : 88 jours, dont 12 dimanches.
  assert.deepEqual(rolling, {
    kind: "rolling",
    from: "2026-09-01",
    to: "2026-11-27",
    days: 88,
    partial: true,
    count: 88,
    totalCents: -124000,
    estimateCents: Math.round((-124000 / 88) * 3),
  });
  // Novembre 2025 hors historique : méthode écartée.
  assert.equal(lastYear.kind, "lastYear");
  assert.equal(lastYear.estimateCents, undefined);
  // Moyenne du samedi + moyenne du dimanche + moyenne du lundi.
  assert.equal(weekday.estimateCents, -6000);
  assert.equal(weekday.partial, true);
  // Moyenne des 28, des 29 et des 30 (septembre et octobre).
  assert.equal(monthDay.estimateCents, -3000);
  // Loyer rattaché et virement ignoré écartés ; le salaire (crédit) ne compte pas.
  assert.equal(basis.excludedCount, 2);
  const mean = ((-124000 / 88) * 3 - 6000 - 3000) / 3;
  assert.equal(dailyCents, Math.round(mean / 3));

  const occ = matchOccurrences([rule()], [], [], ["2026-11"], "2026-11-08");
  const p = projectEndOfMonth(100000, "2026-11-08", occ, -200, basis);
  assert.equal(p.spending, basis);
  // Du 8 au 30 novembre, le jour du solde compris.
  assert.equal(p.daysRemaining, 23);
  assert.equal(p.plannedCents, -80000);
  assert.equal(p.estimateCents, -4600);
  assert.equal(p.endCents, 100000 - 80000 - 4600);
});

test("Projection : même mois l'an dernier, seulement s'il est complet", () => {
  const nov2025 = dailyTxs("2025-11-01", "2025-11-30", () => -3000);
  const full = dailySpending(nov2025, [], new Set(), "2026-11-08");
  const lastYear = full.basis.methods[1];
  assert.equal(lastYear.from, "2025-11-01");
  assert.equal(lastYear.to, "2025-11-30");
  assert.equal(lastYear.partial, false);
  // 30 € par jour × 23 jours restants.
  assert.equal(lastYear.estimateCents, -69000);
  const incomplete = dailySpending(
    nov2025.slice(1),
    [],
    new Set(),
    "2026-11-08",
  );
  assert.equal(incomplete.basis.methods[1].estimateCents, undefined);
});

test("Projection : historique court, méthodes sans jour de référence écartées", () => {
  // Deux jours d'historique avant le jour du solde : ni tous les jours de la semaine, ni les 8 → 30.
  const short = dailySpending(
    dailyTxs("2026-11-06", "2026-11-08", () => -300),
    [],
    new Set(),
    "2026-11-08",
  );
  assert.deepEqual(
    short.basis.methods.map((m) => m.estimateCents),
    [-300 * 23, undefined, undefined, undefined],
  );
  assert.equal(short.dailyCents, -300);
  // Le 31 n'a aucun jour de référence (novembre n'en a pas) : moyenne par jour du mois écartée.
  const dec = dailySpending(
    dailyTxs("2026-11-01", "2026-12-29", () => -100),
    [],
    new Set(),
    "2026-12-29",
  );
  assert.equal(dec.basis.methods[3].estimateCents, undefined);
  assert.equal(dec.basis.methods[2].estimateCents, -300);
  // Aucun historique : aucune estimation.
  const none = dailySpending([], [], new Set(), "2026-11-08");
  assert.equal(none.dailyCents, 0);
  assert.ok(none.basis.methods.every((m) => m.estimateCents === undefined));
  assert.equal(remainingDays("2026-11-30"), 1);
});

test("Chiffrement : aller-retour, mauvaise clé rejetée, aucun texte en clair", async () => {
  const kdf = { ...newKdfParams(), iterations: 1000 }; // itérations réduites pour la vitesse du test
  const value = { label: "PRLV LOYER", iban: acc, n: [1, 2, 3] };
  const file = await encryptJson(
    value,
    await deriveKey("une phrase de test assez longue", kdf),
    kdf,
  );
  assert.deepEqual(
    await decryptJson(
      file,
      await deriveKey("une phrase de test assez longue", kdf),
    ),
    value,
  );
  await assert.rejects(
    decryptJson(file, await deriveKey("une autre phrase de test", kdf)),
    WrongKeyError,
  );
  const text = JSON.stringify(file);
  assert.ok(!text.includes("LOYER") && !text.includes(acc));
  const again = await encryptJson(
    value,
    await deriveKey("une phrase de test assez longue", kdf),
    kdf,
  );
  assert.notEqual(again.iv, file.iv);
});

test("Payload : comptes, IBAN masqué, opérations publiées, projection", () => {
  const source: AccountSource = {
    account: acc,
    currency: "EUR",
    txs: [
      tx("2026-10-05", "PRLV LOYER", -80000),
      tx("2026-11-03", "CARTE", -1500),
    ],
    balances: [
      { type: "CLBD", date: "2026-11-06", cents: 120000 },
      { type: "XPCD", date: "2026-11-08", cents: 118500 },
    ],
  };
  const rules = {
    ...emptyRulesFile(),
    accountNames: { [acc]: "Courant" },
    rules: [rule()],
  };
  const { payload, stats } = buildPayload(
    [
      source,
      {
        account: "FR76EMPTY0000000000000000Y02",
        currency: "EUR",
        txs: [],
        balances: [],
      },
    ],
    rules,
    "2026-11-08",
    "2026-11-08T03:00:00.000Z",
  );
  assert.equal(payload.accounts.length, 1);
  assert.deepEqual(stats.skipped, [maskIban("FR76EMPTY0000000000000000Y02")]);
  const a = payload.accounts[0];
  assert.equal(a.name, "Courant");
  assert.equal(a.maskedIban, "FR76 •••• X01");
  assert.equal(a.balance.cents, 118500);
  assert.equal(payload.historyStart, "2026-10-05");
  assert.equal(a.history.at(-1), 118500);
  assert.equal(a.history.length, 35);
  assert.equal(a.transactions[0].label, "CARTE");
  assert.equal(a.transactions[1].rule, "Loyer");
  assert.equal(a.occurrences.length, 1);
  assert.equal(a.occurrences[0].status, "a-venir");
  assert.equal(a.projection.plannedCents, -80000);
  assert.ok(!JSON.stringify(payload).includes(acc));
});

test("App : vue de départ des opérations (en cours + dernière comptabilisée)", () => {
  const t = (date: string, pending: boolean) => ({
    date,
    label: "X",
    cents: -100,
    pending,
  });
  // Triées de la plus récente à la plus ancienne, comme dans le payload.
  const list = [
    t("2026-11-08", true),
    t("2026-11-07", true),
    t("2026-11-06", false),
    t("2026-11-05", false),
  ];
  assert.deepEqual([...initialTxIndexes(list)].sort(), [0, 1, 2]);
  // Aucune en cours : seulement la dernière comptabilisée.
  assert.deepEqual([...initialTxIndexes(list.slice(2))], [0]);
  // Uniquement des opérations en cours.
  assert.deepEqual([...initialTxIndexes(list.slice(0, 2))].sort(), [0, 1]);
  assert.equal(initialTxIndexes([]).size, 0);
});

test("Payload : comptes masqués non publiés, ordre choisi", () => {
  const account = (iban: string, cents: number): AccountSource => ({
    account: iban,
    currency: "EUR",
    txs: [{ ...tx("2026-11-02", "CARTE", -100), account: iban }],
    balances: [{ type: "CLBD", date: "2026-11-08", cents }],
  });
  const [a, b, c] = [
    "FR76A0000000000000000000A01",
    "FR76B0000000000000000000B02",
    "FR76C0000000000000000000C03",
  ];
  const sources = [account(a, 100), account(b, 200), account(c, 300)];
  const build = (over: Partial<ReturnType<typeof emptyRulesFile>>) =>
    buildPayload(
      sources,
      { ...emptyRulesFile(), ...over },
      "2026-11-08",
      "2026-11-08T03:00:00.000Z",
    );
  // Ordre partiel : c puis a, b (absent de la liste) en dernier.
  const ordered = build({ accountOrder: [c, a] });
  assert.deepEqual(
    ordered.payload.accounts.map((x) => x.balance.cents),
    [300, 100, 200],
  );
  const masked = build({ hiddenAccounts: [b], accountOrder: [c, a, b] });
  assert.deepEqual(
    masked.payload.accounts.map((x) => x.balance.cents),
    [300, 100],
  );
  assert.equal(masked.stats.hidden, 1);
  assert.ok(!JSON.stringify(masked.payload).includes(maskIban(b)));
  // Sans réglage : ordre de connect-bank, tous publiés.
  assert.equal(build({}).payload.accounts.length, 3);
  assert.equal(build({}).stats.hidden, 0);
});

test("Suggestions : opérations présentes au moins 3 mois, achats fréquents exclus", () => {
  const txs = [
    tx("2026-08-03", "PRLV FREE MOBILE 123456", -1999),
    tx("2026-09-03", "PRLV FREE MOBILE 223456", -1999),
    tx("2026-10-04", "PRLV FREE MOBILE 323456", -2199),
    ...["08", "09", "10"].flatMap((m) =>
      [1, 2, 3, 4].map((d) => tx(`2026-${m}-0${d}`, "CB BOULANGERIE", -300)),
    ),
  ];
  const s = suggestRecurring(txs, new Set(), "2026-11-08");
  assert.equal(s.length, 1);
  assert.equal(s[0].pattern, "PRLV FREE MOBILE");
  assert.equal(s[0].months, 3);
  assert.equal(s[0].medianDay, 3);
  assert.equal(s[0].variable, true);
  assert.equal(
    suggestRecurring(txs, new Set(s[0].txIds), "2026-11-08").length,
    0,
  );
});

test("Suggestions : motif coupé avant les références SEPA (ICS, RUM, échéance)", () => {
  // Libellés fictifs au format LCL : ICS et RUM fixes, référence d'échéance variable.
  const sepa = (date: string, ref: string) =>
    tx(
      date,
      `PRLV SEPA ASSUR EXEMPLE ICS.FR12ZZZ123456 .RUM.AB1234567890-1 SDR${ref}`,
      -4500,
    );
  const txs = [
    sepa("2026-08-10", "100000000001"),
    sepa("2026-09-10", "100000000002"),
    // Mandat renouvelé : autre RUM, même créancier, même suggestion.
    tx(
      "2026-10-10",
      "PRLV SEPA ASSUR EXEMPLE ICS.FR12ZZZ123456 .RUM.CD9876543210-2 SDR100000000003",
      -4500,
    ),
  ];
  const all = suggestRecurring(txs, new Set(), "2026-11-08");
  assert.equal(all.length, 1);
  const [s] = all;
  assert.equal(s.pattern, "PRLV SEPA ASSUR EXEMPLE");
  assert.equal(s.months, 3);
  // Le motif retrouve toutes les opérations du groupe.
  const pattern = { pattern: s.pattern, mode: "contains" } as const;
  assert.equal(txs.filter((t) => labelMatches(pattern, t.label)).length, 3);
  // Rien avant ICS : la clé entière est gardée.
  assert.equal(suggestedPattern("ICS FR ZZZ RUM AB"), "ICS FR ZZZ RUM AB");
  assert.equal(suggestedPattern("PRLV FREE MOBILE"), "PRLV FREE MOBILE");
});

test("Règles : validation du fichier", () => {
  assert.doesNotThrow(() =>
    validateRulesFile({ ...emptyRulesFile(), rules: [rule()] }),
  );
  assert.throws(
    () =>
      validateRulesFile({ ...emptyRulesFile(), rules: [rule({ name: " " })] }),
    /nom/,
  );
  assert.throws(
    () =>
      validateRulesFile({
        ...emptyRulesFile(),
        rules: [rule({ match: { pattern: "(", mode: "regex" } })],
      }),
    /régulière/,
  );
  assert.throws(
    () =>
      validateRulesFile({
        ...emptyRulesFile(),
        rules: [rule({ schedule: { day: 0, windowDays: 1 } })],
      }),
    /jour/,
  );
  assert.throws(
    () =>
      validateRulesFile({
        ...emptyRulesFile(),
        links: [{ ruleId: "x", period: "2026-01", txId: "t" }],
      }),
    /liaison/,
  );
  assert.doesNotThrow(() =>
    validateRulesFile({
      ...emptyRulesFile(),
      hiddenAccounts: [acc],
      accountOrder: [acc],
    }),
  );
  assert.throws(
    () =>
      validateRulesFile({
        ...emptyRulesFile(),
        hiddenAccounts: [1] as unknown as string[],
      }),
    /comptes masqués/,
  );
  assert.throws(() => validateRulesFile({ v: 2 }), /version/);
});

test("Montants connect-bank → centimes", () => {
  assert.equal(toCents("-12.50"), -1250);
  assert.equal(toCents("0.5"), 50);
  assert.equal(toCents("1234"), 123400);
  assert.equal(toCents("-0.07"), -7);
  assert.throws(() => toCents("12,50"));
});

test("Calendrier : plages continues et description", async () => {
  const { contiguousSpan, describeSchedule } = await import(
    "../src/core/schedule.ts"
  );
  assert.deepEqual(contiguousSpan([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), [1, 10]);
  assert.deepEqual(contiguousSpan([11, 12, 1, 2]), [11, 2]);
  assert.equal(contiguousSpan([1, 3]), undefined);
  assert.equal(contiguousSpan([]), undefined);
  assert.equal(
    describeSchedule({ day: 14, windowDays: 4, months: monthSpan(1, 10) }),
    "le 14 (±4 j), de janv. à oct.",
  );
});

test("Graphique : escalier des seules opérations prévues encore attendues", () => {
  const occ = (
    expected: string,
    expectedCents: number,
    status: PayloadOccurrence["status"],
  ): PayloadOccurrence => ({
    ruleId: expected,
    name: expected,
    period: expected.slice(0, 7),
    expected,
    expectedCents,
    status,
  });
  const steps = plannedSteps(
    100000,
    [
      occ("2026-11-27", 250000, "a-venir"),
      occ("2026-11-05", -80000, "passee"), // déjà dans le solde
      occ("2026-11-03", -4500, "en-retard"), // comptée aujourd'hui
      occ("2026-11-10", -4500, "a-venir"),
      occ("2026-11-10", -1000, "a-venir"), // même jour : cumulées
      occ("2026-11-12", -2000, "ignoree"),
      occ("2026-12-01", -9999, "a-venir"), // hors du mois
    ],
    "2026-11-08",
  );
  assert.deepEqual(steps, [
    { date: "2026-11-08", cents: 95500 },
    { date: "2026-11-10", cents: 90000 },
    { date: "2026-11-27", cents: 340000 },
  ]);
  assert.deepEqual(plannedSteps(100000, [], "2026-11-08"), []);
});

test("Courbes de dépenses : mois repartant de 0, hors règles, réel puis projection", () => {
  const other = "FR7600000000000000000000X02";
  const own = (date: string, cents: number, label = "CARTE COURSES"): Tx =>
    tx(date, label, cents);
  const txs: Tx[] = [
    own("2026-09-02", -1000),
    own("2026-09-02", -500),
    own("2026-09-20", -2000),
    own("2026-09-15", 50000, "VIR SALAIRE"), // crédit : ignoré
    own("2026-09-05", -70000, "PRLV LOYER"), // rattaché à une règle
    own("2026-10-31", -300),
    own("2026-11-03", -400),
    own("2026-11-08", -600),
    { ...own("2026-10-10", -9999), account: other }, // autre compte
    own("2026-08-12", -100), // plus ancien que les deux mois comparés
  ];
  const loyer = rule({
    amount: { kind: "fixed", cents: 70000, toleranceCents: 0 },
  });

  const { months, current } = spendingCurves(
    acc,
    txs,
    [loyer],
    [],
    "2026-11-09",
  );
  assert.deepEqual(
    months.map((m) => m.period),
    ["2026-09", "2026-10"],
  );
  const sep = months[0];
  assert.equal(sep.cumCents.length, 31);
  assert.equal(sep.cumCents[0], 0);
  assert.equal(sep.cumCents[1], 0);
  assert.equal(sep.cumCents[2], 1500);
  assert.equal(sep.cumCents[19], 1500);
  assert.equal(sep.cumCents[30], 3500); // ni crédit, ni loyer
  const oct = months[1];
  assert.equal(oct.cumCents[30], 0);
  assert.equal(oct.cumCents[31], 300);

  // Mois en cours : réel jusqu'à la veille (8), projection ensuite.
  assert.equal(current.period, "2026-11");
  assert.equal(current.through, 8);
  assert.equal(current.actualCents.length, 9);
  assert.equal(current.actualCents[3], 400);
  assert.equal(current.actualCents[8], 1000);
  // La projection est celle de l'app : mêmes débits retenus (loyer rattaché, donc écarté).
  const excluded = new Set(
    matchOccurrences(
      [loyer],
      [],
      txs,
      periodRange("2025-09", "2026-11"),
      "2026-11-09",
    ).flatMap((o) => o.txId ?? []),
  );
  const expected = dailySpending(
    txs.filter((t) => t.account === acc),
    [loyer],
    excluded,
    "2026-11-09",
  );
  assert.equal(
    current.endCents,
    1000 - expected.dailyCents * remainingDays("2026-11-09"),
  );
  assert.ok(current.endCents > 1000);
  assert.ok(current.methods.length > 0);
  for (const m of current.methods) assert.ok(m.endCents >= 1000);

  // Premier du mois : rien de comptabilisé, la projection part de 0.
  const first = spendingCurves(acc, txs, [loyer], [], "2026-11-01");
  assert.equal(first.current.through, 0);
  assert.deepEqual(first.current.actualCents, [0]);
});
