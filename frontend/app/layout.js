import "@/app/globals.css";
import localFont from "next/font/local";
import { AppShell } from "@/components/AppShell";

const geist = localFont({
  src: "./fonts/Geist.woff2",
  variable: "--font-geist"
});

const geistMono = localFont({
  src: "./fonts/GeistMono.woff2",
  variable: "--font-geist-mono"
});

export const metadata = {
  metadataBase: new URL("https://burnoutsense.local"),
  applicationName: "BurnoutSense",
  title: {
    default: "BurnoutSense | Apoio preventivo ao estudante",
    template: "%s | BurnoutSense"
  },
  description:
    "Plataforma web para acompanhamento preventivo de indicadores acadêmicos, emocionais e comportamentais relacionados ao risco de burnout estudantil.",
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
      "Acompanhamento preventivo de rotina acadêmica, bem-estar e risco estimado de burnout estudantil.",
    siteName: "BurnoutSense",
    locale: "pt_BR",
    type: "website"
  }
};

export default function RootLayout({ children }) {
  return (
    <html className={`${geist.variable} ${geistMono.variable}`} lang="pt-BR">
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
