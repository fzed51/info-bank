import { useState } from "preact/hooks";
import { VersionFooter } from "./version-footer.tsx";

interface Props {
  error?: string;
  onUnlock: (passphrase: string, remember: boolean) => Promise<void>;
}

export function Unlock({ error, onUnlock }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!passphrase || busy) return;
    setBusy(true);
    await onUnlock(passphrase, remember);
    setBusy(false);
  };

  return (
    <main class="center unlock">
      <h1 class="display">Comptes</h1>
      <p class="muted">Saisissez votre clé de connexion.</p>
      <form class="stack" onSubmit={submit}>
        <label class="field">
          <span class="field-label">Clé de connexion</span>
          <input
            class="input"
            type="password"
            autocomplete="current-password"
            autocapitalize="off"
            spellcheck={false}
            value={passphrase}
            onInput={(e) => setPassphrase(e.currentTarget.value)}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "unlock-error" : undefined}
            required
          />
        </label>
        {error && (
          <p id="unlock-error" class="error" role="alert">
            {error}
          </p>
        )}
        <label class="check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.currentTarget.checked)}
          />
          <span>Mémoriser sur cet appareil</span>
        </label>
        <button class="button primary" type="submit" disabled={busy}>
          {busy ? "Déchiffrement…" : "Ouvrir"}
        </button>
      </form>
      <VersionFooter />
    </main>
  );
}
