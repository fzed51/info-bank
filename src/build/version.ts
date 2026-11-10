// Version affichée en bas de l'app : numéro de package.json et commit git du build.
// Pas de date de build : le service worker dérive sa version du contenu du build, et une
// date le ferait changer à chaque publication nocturne.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** « v0.1.0 · 94f74e1 » ; « + » après le commit si l'arbre de travail a des modifications. */
export function formatVersion(
  version: string,
  commit?: string,
  dirty = false,
): string {
  return `v${version}${commit ? ` · ${commit}${dirty ? "+" : ""}` : ""}`;
}

function git(args: string[]): string | undefined {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

/** Version du build en cours ; sans git, seulement le numéro du package. */
export function readAppVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
    version: string;
  };
  const commit = git(["rev-parse", "--short", "HEAD"]) || undefined;
  const dirty = commit !== undefined && !!git(["status", "--porcelain"]);
  return formatVersion(pkg.version, commit, dirty);
}
