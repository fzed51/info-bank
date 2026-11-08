import { useMemo, useState } from "preact/hooks";
import type { Payload } from "../../core/types.ts";
import { totalAccount } from "../data.ts";
import { formatTimestamp } from "../format.ts";
import { AccountTabs } from "./account-tabs.tsx";
import { BalanceCard } from "./balance-card.tsx";
import { HistoryChart } from "./history-chart.tsx";
import { PlannedList } from "./planned-list.tsx";
import { ProjectionCard } from "./projection-card.tsx";
import { TxList } from "./tx-list.tsx";

const selectedStorage = "info-bank:account";
/** Au-delà, les données sont signalées comme anciennes (la synchro est nocturne). */
const staleHours = 36;

const readSelected = (): string | null => {
  try {
    return localStorage.getItem(selectedStorage);
  } catch {
    return null;
  }
};
const writeSelected = (key: string): void => {
  try {
    localStorage.setItem(selectedStorage, key);
  } catch {
    // Préférence non mémorisée : sans conséquence.
  }
};

interface Props {
  payload: Payload;
  onLock: () => void;
  onRefresh: () => void;
}

export function Dashboard({ payload, onLock, onRefresh }: Props) {
  const total = useMemo(() => totalAccount(payload.accounts), [payload]);
  const views =
    payload.accounts.length > 1
      ? [...payload.accounts, total]
      : payload.accounts;
  const [selected, setSelected] = useState(
    () => readSelected() ?? views[0]?.key,
  );
  const account = views.find((a) => a.key === selected) ?? views[0];

  const select = (key: string) => {
    setSelected(key);
    writeSelected(key);
  };

  const ageHours = (Date.now() - Date.parse(payload.generatedAt)) / 3_600_000;
  const warning = payload.syncError
    ? `Dernière synchro en échec : ${payload.syncError}`
    : ageHours > staleHours
      ? `Données anciennes : mises à jour le ${formatTimestamp(payload.generatedAt)}.`
      : undefined;

  if (!account)
    return (
      <main class="center">
        <p class="muted">Aucun compte dans les données.</p>
      </main>
    );

  return (
    <div class="page">
      <header class="topbar">
        <span class="brand">Comptes</span>
        <div class="topbar-actions">
          <button type="button" class="button ghost" onClick={onRefresh}>
            Actualiser
          </button>
          <button type="button" class="button ghost" onClick={onLock}>
            Verrouiller
          </button>
        </div>
      </header>
      {views.length > 1 && (
        <AccountTabs
          accounts={views}
          selected={account.key}
          onSelect={select}
        />
      )}
      <main class="content stack-lg">
        {warning && (
          <p class="banner" role="status">
            {warning}
          </p>
        )}
        <BalanceCard account={account} generatedAt={payload.generatedAt} />
        <ProjectionCard account={account} />
        <HistoryChart
          history={account.history}
          start={payload.historyStart}
          projection={account.projection}
          occurrences={account.occurrences}
          asOf={payload.asOf}
          currency={account.currency}
        />
        {/* `key` : chaque compte repart de la vue réduite. */}
        <PlannedList
          key={`planned-${account.key}`}
          occurrences={account.occurrences}
          currency={account.currency}
        />
        <TxList
          key={`tx-${account.key}`}
          transactions={account.transactions}
          currency={account.currency}
        />
      </main>
    </div>
  );
}
