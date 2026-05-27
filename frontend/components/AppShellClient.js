"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { endSession, isAuthenticated, logoutUser, SESSION_TIMEOUT_MINUTES } from "@/lib/burnout-api";

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
  const [sessionNotice, setSessionNotice] = useState("");
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

  useEffect(() => {
    function handleSessionEnded(event) {
      const reason = event.detail?.reason;
      const message =
        reason === "idle"
          ? `Sua sessao foi encerrada apos ${SESSION_TIMEOUT_MINUTES} minutos de inatividade.`
          : "Sua sessao expirou. Entre novamente para continuar.";

      setSessionNotice(message);
      window.setTimeout(() => setSessionNotice(""), 7000);
    }

    window.addEventListener("burnoutsense-session-ended", handleSessionEnded);

    return () => window.removeEventListener("burnoutsense-session-ended", handleSessionEnded);
  }, []);

  useEffect(() => {
    if (!loggedIn) {
      return undefined;
    }

    let timeoutId;

    function resetIdleTimer() {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        endSession("idle");
        router.replace("/login");
      }, SESSION_TIMEOUT_MINUTES * 60 * 1000);
    }

    const events = ["click", "keydown", "mousemove", "scroll", "touchstart"];

    resetIdleTimer();
    events.forEach((eventName) => window.addEventListener(eventName, resetIdleTimer, { passive: true }));

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((eventName) => window.removeEventListener(eventName, resetIdleTimer));
    };
  }, [loggedIn, router]);

  async function handleLogout() {
    await logoutUser();
    window.dispatchEvent(new Event("burnoutsense-auth-change"));
    router.push("/login");
  }

  if (authState === "checking") {
    return (
      <>
        <SessionNotice message={sessionNotice} />
        <main className={authRoute ? "auth-main" : "main"} />
      </>
    );
  }

  if (authRoute) {
    return (
      <>
        <SessionNotice message={sessionNotice} />
        <main className="auth-main">{children}</main>
      </>
    );
  }

  if (!loggedIn) {
    return (
      <>
        <SessionNotice message={sessionNotice} />
        <main className="main" />
      </>
    );
  }

  return (
    <div className="app-shell">
      <SessionNotice message={sessionNotice} />
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

function SessionNotice({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="toast toast-warning" role="status">
      <strong>Sessao encerrada</strong>
      <span>{message}</span>
    </div>
  );
}
