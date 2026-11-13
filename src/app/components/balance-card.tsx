import { unbudgetedCents } from "../../core/projection.ts";
import type { PayloadAccount } from "../../core/types.ts";
import { formatCents, formatLongDate, formatTimestamp } from "../format.ts";

interface Props {
  account: PayloadAccount;
  generatedAt: string;
}

export function BalanceCard({ account, generatedAt }: Props) {
  const { balance, projection } = account;
  const unbudgeted = unbudgetedCents(projection);
  const count = projection.plannedCount;
  return (
    <section class="card margin-line" aria-labelledby="balance-title">
      <p class="muted small">
        <span id="balance-title">{account.name}</span>
        {" · "}
        <span class="figures">{account.maskedIban}</span>
      </p>
      <p class={balance.cents < 0 ? "balance debit" : "balance"}>
        {formatCents(balance.cents, account.currency)}
      </p>
      <p class="muted small">
        {balance.type === "CLBD" ? "Solde comptable" : "Solde"} au{" "}
        {balance.date ? formatLongDate(balance.date) : "—"}
        {" · mis à jour le "}
        {formatTimestamp(generatedAt)}
      </p>
      <p class="unbudgeted">
        <span class="unbudgeted-label">
          Non budgété
          <span class="muted small">
            {" "}
            (après {count} opération{count > 1 ? "s" : ""} prévue
            {count > 1 ? "s" : ""})
          </span>
        </span>
        <span class="amount">{formatCents(unbudgeted, account.currency)}</span>
      </p>
    </section>
  );
}
