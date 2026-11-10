// `injectedAppVersion` est injecté par Vite au build (`define` de vite.config.ts) ;
// absent hors Vite (tests).
declare const injectedAppVersion: string | undefined;

export const appVersion: string =
  typeof injectedAppVersion === "string" ? injectedAppVersion : "dev";
