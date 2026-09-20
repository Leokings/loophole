import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";

import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://loophole-zeta.vercel.app"),
  title: {
    default: "Loophole — Autonomous Republic",
    template: "%s · Loophole",
  },
  description: "A persistent political strategy world where GenLayer consensus AI fills every empty faction seat.",
  openGraph: {
    description: "Take a faction, bend the law, and let consensus AI keep every empty seat alive.",
    images: [{ alt: "The autonomous republic chamber", height: 813, url: "/art/republic-chamber.webp", width: 1920 }],
    title: "Loophole — Autonomous Republic",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description: "A persistent political strategy world governed by players and GenLayer consensus AI.",
    images: ["/art/republic-chamber.webp"],
    title: "Loophole — Autonomous Republic",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07110f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${sans.variable} ${serif.variable}`} lang="en">
      <body>{children}</body>
    </html>
  );
}
