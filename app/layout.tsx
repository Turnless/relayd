import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relayd",
  description:
    "Shift-handover safety agent on FalkorDB. Every warning is a graph path back to the exact lines in the nursing notes. Synthetic data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
