import { appVersion } from "../version.ts";

/** Version du build, en bas de page : permet de savoir quelle version tourne sur le téléphone. */
export function VersionFooter() {
  return <footer class="version">info-bank {appVersion}</footer>;
}
