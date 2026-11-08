import type { PayloadAccount } from "../../core/types.ts";

interface Props {
  accounts: PayloadAccount[];
  selected: string;
  onSelect: (key: string) => void;
}

export function AccountTabs({ accounts, selected, onSelect }: Props) {
  return (
    <nav class="tabs" aria-label="Comptes">
      {accounts.map((a) => (
        <button
          key={a.key}
          type="button"
          class={a.key === selected ? "tab active" : "tab"}
          aria-current={a.key === selected ? "page" : undefined}
          onClick={() => onSelect(a.key)}
        >
          {a.name}
        </button>
      ))}
    </nav>
  );
}
