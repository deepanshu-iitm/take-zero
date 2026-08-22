import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Take Zero — Rehearse reality",
  description: "Photo-grounded world-model rehearsal for physical AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}