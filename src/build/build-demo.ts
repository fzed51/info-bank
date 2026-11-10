// Version de démonstration : données fictives chiffrées avec une clé publique, dans dist-demo/.
// Ne lit ni .env, ni connect-bank, ni %APPDATA% : rien de personnel ne peut s'y retrouver.
// Hébergement : n'importe quel serveur statique ; sert aussi à `npm run preview:demo`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "vite";
import {
  decryptJson,
  deriveKey,
  type EncryptedFile,
  encryptJson,
  pbkdf2Iterations,
} from "../core/crypto.ts";
import { localToday } from "../core/dates.ts";
import { buildPayload } from "../core/payload.ts";
import { validateRulesFile } from "../core/rules.ts";
import {
  demoPassphrase,
  demoRules,
  demoSalt,
  demoSources,
} from "./demo-data.ts";
import { readAppVersion } from "./version.ts";

async function main(): Promise<void> {
  const today = localToday();
  const { payload, stats } = buildPayload(
    demoSources(today),
    validateRulesFile(demoRules()),
    today,
    new Date().toISOString(),
  );
  payload.demo = true;

  const kdf = {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: pbkdf2Iterations,
    salt: demoSalt,
  } as const;
  const key = await deriveKey(demoPassphrase, kdf);
  const encrypted = await encryptJson(payload, key, kdf);

  const dist = resolve("dist-demo");
  await build({
    configFile: resolve("vite.config.ts"),
    logLevel: "warn",
    // Le build copie public/ (dont le data.enc réel, chiffré) : il est écrasé juste après.
    build: { outDir: dist, emptyOutDir: true },
    define: {
      injectedAppVersion: JSON.stringify(`${readAppVersion()} · démo`),
    },
  });
  mkdirSync(dist, { recursive: true });
  const file = join(dist, "data.enc");
  writeFileSync(file, JSON.stringify(encrypted), "utf8");
  writeFileSync(join(dist, ".nojekyll"), "");

  // Contrôle : le fichier publié se déchiffre avec la clé de démo et porte le drapeau « demo ».
  const back = (await decryptJson(
    JSON.parse(readFileSync(file, "utf8")) as EncryptedFile,
    key,
  )) as { demo?: boolean; accounts: unknown[] };
  if (back.demo !== true)
    throw new Error("Le data.enc de la démo n'est pas marqué « demo ».");

  console.log(
    `Démo prête : ${stats.accounts} compte(s), ${stats.transactions} opération(s) fictives, ${stats.occurrences} opération(s) prévue(s) ce mois-ci.`,
  );
  console.log(`→ ${dist}`);
  console.log(`Clé de connexion : ${demoPassphrase}`);
}

main().catch((err: unknown) => {
  console.error(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
