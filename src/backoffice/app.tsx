import { useEffect, useState } from "preact/hooks";
import type { BackofficeData } from "../build/backoffice-api.ts";
import { sortByAccountOrder } from "../core/rules.ts";
import type { RecurringRule, RulesFile } from "../core/types.ts";
import { fetchData, putRules } from "./api-client.ts";
import { AccountsPanel } from "./components/accounts-panel.tsx";
import { RuleEditor } from "./components/rule-editor.tsx";
import { RulesList } from "./components/rules-list.tsx";
import { SpendingPanel } from "./components/spending-panel.tsx";
import { SuggestionsPanel } from "./components/suggestions-panel.tsx";
import { TrackingPanel } from "./components/tracking-panel.tsx";

type Tab = "suivi" | "depenses" | "regles" | "suggestions" | "comptes";
const tabs: [Tab, string][] = [
  ["suivi", "Suivi"],
  ["depenses", "Dépenses"],
  ["regles", "Règles"],
  ["suggestions", "Suggestions"],
  ["comptes", "Comptes"],
];

export function App() {
  const [data, setData] = useState<BackofficeData>();
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>("suivi");
  const [account, setAccount] = useState<string>("");
  const [editing, setEditing] = useState<RecurringRule>();
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      const d = await fetchData();
      setData(d);
      setAccount(
        (a) =>
          a ||
          d.accounts.find((x) => x.txCount > 0)?.account ||
          d.accounts[0]?.account ||
          "",
      );
      setError(undefined);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  /** Enregistre immédiatement chaque modification (fichier validé côté serveur). */
  const save = async (rules: RulesFile): Promise<boolean> => {
    if (!data) return false;
    setSaving(true);
    try {
      const saved = await putRules(rules);
      setData({ ...data, rules: saved });
      setError(undefined);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async (rule: RecurringRule) => {
    if (!data) return;
    const exists = data.rules.rules.some((r) => r.id === rule.id);
    const rules = exists
      ? data.rules.rules.map((r) => (r.id === rule.id ? rule : r))
      : [...data.rules.rules, rule];
    if (await save({ ...data.rules, rules })) setEditing(undefined);
  };

  const deleteRule = (id: string) => {
    if (!data) return;
    void save({
      ...data.rules,
      rules: data.rules.rules.filter((r) => r.id !== id),
      links: data.rules.links.filter((l) => l.ruleId !== id),
    });
  };

  if (!data)
    return (
      <main class="bo-page">
        <h1 class="display">Backoffice</h1>
        <p class={error ? "error" : "muted"}>{error ?? "Chargement…"}</p>
      </main>
    );

  const names = data.rules.accountNames;
  const hidden = new Set(data.rules.hiddenAccounts ?? []);
  return (
    <main class="bo-page stack-lg">
      <header class="bo-header">
        <h1 class="display">Backoffice</h1>
        <label class="field bo-account">
          <span class="field-label">Compte</span>
          <select
            class="select"
            value={account}
            onChange={(e) => setAccount(e.currentTarget.value)}
          >
            {sortByAccountOrder(
              data.accounts,
              (a) => a.account,
              data.rules.accountOrder,
            ).map((a) => (
              <option key={a.account} value={a.account}>
                {names[a.account] ?? a.masked} ({a.txCount} op.)
                {hidden.has(a.account) ? " — masqué dans l'app" : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="button" class="button" onClick={() => void reload()}>
          Recharger les données
        </button>
      </header>

      {error && (
        <p class="banner" role="alert">
          {error}
        </p>
      )}
      {saving && <p class="muted small">Enregistrement…</p>}

      {editing ? (
        <RuleEditor
          rule={editing}
          existing={data.rules.rules.some((r) => r.id === editing.id)}
          txs={data.txs}
          today={data.today}
          onSave={(r) => void saveRule(r)}
          onCancel={() => setEditing(undefined)}
        />
      ) : (
        <>
          <nav class="tabs bo-tabs" aria-label="Sections">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                class={id === tab ? "tab active" : "tab"}
                aria-current={id === tab ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "suivi" && (
            <TrackingPanel
              account={account}
              data={data}
              onSave={(r) => void save(r)}
            />
          )}
          {tab === "depenses" && (
            <SpendingPanel account={account} data={data} />
          )}
          {tab === "regles" && (
            <RulesList
              account={account}
              rules={data.rules.rules}
              txs={data.txs}
              onEdit={setEditing}
              onDelete={deleteRule}
              onToggle={(r) => void saveRule({ ...r, active: !r.active })}
            />
          )}
          {tab === "suggestions" && (
            <SuggestionsPanel
              account={account}
              data={data}
              onCreate={setEditing}
            />
          )}
          {tab === "comptes" && (
            <AccountsPanel data={data} onSave={(r) => void save(r)} />
          )}
        </>
      )}
    </main>
  );
}
