import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { headers } from "next/headers";
import { Suspense } from "react";
import { AskBittu } from "@/components/ask-bittu";
import { AttributionBeacon } from "@/components/attribution-beacon";
import { AuthOverlay } from "@/components/auth-overlay";
import { authFlags } from "@/domain/auth-flags";
import { appleSetupMessage, googleSetupMessage } from "@/domain/provider-setup";
import { PwaRegister } from "@/components/chrome";
import { PriceStreamProvider } from "@/components/price-stream";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: { default: "PlayerPulser", template: "%s · PlayerPulser" },
  description: "Trade fictional cricket-player holdings, track a portfolio, and manage a simulated wallet.",
  applicationName: "PlayerPulser",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "PlayerPulser", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#07111f",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3001";
  const origin = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? `http://${host}` : `https://${host}`;
  const flags = authFlags();
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full">
        <PwaRegister />
        <Suspense fallback={null}>
          <AttributionBeacon />
        </Suspense>
        <PriceStreamProvider>
          {children}
          <Suspense fallback={null}>
            <AuthOverlay flags={{ ...flags, googleSetupMessage: googleSetupMessage(process.env, origin), appleSetupMessage: appleSetupMessage(process.env, origin) }} />
          </Suspense>
          <AskBittu />
        </PriceStreamProvider>
      </body>
    </html>
  );
}
