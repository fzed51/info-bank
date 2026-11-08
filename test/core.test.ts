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
import { addMonths, daysInMonth, periodRange } from "../src/core/dates.ts";
import { checkBookedBalance, dailyHistory } from "../src/core/history.ts";
import {
  labelMatches,
  normalizeLabel,
  suggestedPattern,
} from "../src/core/labels.ts";
import { matchOccurrences, ruleHits } from "../src/core/matching.ts";
import { buildPayload, maskIban } from "../src/core/payload.ts";
import { dailySpending, projectEndOfMonth } from "../src/core/projection.ts";
import { emptyRulesFile, validateRulesFile } from "../src/core/rules.ts";
import { expectedDate, monthSpan } from "../src/core/schedule.ts";
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

test("Projection : prévues restantes + dépenses courantes hors règles et hors « ignorer »", () => {
  const txs = [
    tx("2026-08-01", "CARTE A", -9200),
    tx("2026-09-10", "CARTE B", -9200),
    tx("2026-10-31", "VIR INTERNE EPARGNE", -50000),
    tx("2026-10-05", "PRLV LOYER", -80000),
    tx("2026-10-20", "SALAIRE", 250000),
  ];
  const ignore = rule({
    id: "int",
    kind: "ignore",
    match: { pattern: "VIR INTERNE", mode: "contains" },
  });
  // Fenêtre : 01/08 → 31/10 = 92 jours ; seules les cartes comptent (le loyer est rattaché).
  const { dailyCents: daily, basis } = dailySpending(
    txs,
    [ignore],
    new Set([txs[3].id]),
    "2026-11-08",
  );
  assert.equal(daily, -200);
  // Base affichée : fenêtre, débits retenus et écartés (loyer rattaché, virement ignoré).
  assert.deepEqual(basis, {
    from: "2026-08-01",
    to: "2026-10-31",
    days: 92,
    partial: false,
    count: 2,
    totalCents: -18400,
    excludedCount: 2,
  });
  const occ = matchOccurrences([rule()], [], [], ["2026-11"], "2026-11-08");
  const p = projectEndOfMonth(100000, "2026-11-08", occ, daily, basis);
  assert.equal(p.basis, basis);
  assert.equal(p.daysRemaining, 22);
  assert.equal(p.plannedCents, -80000);
  assert.equal(p.estimateCents, -4400);
  assert.equal(p.endCents, 100000 - 80000 - 4400);
  // Historique plus court que 3 mois : la fenêtre commence à la première opération.
  const short = dailySpending(
    [tx("2026-10-01", "X", -3100)],
    [],
    new Set(),
    "2026-11-02",
  );
  assert.equal(short.dailyCents, -100);
  assert.equal(short.basis.partial, true);
  assert.equal(short.basis.days, 31);
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
