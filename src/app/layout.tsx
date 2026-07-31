import type { Metadata } from "next";
import "./globals.css";
import { TabNav } from "@/components/TabNav";

export const metadata: Metadata = {
  title: "Shared-Truth Ledger — Ludo Junction",
  description:
    "What the team currently believes, and where it disagrees with itself.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TabNav />
        {children}
      </body>
    </html>
  );
}
