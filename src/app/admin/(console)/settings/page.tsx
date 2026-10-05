import { SettingsList } from "@/components/settings-list";

export const metadata = { title: "Admin settings" };

export default function AdminSettingsPage() {
  return (
    <SettingsList
      group="all"
      title="General settings"
      note="Spread and bonus-rule changes ask for a reason. Feature switches live under Operations."
    />
  );
}
