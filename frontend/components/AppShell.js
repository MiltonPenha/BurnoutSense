"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutUser } from "@/lib/burnout-api";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "⌘" },
  { href: "/registro", label: "Novo registro", icon: "+" },
  { href: "/historico", label: "Histórico", icon: "↺" },
  { href: "/perfil", label: "Perfil", icon: "◎" }
];

export function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const authRoute = pathname === "/login" || pathname === "/cadastro";

  async function handleLogout() {
    await logoutUser();
    router.push("/login");
  }

  if (authRoute) {
    return <main className="auth-main">{children}</main>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/dashboard" aria-label="Ir para o dashboard">
            <span className="brand-mark">♡</span>
            <span className="brand-copy">
              <span className="brand-name">BurnoutSense</span>
              <span className="brand-tagline">Apoio preventivo ao estudante</span>
            </span>
          </Link>

          <nav className="nav" aria-label="Navegação principal">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} className={`nav-link ${active ? "active" : ""}`} href={item.href}>
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <button className="logout-link" type="button" onClick={handleLogout}>
            <span aria-hidden="true">↪</span>
            <span>Sair</span>
          </button>
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}
