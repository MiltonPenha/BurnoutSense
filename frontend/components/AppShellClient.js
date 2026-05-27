"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAuthenticated, logoutUser } from "@/lib/burnout-api";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "\u2318" },
  { href: "/registro", label: "Novo registro", icon: "+" },
  { href: "/historico", label: "Historico de registros", icon: "\u21ba" },
  { href: "/perfil", label: "Perfil", icon: "\u25ce" }
];

export function AppShellClient({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const authRoute = pathname === "/login" || pathname === "/cadastro";
  const [authState, setAuthState] = useState("checking");
  const loggedIn = authState === "authenticated";

  useEffect(() => {
    function refreshAuthState() {
      setAuthState(isAuthenticated() ? "authenticated" : "anonymous");
    }

    refreshAuthState();
    window.addEventListener("storage", refreshAuthState);
    window.addEventListener("burnoutsense-auth-change", refreshAuthState);

    return () => {
      window.removeEventListener("storage", refreshAuthState);
      window.removeEventListener("burnoutsense-auth-change", refreshAuthState);
    };
  }, []);

  useEffect(() => {
    if (authState === "checking") {
      return;
    }

    if (!loggedIn && !authRoute) {
      router.replace("/login");
    }

    if (loggedIn && authRoute) {
      router.replace("/dashboard");
    }
  }, [authRoute, authState, loggedIn, pathname, router]);

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
            <span className="brand-mark">
              <Image className="brand-logo" src="/imgs/logo-BurnoutSense.svg" alt="" width={34} height={34} />
            </span>
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
