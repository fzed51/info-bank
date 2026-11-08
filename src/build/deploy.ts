// Construit la PWA et la publie sur la branche gh-pages : un dépôt git jetable dans dist/,
// un seul commit, push forcé. La branche ne garde donc aucun historique des données chiffrées.
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "vite";
import { config } from "./config.ts";

function git(args: string[], cwd: string): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0)
    throw new Error(
      `git ${args[0]} a échoué : ${(r.stderr || r.stdout).trim()}`,
    );
  return r.stdout.trim();
}

function remoteUrl(): string {
  if (config.deploy.remote) return config.deploy.remote;
  try {
    return git(["remote", "get-url", "origin"], resolve("."));
  } catch {
    throw new Error(
      "Aucun dépôt distant : renseignez DEPLOY_REMOTE dans .env ou ajoutez un remote « origin ».",
    );
  }
}

async function main(): Promise<void> {
  const data = join(config.publicDir, config.dataFileName);
  if (!existsSync(data))
    throw new Error(`${data} absent : lancez d'abord \`npm run build:data\`.`);
  const remote = remoteUrl();

  await build({ configFile: resolve("vite.config.ts"), logLevel: "warn" });
  const dist = config.distDir;
  if (!existsSync(join(dist, config.dataFileName)))
    throw new Error("Le build ne contient pas les données chiffrées.");
  // GitHub Pages : pas de traitement Jekyll (fichiers servis tels quels).
  writeFileSync(join(dist, ".nojekyll"), "");

  const branch = config.deploy.branch;
  // Vite garde dist/.git en vidant dist/ : on repart d'un dépôt neuf, un seul commit.
  rmSync(join(dist, ".git"), { recursive: true, force: true });
  git(["init", "--quiet", "--initial-branch", branch], dist);
  git(["add", "--all"], dist);
  git(
    ["commit", "--quiet", "--message", `deploy: ${new Date().toISOString()}`],
    dist,
  );
  git(["push", "--quiet", "--force", remote, `HEAD:${branch}`], dist);
  console.log(`Publié sur la branche ${branch}.`);
}

main().catch((err: unknown) => {
  console.error(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
