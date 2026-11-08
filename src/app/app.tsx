import { useCallback, useEffect, useState } from "preact/hooks";
import {
  deriveKey,
  type EncryptedFile,
  WrongKeyError,
} from "../core/crypto.ts";
import type { Payload } from "../core/types.ts";
import { Dashboard } from "./components/dashboard.tsx";
import { Unlock } from "./components/unlock.tsx";
import {
  DataUnavailableError,
  decryptPayload,
  fetchEncrypted,
} from "./data.ts";
import { clearKey, loadKey, saveKey } from "./key-store.ts";

type State =
  | { step: "loading" }
  | { step: "error"; message: string }
  | { step: "locked"; file: EncryptedFile; error?: string }
  | { step: "ready"; payload: Payload };

const message = (err: unknown): string =>
  err instanceof DataUnavailableError || err instanceof WrongKeyError
    ? err.message
    : "Erreur inattendue pendant le chargement.";

export function App() {
  const [state, setState] = useState<State>({ step: "loading" });

  const load = useCallback(async () => {
    setState({ step: "loading" });
    let file: EncryptedFile;
    try {
      file = await fetchEncrypted();
    } catch (err) {
      setState({ step: "error", message: message(err) });
      return;
    }
    const stored = await loadKey();
    if (stored && stored.salt === file.kdf.salt) {
      try {
        setState({
          step: "ready",
          payload: await decryptPayload(file, stored.key),
        });
        return;
      } catch (err) {
        if (!(err instanceof WrongKeyError)) {
          setState({ step: "error", message: message(err) });
          return;
        }
      }
    }
    // Clé absente, ou devenue invalide (phrase ou sel changés) : nouvelle saisie.
    if (stored) await clearKey();
    setState({ step: "locked", file });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unlock = async (passphrase: string, remember: boolean) => {
    if (state.step !== "locked") return;
    const { file } = state;
    try {
      const key = await deriveKey(passphrase, file.kdf);
      const payload = await decryptPayload(file, key);
      if (remember) await saveKey({ key, salt: file.kdf.salt });
      setState({ step: "ready", payload });
    } catch (err) {
      setState({ step: "locked", file, error: message(err) });
    }
  };

  const lock = async () => {
    await clearKey();
    await load();
  };

  switch (state.step) {
    case "loading":
      return (
        <main class="center" aria-busy="true">
          <p class="muted">Chargement…</p>
        </main>
      );
    case "error":
      return (
        <main class="center">
          <h1 class="display">Comptes</h1>
          <p class="error" role="alert">
            {state.message}
          </p>
          <button type="button" class="button" onClick={() => void load()}>
            Réessayer
          </button>
        </main>
      );
    case "locked":
      return <Unlock error={state.error} onUnlock={unlock} />;
    case "ready":
      return (
        <Dashboard
          payload={state.payload}
          onLock={() => void lock()}
          onRefresh={() => void load()}
        />
      );
  }
}
