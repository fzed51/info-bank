// Traitement journalier : données de connect-bank + règles → public/data.enc (chiffré).
// N'affiche que des compteurs : aucune donnée bancaire dans la sortie.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deriveKey, encryptJson } from "../core/crypto.ts";
import { localToday } from "../core/dates.ts";
import { buildPayload } from "../core/payload.ts";
import { config, requirePassphrase } from "./config.ts";
import { loadKdfParams, loadRules } from "./rules-store.ts";
import { loadSources } from "./source.ts";

async function main(): Promise<void> {
  const passphrase = requirePassphrase();
  const sources = loadSources(config.connectBankOut);
  const rules = loadRules();
  const { payload, stats } = buildPayload(
    sources,
    rules,
    localToday(),
    new Date().toISOString(),
    config.syncError,
  );
  if (payload.accounts.length === 0)
    throw new Error(
      stats.hidden > 0 && stats.hidden === sources.length
        ? "Tous les comptes sont masqués : affichez-en au moins un dans le backoffice (onglet « Comptes »)."
        : "Aucun compte avec un solde : lancez d'abord `fetch` dans connect-bank.",
    );

  const kdf = loadKdfParams();
  const encrypted = await encryptJson(
    payload,
    await deriveKey(passphrase, kdf),
    kdf,
  );
  mkdirSync(config.publicDir, { recursive: true });
  const file = join(config.publicDir, config.dataFileName);
  writeFileSync(file, JSON.stringify(encrypted), "utf8");

  console.log(
    `Données au ${payload.asOf} : ${stats.accounts} compte(s)${stats.hidden ? ` (+ ${stats.hidden} masqué(s))` : ""}, ${stats.transactions} opération(s) publiées, ${stats.occurrences} opération(s) prévue(s) ce mois-ci, ${rules.rules.length} règle(s).`,
  );
  for (const [account, gap] of Object.entries(stats.bookedGaps))
    if (gap !== 0)
      console.warn(
        `  ${account} : écart de ${(gap / 100).toFixed(2)} avec le solde comptable (opérations manquantes ?)`,
      );
  for (const account of stats.skipped)
    console.warn(`  ${account} : ignoré, aucun solde relevé`);
  if (payload.syncError)
    console.warn(`  Synchro signalée en échec : ${payload.syncError}`);
  console.log(`→ ${file}`);
}

main().catch((err: unknown) => {
  console.error(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
