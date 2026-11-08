// API du backoffice, branchée sur le serveur de dev Vite (127.0.0.1 uniquement).
// Lit les données en clair de connect-bank et lit/écrit les règles dans IB_DATA_DIR.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { localToday } from "../core/dates.ts";
import { maskIban } from "../core/payload.ts";
import type { RulesFile, Tx } from "../core/types.ts";
import { config } from "./config.ts";
import { loadRules, saveRules } from "./rules-store.ts";
import { loadSources } from "./source.ts";

export interface BackofficeAccount {
  account: string;
  masked: string;
  currency: string;
  txCount: number;
}

export interface BackofficeData {
  today: string;
  accounts: BackofficeAccount[];
  txs: Tx[];
  rules: RulesFile;
}

const maxBody = 1_000_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBody) {
        reject(new Error("Requête trop volumineuse."));
        req.destroy();
      } else parts.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * Protège l'API locale contre les pages web ouvertes dans le navigateur : hôte local exigé
 * (contre le DNS rebinding) et, pour les écritures, même origine et corps JSON (contre le CSRF).
 */
function allowed(req: IncomingMessage): boolean {
  const host = req.headers.host ?? "";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return false;
  if (req.method === "GET") return true;
  const origin = req.headers.origin;
  return (
    origin === `http://${host}` &&
    (req.headers["content-type"] ?? "").startsWith("application/json")
  );
}

export function loadBackofficeData(): BackofficeData {
  const sources = loadSources(config.connectBankOut);
  return {
    today: localToday(),
    accounts: sources.map((s) => ({
      account: s.account,
      masked: maskIban(s.account),
      currency: s.currency,
      txCount: s.txs.length,
    })),
    txs: sources.flatMap((s) => s.txs),
    rules: loadRules(),
  };
}

export function backofficeApi(): Plugin {
  return {
    name: "info-bank-backoffice-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res) => {
        if (!allowed(req)) return send(res, 403, { error: "Accès refusé." });
        try {
          if (req.method === "GET" && req.url === "/data")
            return send(res, 200, loadBackofficeData());
          if (req.method === "PUT" && req.url === "/rules") {
            const rules = JSON.parse(await readBody(req)) as RulesFile;
            saveRules(rules);
            return send(res, 200, loadRules());
          }
          send(res, 404, { error: "Route inconnue." });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    },
  };
}
