"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { isAuthenticated, logoutUser } from "@/lib/burnout-api";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "\u2318" },
  { href: "/registro", label: "Novo registro", icon: "+" },
  { href: "/historico", label: "Historico", icon: "\u21ba" },
  { href: "/perfil", label: "Perfil", icon: "\u25ce" }
];

export function AppShellClient({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const authRoute = pathname === "/login" || pathname === "/cadastro";
  const authState = useSyncExternalStore(subscribeToAuthChanges, getAuthSnapshot, getServerAuthSnapshot);
  const loggedIn = authState === "authenticated";

  useEffect(() => {
    if (!loggedIn && !authRoute) {
      router.replace("/login");
    }

    if (loggedIn && authRoute) {
      router.replace("/dashboard");
    }
  }, [authRoute, loggedIn, pathname, router]);

  async function handleLogout() {
    await logoutUser();
    window.dispatchEvent(new Event("burnoutsense-auth-change"));
    router.push("/login");
  }

  if (authState === "checking") {
    return <main className={authRoute ? "auth-main" : "main"} />;
  }

  if (authRoute) {
    return <main className="auth-main">{children}</main>;
  }

  if (!loggedIn) {
    return <main className="main" />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/dashboard" aria-label="Ir para o dashboard">
            <span className="brand-mark">{"\u2661"}</span>
            <span className="brand-copy">
              <span className="brand-name">BurnoutSense</span>
              <span className="brand-tagline">Apoio preventivo ao estudante</span>
            </span>
          </Link>

          <nav className="nav" aria-label="Navegacao principal">
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
            <span aria-hidden="true">{"\u21aa"}</span>
            <span>Sair</span>
          </button>
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}

function getAuthSnapshot() {
  return isAuthenticated() ? "authenticated" : "anonymous";
}

function getServerAuthSnapshot() {
  return "anonymous";
}

function subscribeToAuthChanges(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener("burnoutsense-auth-change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("burnoutsense-auth-change", callback);
  };
}
