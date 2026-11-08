import type { BackofficeData } from "../build/backoffice-api.ts";
import type { RulesFile } from "../core/types.ts";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
  return body;
}

export const fetchData = (): Promise<BackofficeData> => call("/data");

export const putRules = (rules: RulesFile): Promise<RulesFile> =>
  call("/rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rules),
  });

/** « 12,50 » ou « 12.5 » → centimes ; `undefined` si illisible. */
export function parseEuros(text: string): number | undefined {
  const clean = text.replace(/\s/g, "").replace(",", ".").replace(/^-/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return undefined;
  const [units, decimals = ""] = clean.split(".");
  return Number(units) * 100 + Number(decimals.padEnd(2, "0"));
}

/** Centimes → « 12,50 » pour un champ de saisie. */
export const eurosText = (cents: number | undefined): string =>
  cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ",");
