import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "Tamis", template: "%s · Tamis" },
  description: "Le copilote du Product Owner : des retours clients au backlog priorisé, avec une preuve derrière chaque chiffre.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${schibsted.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
