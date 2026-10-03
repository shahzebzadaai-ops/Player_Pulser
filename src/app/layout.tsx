import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { Suspense } from "react";
import { AttributionBeacon } from "@/components/attribution-beacon";
import { AuthOverlay } from "@/components/auth-overlay";
import { authFlags } from "@/domain/auth-flags";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
            <AuthOverlay flags={authFlags()} />
          </Suspense>
        </PriceStreamProvider>
      </body>
    </html>
  );
}
