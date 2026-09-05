import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-jakarta" });

export const metadata = {
  title: "Uniserv Experts CRM",
  description: "Internal follow-up and case management CRM",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`bg-slate-100 ${jakarta.variable}`}>{children}</body>
    </html>
  );
}
