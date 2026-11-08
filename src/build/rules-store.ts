import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { type KdfParams, newKdfParams } from "../core/crypto.ts";
import { emptyRulesFile, validateRulesFile } from "../core/rules.ts";
import type { RulesFile } from "../core/types.ts";
import { config } from "./config.ts";

/** Écriture atomique : fichier temporaire puis renommage (pas de fichier tronqué en cas d'arrêt). */
function writeAtomic(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, file);
}

export function loadRules(file = config.rulesFile): RulesFile {
  if (!existsSync(file)) return emptyRulesFile();
  return validateRulesFile(JSON.parse(readFileSync(file, "utf8")));
}

export function saveRules(rules: RulesFile, file = config.rulesFile): void {
  writeAtomic(file, `${JSON.stringify(validateRulesFile(rules), null, 2)}\n`);
}

/**
 * Paramètres de dérivation de clé, stables d'un build à l'autre pour que la clé mémorisée
 * sur le téléphone reste valide. Supprimer le fichier pour changer de sel (rotation).
 */
export function loadKdfParams(file = config.cryptoFile): KdfParams {
  if (existsSync(file))
    return JSON.parse(readFileSync(file, "utf8")) as KdfParams;
  const params = newKdfParams();
  writeAtomic(file, `${JSON.stringify(params, null, 2)}\n`);
  return params;
}
