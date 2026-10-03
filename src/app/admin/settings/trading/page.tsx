import { SettingsList } from "@/components/settings-list";
import { ShowcaseHistoryControls } from "@/components/showcase-controls";

export const metadata = { title: "Trading settings" };

export default function TradingSettingsPage() {
  return (
    <>
      <SettingsList
        group="trading"
        title="Trading settings"
        note="Market mode is pricing.marketMode: SHOWCASE or EVENT_DRIVEN. SHOWCASE replaces the old random simulation and still writes PriceTicks. EVENT_DRIVEN uses cricket events and ignores showcase targets, personalities, and generated history. pricing.simulationCycleMs is the showcase cycle in milliseconds, clamped between 3000 and 5000. pricing.showcaseRangeTarget and pricing.showcaseVolatility tune the range controller. Saving asks for a reason. The event-driven pricing formula is unchanged."
      />
      <ShowcaseHistoryControls />
    </>
  );
}
