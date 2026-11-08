import { useState } from "preact/hooks";
import type { BackofficeData } from "../../build/backoffice-api.ts";
import { sortByAccountOrder } from "../../core/rules.ts";
import type { RulesFile } from "../../core/types.ts";

interface Props {
  data: BackofficeData;
  onSave: (rules: RulesFile) => void;
}

export function AccountsPanel({ data, onSave }: Props) {
  const [names, setNames] = useState<Record<string, string>>(
    data.rules.accountNames,
  );
  const [hidden, setHidden] = useState(
    () => new Set(data.rules.hiddenAccounts ?? []),
  );
  const [order, setOrder] = useState(() =>
    sortByAccountOrder(
      data.accounts,
      (a) => a.account,
      data.rules.accountOrder,
    ).map((a) => a.account),
  );
  const byId = new Map(data.accounts.map((a) => [a.account, a]));

  const move = (index: number, delta: number) => {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setOrder(next);
  };

  const toggle = (account: string) => {
    const next = new Set(hidden);
    if (next.has(account)) next.delete(account);
    else next.add(account);
    setHidden(next);
  };

  const submit = (event: Event) => {
    event.preventDefault();
    const accountNames = Object.fromEntries(
      Object.entries(names)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v !== ""),
    );
    onSave({
      ...data.rules,
      accountNames,
      hiddenAccounts: order.filter((a) => hidden.has(a)),
      accountOrder: order,
    });
  };

  const visibleCount = order.filter((a) => !hidden.has(a)).length;

  return (
    <form class="card stack" onSubmit={submit}>
      <h2 class="section-title">Comptes affichés dans l'app</h2>
      <p class="muted small">
        Ordre des onglets de l'app (et de ce menu), nom affiché, et visibilité.
        Un compte masqué n'est pas publié : ni onglet, ni « Total ». Pris en
        compte au prochain build et déploiement.
      </p>
      <div class="bo-scroll">
        <table class="bo-table">
          <thead>
            <tr>
              <th>Ordre</th>
              <th>Compte</th>
              <th>Nom affiché</th>
              <th>Visible</th>
            </tr>
          </thead>
          <tbody>
            {order.map((id, i) => {
              const a = byId.get(id);
              if (!a) return null;
              const label = names[id]?.trim() || a.masked;
              const isHidden = hidden.has(id);
              return (
                <tr key={id} class={isHidden ? "inactive" : ""}>
                  <td class="bo-row-actions">
                    <div class="bo-order-buttons">
                      <button
                        type="button"
                        class="button bo-row-button"
                        aria-label={`Monter ${label}`}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        class="button bo-row-button"
                        aria-label={`Descendre ${label}`}
                        disabled={i === order.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                    </div>
                  </td>
                  <td class="figures small">
                    {a.masked}
                    <br />
                    <span class="muted">{a.txCount} opération(s)</span>
                  </td>
                  <td>
                    <input
                      class="input"
                      value={names[id] ?? ""}
                      placeholder={`Compte ${id.slice(-3)}`}
                      aria-label={`Nom affiché pour ${a.masked}`}
                      onInput={(e) =>
                        setNames({ ...names, [id]: e.currentTarget.value })
                      }
                    />
                  </td>
                  <td>
                    <label class="check">
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        aria-label={`Afficher ${label} dans l'app`}
                        onChange={() => toggle(id)}
                      />
                      <span class="small">
                        {isHidden ? "masqué" : "affiché"}
                      </span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visibleCount === 0 && (
        <p class="error small" role="alert">
          Aucun compte affiché : le build de l'app échouera.
        </p>
      )}
      <div class="bo-actions">
        <button type="submit" class="button primary">
          Enregistrer
        </button>
      </div>
    </form>
  );
}
