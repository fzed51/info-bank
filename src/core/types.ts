// Types partagés par le build, l'app et le backoffice. Montants en centimes entiers signés.

/** Opération bancaire, convertie depuis connect-bank. */
export interface Tx {
  id: string;
  /** IBAN sans espaces (clé du compte dans connect-bank). */
  account: string;
  /** Date de comptabilisation YYYY-MM-DD. */
  date: string;
  label: string;
  /** Montant signé en centimes (négatif = débit). */
  cents: number;
  status: "booked" | "pending";
}

/** Solde relevé par connect-bank. */
export interface BalancePoint {
  /** `CLBD` comptable, `XPCD` provisoire (inclut les opérations en cours). */
  type: string;
  date: string;
  cents: number;
}

export interface AccountSource {
  account: string;
  currency: string;
  txs: Tx[];
  balances: BalancePoint[];
}

export type AmountSpec =
  | { kind: "fixed"; cents: number; toleranceCents: number }
  | {
      kind: "variable";
      estimateCents: number;
      minCents?: number;
      maxCents?: number;
    };

/** Calendrier d'une opération récurrente. Les mois sont numérotés de 1 à 12. */
export interface Schedule {
  /** Jour attendu (1-31, ramené au dernier jour des mois plus courts). */
  day: number;
  /** Tolérance en jours, avant et après le jour attendu. */
  windowDays: number;
  /** Mois actifs ; absent = tous. */
  months?: number[];
  /** Un mois sur `n`, en partant du mois `anchor` (YYYY-MM). */
  every?: { n: number; anchor: string };
  /** Premier mois concerné (YYYY-MM). */
  start?: string;
  /** Dernier mois concerné (YYYY-MM). */
  end?: string;
}

export interface RecurringRule {
  id: string;
  account: string;
  name: string;
  active: boolean;
  /** `ignore` : opérations exclues de l'estimation des dépenses (virements internes…). */
  kind: "recurring" | "ignore";
  match: { pattern: string; mode: "contains" | "regex" };
  direction: "debit" | "credit";
  amount: AmountSpec;
  schedule: Schedule;
}

/** Correction manuelle : l'occurrence d'une règle pour un mois est liée à une opération, ou n'a pas lieu. */
export interface ManualLink {
  ruleId: string;
  period: string;
  /** Identifiant d'opération, ou `skip` (« pas ce mois-ci »). */
  txId: string;
}

export interface RulesFile {
  v: 1;
  /** Nom d'affichage par compte (clé : IBAN sans espaces). */
  accountNames: Record<string, string>;
  /** Comptes non publiés dans l'app (IBAN sans espaces) ; absent = tous publiés. */
  hiddenAccounts?: string[];
  /** Ordre d'affichage (IBAN sans espaces) ; les comptes absents suivent, dans l'ordre de connect-bank. */
  accountOrder?: string[];
  rules: RecurringRule[];
  links: ManualLink[];
}

export type OccurrenceStatus = "passee" | "a-venir" | "en-retard" | "ignoree";

export interface Occurrence {
  ruleId: string;
  account: string;
  name: string;
  period: string;
  /** Date attendue YYYY-MM-DD. */
  expected: string;
  /** Montant attendu signé (fixe, ou estimation si variable). */
  expectedCents: number;
  status: OccurrenceStatus;
  txId?: string;
  txDate?: string;
  txCents?: number;
  /** Liaison faite à la main dans le backoffice. */
  manual?: boolean;
}

export interface Projection {
  balanceCents: number;
  /** Somme des opérations prévues pas encore passées ce mois-ci. */
  plannedCents: number;
  plannedCount: number;
  /** Estimation des dépenses courantes jusqu'à la fin du mois (négative). */
  estimateCents: number;
  dailyEstimateCents: number;
  daysRemaining: number;
  endCents: number;
  /**
   * Base de calcul des dépenses courantes (absente pour la vue « Total »). Anciennement
   * `basis`, d'un autre format : une app encore en cache ignore ce nouveau champ.
   */
  spending?: SpendingBasis;
}

/**
 * Méthodes d'estimation des dépenses courantes jusqu'à la fin du mois :
 * - `rolling` : moyenne journalière des 90 derniers jours ;
 * - `lastYear` : moyenne journalière du même mois de l'année précédente ;
 * - `weekday` : moyenne de chaque jour de la semaine sur 12 mois, pour les jours restants ;
 * - `monthDay` : moyenne de chaque numéro de jour du mois sur 12 mois, pour les jours restants.
 */
export type SpendingMethodKind =
  | "rolling"
  | "lastYear"
  | "weekday"
  | "monthDay";

export interface SpendingMethod {
  kind: SpendingMethodKind;
  /** Fenêtre de calcul, bornes incluses (YYYY-MM-DD). */
  from: string;
  to: string;
  days: number;
  /** Fenêtre raccourcie : l'historique du compte commence après le début nominal. */
  partial: boolean;
  /** Débits retenus dans la fenêtre. */
  count: number;
  totalCents: number;
  /** Dépense estimée jusqu'à la fin du mois ; absente si la méthode est écartée faute d'historique. */
  estimateCents?: number;
}

/** Comment la dépense courante a été estimée (affiché dans l'app). */
export interface SpendingBasis {
  methods: SpendingMethod[];
  /** Débits écartés sur l'ensemble des fenêtres (rattachés à une règle récurrente ou « ignorer »). */
  excludedCount: number;
}

/** Contenu déchiffré par l'app. Ne contient que ce qui est affiché. */
export interface Payload {
  v: 1;
  generatedAt: string;
  /** Date de référence des données (YYYY-MM-DD). */
  asOf: string;
  syncError?: string;
  /** Version de démonstration : toutes les données sont fictives (`npm run build:demo`). */
  demo?: true;
  /** Début commun des séries quotidiennes. */
  historyStart: string;
  accounts: PayloadAccount[];
}

export interface PayloadAccount {
  /** Identifiant opaque (empreinte de l'IBAN). */
  key: string;
  name: string;
  maskedIban: string;
  currency: string;
  balance: { cents: number; date: string; type: string };
  /** Solde de fin de journée, un point par jour depuis `historyStart`. */
  history: number[];
  transactions: PayloadTx[];
  occurrences: PayloadOccurrence[];
  projection: Projection;
}

export interface PayloadTx {
  date: string;
  label: string;
  cents: number;
  pending: boolean;
  /** Nom de la règle récurrente rattachée, le cas échéant. */
  rule?: string;
  /** Nom du compte (vue « Total » uniquement, ajouté par l'app). */
  account?: string;
}

/** Occurrence publiée : sans IBAN ni identifiant bancaire. */
export type PayloadOccurrence = Omit<Occurrence, "account" | "txId">;
