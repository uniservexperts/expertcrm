import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "Uniserv Experts CRM",
  description: "Internal follow-up and case management CRM",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Uniserv CRM",
  },
};

export const viewport: Viewport = {
  themeColor: "#152238",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`bg-slate-100 ${jakarta.variable}`}>{children}</body>
    </html>
  );
}
