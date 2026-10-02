import { SettingsList } from "@/components/settings-list";

export const metadata = { title: "Trading settings" };

export default function TradingSettingsPage() {
  return (
    <SettingsList
      group="trading"
      title="Trading settings"
      note="These are the existing quote, spread, and simulation settings. pricing.simulationCycleMs is the simulation market cycle in milliseconds, clamped between 3000 and 5000. Saving a spread asks for a reason. The pricing formula is unchanged."
    />
  );
}
