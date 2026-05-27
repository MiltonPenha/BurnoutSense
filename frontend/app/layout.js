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
