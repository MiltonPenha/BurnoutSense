import "@/app/globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist"
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono"
});

export const metadata = {
  title: "BurnoutSense",
  description: "Apoio preventivo ao estudante"
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
