import "@/app/globals.css";
import "@/components/ui/primitives.css";
import "@/app/product.css";
import localFont from "next/font/local";
import { AppShell } from "@/components/layout/AppShell";
import type { Metadata } from "next";
import type { ReactNode } from "react";

const geist = localFont({
  src: "./fonts/Geist.woff2",
  variable: "--font-geist"
});

const geistMono = localFont({
  src: "./fonts/GeistMono.woff2",
  variable: "--font-geist-mono"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://burnoutsense.local"),
  applicationName: "BurnoutSense",
  title: {
    default: "BurnoutSense | Apoio preventivo ao estudante",
    template: "%s | BurnoutSense"
  },
  description:
    "Plataforma acadêmica para acompanhamento do escore contínuo ESB-eu e do contexto estudantil.",
  keywords: [
    "BurnoutSense",
    "burnout acadêmico",
    "saúde mental estudantil",
    "inteligência artificial",
    "aprendizado de máquina",
    "TCC"
  ],
  authors: [{ name: "Equipe BurnoutSense" }],
  creator: "Equipe BurnoutSense",
  icons: {
    icon: [{ url: "/imgs/logo-BurnoutSense.svg", type: "image/svg+xml" }],
    shortcut: "/imgs/logo-BurnoutSense.svg",
    apple: "/imgs/logo-BurnoutSense.svg"
  },
  openGraph: {
    title: "BurnoutSense",
    description:
      "Acompanhamento de rotina acadêmica e escore contínuo ESB-eu de 0 a 4.",
    siteName: "BurnoutSense",
    locale: "pt_BR",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`${geist.variable} ${geistMono.variable}`} lang="pt-BR">
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
