"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { endSession, isAuthenticated, logoutUser, SESSION_TIMEOUT_MINUTES } from "@/lib/burnout-api";
import { getRecordRisk } from "@/lib/burnout-data";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "bar-chart-3" },
  { href: "/registro", label: "Novo registro", icon: "file-plus-2" },
  { href: "/historico", label: "Histórico", icon: "clock-3" },
  { href: "/perfil", label: "Perfil", icon: "user-round" }
];

export function AppShellClient({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const authRoute = pathname === "/login" || pathname === "/cadastro";
  const [authState, setAuthState] = useState("checking");
  const [sessionNotice, setSessionNotice] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
          ? `Sua sessão foi encerrada após ${SESSION_TIMEOUT_MINUTES} minutos de inatividade.`
          : "Sua sessão expirou. Entre novamente para continuar.";

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

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  async function handleLogout() {
    setIsMobileMenuOpen(false);
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
      <MobileHeader isOpen={isMobileMenuOpen} onToggle={() => setIsMobileMenuOpen((current) => !current)} />
      <Sidebar pathname={pathname} onLogout={handleLogout} />
      <button
        aria-label="Fechar menu"
        className={`mobile-menu-overlay ${isMobileMenuOpen ? "open" : ""}`}
        type="button"
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <Sidebar
        className={`mobile-sidebar ${isMobileMenuOpen ? "open" : ""}`}
        pathname={pathname}
        onLogout={handleLogout}
        onNavigate={() => setIsMobileMenuOpen(false)}
      />
      <main className="main">{children}</main>
    </div>
  );
}

function MobileHeader({ isOpen, onToggle }) {
  return (
    <header className="mobile-header">
      <Link className="mobile-brand" href="/dashboard" aria-label="Ir para o dashboard">
        <span className="mobile-brand-mark">
          <Image className="brand-logo" src="/imgs/logo-BurnoutSense.svg" alt="" width={38} height={38} />
        </span>
        <span>BurnoutSense</span>
      </Link>
      <button className="mobile-menu-button" type="button" aria-label={isOpen ? "Fechar menu" : "Abrir menu"} onClick={onToggle}>
        <span className={isOpen ? "mobile-menu-icon close" : "mobile-menu-icon"} aria-hidden="true" />
      </button>
    </header>
  );
}

function Sidebar({ className = "", onLogout, onNavigate, pathname }) {
  const { latestRecord, profile, ready } = useBurnoutStore();
  const risk = latestRecord ? getRecordRisk(latestRecord) : null;
  const score = Math.round(risk?.score ?? 0);
  const circumference = 2 * Math.PI * 44;
  const progress = Math.min(1, score / 10);
  const initials = profile.name?.trim()?.slice(0, 1)?.toUpperCase() || "E";

  useEffect(() => {
    if (!ready) {
      return;
    }

    document.documentElement.dataset.theme = profile.theme === "dark" ? "dark" : "";
  }, [profile.theme, ready]);

  return (
    <aside className={`sidebar ${className}`.trim()}>
      <div>
        <Link className="sidebar-brand" href="/dashboard" aria-label="Ir para o dashboard" onClick={onNavigate}>
          <span className="sidebar-brand-mark">
            <Image className="brand-logo" src="/imgs/logo-BurnoutSense.svg" alt="" width={32} height={32} />
          </span>
          <span className="brand-copy">
            <span className="brand-name">BurnoutSense</span>
            <span className="brand-tagline">Apoio preventivo</span>
          </span>
        </Link>

        <section className={`risk-orb tone-${risk?.tone ?? "neutral"}`} aria-label="Resumo do risco atual">
          <div className="risk-orb-graphic">
            <svg viewBox="0 0 104 104" aria-hidden="true">
              <circle className="risk-orb-track" cx="52" cy="52" r="44" />
              <circle
                className="risk-orb-progress"
                cx="52"
                cy="52"
                r="44"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
              />
            </svg>
            <div className="risk-orb-core">
              <strong>{score}</strong>
              <span>risco</span>
            </div>
          </div>
          <strong>{ready && risk ? risk.label : "Sem registro"}</strong>
          <span>{latestRecord ? "Última atualização: hoje" : "Crie seu primeiro registro"}</span>
        </section>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} className={`sidebar-link ${active ? "active" : ""}`} href={item.href} onClick={onNavigate}>
                <SidebarIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-user">
        <span className="avatar">
          {profile.avatarUrl ? <Image className="avatar-image" src={profile.avatarUrl} alt="" width={34} height={34} unoptimized /> : initials}
        </span>
        <span>
          <strong>{profile.name || "Estudante"}</strong>
          <small>{profile.course || "Adicionar curso"}</small>
        </span>
        <button className="sidebar-logout" type="button" onClick={onLogout} aria-label="Sair">
          ↪
        </button>
      </div>
    </aside>
  );
}

function SidebarIcon({ name }) {
  if (name === "bar-chart-3") {
    return (
      <svg aria-hidden="true" className="sidebar-svg-icon" fill="none" focusable="false" viewBox="0 0 24 24">
        <path d="M3 3v18h18" />
        <path d="M8 17V9" />
        <path d="M13 17V5" />
        <path d="M18 17v-4" />
      </svg>
    );
  }

  if (name === "file-plus-2") {
    return (
      <svg aria-hidden="true" className="sidebar-svg-icon" fill="none" focusable="false" viewBox="0 0 24 24">
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
        <path d="M14 2v5h5" />
        <path d="M12 11v6" />
        <path d="M9 14h6" />
      </svg>
    );
  }

  if (name === "clock-3") {
    return (
      <svg aria-hidden="true" className="sidebar-svg-icon" fill="none" focusable="false" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6h5" />
      </svg>
    );
  }

  return <UserRoundIcon />;
}

function UserRoundIcon() {
  return (
    <svg aria-hidden="true" className="sidebar-svg-icon" fill="none" focusable="false" viewBox="0 0 24 24">
      <path d="M18 20a6 6 0 0 0-12 0" />
      <circle cx="12" cy="10" r="4" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function SessionNotice({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="toast toast-warning" role="status" style={{ "--toast-duration": "7s" }}>
      <strong>Sessão encerrada</strong>
      <span>{message}</span>
    </div>
  );
}
