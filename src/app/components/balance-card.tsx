import type { PayloadAccount } from "../../core/types.ts";
import { formatCents, formatLongDate, formatTimestamp } from "../format.ts";

interface Props {
  account: PayloadAccount;
  generatedAt: string;
}

export function BalanceCard({ account, generatedAt }: Props) {
  const { balance } = account;
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
    </section>
  );
}
