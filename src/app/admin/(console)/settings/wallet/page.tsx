import { SettingsList } from "@/components/settings-list";

export const metadata = { title: "Wallet settings" };

export default function WalletSettingsPage() {
  return (
    <SettingsList
      group="wallet"
      title="Wallet settings"
      note="Withdrawal and bonus-rule values. Bonus-rule changes ask for a reason. Ledger posting is unchanged."
    />
  );
}
