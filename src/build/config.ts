import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Évalué à l'import : les tests fixent IB_DATA_DIR et CONNECT_BANK_DIR avant de charger ce module.
const envFile = resolve(".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const dataDir =
  env("IB_DATA_DIR") ?? join(process.env.APPDATA ?? homedir(), "info-bank");
const connectBankDir = resolve(env("CONNECT_BANK_DIR") ?? "../connect-bank");

export const config = {
  dataDir,
  rulesFile: join(dataDir, "rules.json"),
  cryptoFile: join(dataDir, "crypto.json"),
  logsDir: join(dataDir, "logs"),
  connectBankOut: join(connectBankDir, "out"),
  publicDir: resolve("public"),
  distDir: resolve("dist"),
  dataFileName: "data.enc",
  passphrase: env("IB_PASSPHRASE"),
  syncError: env("IB_SYNC_ERROR"),
  deploy: {
    remote: env("DEPLOY_REMOTE"),
    branch: env("DEPLOY_BRANCH") ?? "gh-pages",
  },
};

export const minPassphraseLength = 16;

export function requirePassphrase(): string {
  const p = config.passphrase;
  if (!p)
    throw new Error(
      "IB_PASSPHRASE manquant : renseignez-le dans .env (voir .env.example).",
    );
  if ([...p].length < minPassphraseLength)
    throw new Error(
      `IB_PASSPHRASE trop courte : ${minPassphraseLength} caractères minimum (les données chiffrées sont publiques).`,
    );
  return p;
}
