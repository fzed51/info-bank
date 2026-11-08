import {
  decryptJson,
  type EncryptedFile,
  isEncryptedFile,
} from "../core/crypto.ts";
import { sumProjections } from "../core/projection.ts";
import type {
  Payload,
  PayloadAccount,
  PayloadOccurrence,
  PayloadTx,
} from "../core/types.ts";

export class DataUnavailableError extends Error {}

/** Télécharge le fichier chiffré (le service worker sert la copie en cache hors ligne). */
export async function fetchEncrypted(): Promise<EncryptedFile> {
  let response: Response;
  try {
    response = await fetch("./data.enc", { cache: "no-cache" });
  } catch {
    throw new DataUnavailableError(
      "Données inaccessibles : pas de réseau et aucune copie sur cet appareil.",
    );
  }
  if (!response.ok)
    throw new DataUnavailableError(
      `Données introuvables sur le serveur (${response.status}).`,
    );
  const file: unknown = await response.json().catch(() => undefined);
  if (!isEncryptedFile(file))
    throw new DataUnavailableError("Fichier de données illisible.");
  return file;
}

export async function decryptPayload(
  file: EncryptedFile,
  key: CryptoKey,
): Promise<Payload> {
  const value = (await decryptJson(file, key)) as Payload;
  if (value?.v !== 1 || !Array.isArray(value.accounts))
    throw new DataUnavailableError(
      "Version de données inconnue : mettez l'app à jour.",
    );
  return value;
}

export const totalKey = "total";

/**
 * Opérations affichées sans « Afficher plus » : toutes celles en cours, puis la plus
 * récente des comptabilisées (liste triée de la plus récente à la plus ancienne).
 * Rend leurs positions dans la liste.
 */
export function initialTxIndexes(transactions: PayloadTx[]): Set<number> {
  const shown = new Set<number>();
  transactions.forEach((t, i) => {
    if (t.pending) shown.add(i);
  });
  const lastBooked = transactions.findIndex((t) => !t.pending);
  if (lastBooked !== -1) shown.add(lastBooked);
  return shown;
}

/**
 * Solde attendu avec les seules opérations prévues encore attendues (à venir ou en
 * retard) du mois de `asOf` : un point par date, cumulé depuis `balanceCents`. Une
 * opération en retard est comptée à `asOf`.
 */
export function plannedSteps(
  balanceCents: number,
  occurrences: PayloadOccurrence[],
  asOf: string,
): { date: string; cents: number }[] {
  const byDate = new Map<string, number>();
  for (const o of occurrences) {
    if (o.period !== asOf.slice(0, 7)) continue;
    if (o.status !== "a-venir" && o.status !== "en-retard") continue;
    const date = o.expected > asOf ? o.expected : asOf;
    byDate.set(date, (byDate.get(date) ?? 0) + o.expectedCents);
  }
  let cents = balanceCents;
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, delta]) => {
      cents += delta;
      return { date, cents };
    });
}

/** Vue « Total » : somme des comptes (les virements internes s'annulent). */
export function totalAccount(accounts: PayloadAccount[]): PayloadAccount {
  const length = Math.max(0, ...accounts.map((a) => a.history.length));
  const history = Array.from({ length }, (_, i) =>
    accounts.reduce((s, a) => s + (a.history[i] ?? a.history.at(-1) ?? 0), 0),
  );
  const names = new Map(accounts.map((a) => [a.key, a.name]));
  return {
    key: totalKey,
    name: "Total",
    maskedIban: `${accounts.length} comptes`,
    currency: accounts[0]?.currency ?? "EUR",
    balance: {
      cents: accounts.reduce((s, a) => s + a.balance.cents, 0),
      date: accounts.map((a) => a.balance.date).sort()[0] ?? "",
      type: "total",
    },
    history,
    transactions: accounts
      .flatMap((a) =>
        a.transactions.map((t) => ({ ...t, account: names.get(a.key) })),
      )
      .sort((x, y) => y.date.localeCompare(x.date)),
    occurrences: accounts
      .flatMap((a) => a.occurrences)
      .sort((x, y) => x.expected.localeCompare(y.expected)),
    projection: sumProjections(accounts.map((a) => a.projection)),
  };
}
