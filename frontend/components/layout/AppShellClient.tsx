"use client";
import "./AppShell.css";

import Link from "next/link";
import Image from "next/image";
import { X } from "lucide-react";
import { formatIndex, indexColorBand } from "@/lib/esbeu-form";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { endSession, isAuthenticated, logoutUser, sessionAccountKey, SESSION_TIMEOUT_MINUTES } from "@/lib/burnout-api";
import { BurnoutStoreProvider, useBurnoutStore } from "@/hooks/useBurnoutStore";
import type { ReactNode } from "react";
import { AppToast } from "@/components/ui/AppToast";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { IndexHelp } from "@/components/indicators/IndexHelp";
import { clearSessionDrafts } from "@/lib/session-draft";

type SidebarProps = { store: ReturnType<typeof useBurnoutStore>; pathname: string; className?: string; onLogout: () => Promise<void>; onNavigate?: () => void };

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "bar-chart-3" },
  { href: "/registro", label: "Novo registro", icon: "file-plus-2" },
  { href: "/historico", label: "Histórico", icon: "clock-3" },
  { href: "/perfil", label: "Perfil", icon: "user-round" },
  { href: "/como-funciona", label: "Como funciona", icon: "info" }
];

export function AppShellClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authRoute = pathname === "/login" || pathname === "/cadastro";
  const [authState, setAuthState] = useState("checking");
  const [accountKey, setAccountKey] = useState("anonymous");
  const previousAccount = useRef("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const loggedIn = authState === "authenticated";

  useEffect(() => {
    function refreshAuthState() {
      const key = sessionAccountKey();
      if (!isAuthenticated() || previousAccount.current && previousAccount.current !== key) clearSessionDrafts();
      previousAccount.current = key;
      setAccountKey(key);
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
    function handleSessionEnded(event: Event) {
      if (!(event instanceof CustomEvent)) return;
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

    let timeoutId: number | undefined;

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
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => { if (desktop.matches) setIsMobileMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

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
    <BurnoutStoreProvider key={accountKey}><div className="app-shell">
      <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
      <AppToast />
      <SessionNotice message={sessionNotice} />
      <MobileHeader isOpen={isMobileMenuOpen} onToggle={() => setIsMobileMenuOpen((current) => !current)} />
      <Sidebars pathname={pathname} onLogout={handleLogout} isMobileMenuOpen={isMobileMenuOpen} onNavigate={() => setIsMobileMenuOpen(false)} />
      <main className="main" id="main-content" tabIndex={-1}>{children}</main>
    </div></BurnoutStoreProvider>
  );
}

function MobileHeader({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  return (
    <header className="mobile-header">
      <Link className="mobile-brand" href="/dashboard" aria-label="Ir para o dashboard">
        <span className="mobile-brand-mark">
          <Image className="brand-logo" src="/imgs/logo-BurnoutSense.svg" alt="" width={38} height={38} loading="eager" />
        </span>
        <span>BurnoutSense</span>
      </Link>
      <button className="mobile-menu-button" type="button" aria-label={isOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={isOpen} aria-controls="mobile-menu" onClick={onToggle}>
        <span className={isOpen ? "mobile-menu-icon close" : "mobile-menu-icon"} aria-hidden="true" />
      </button>
    </header>
  );
}

function Sidebars({ pathname, onLogout, onNavigate, isMobileMenuOpen }: Omit<SidebarProps, "store"> & { isMobileMenuOpen: boolean }) {
  const store = useBurnoutStore();
  useEffect(() => {
    if (store.ready) document.documentElement.dataset.theme = store.profile.theme === "dark" ? "dark" : "";
  }, [store.profile.theme, store.ready]);
  return <>
    <Sidebar store={store} pathname={pathname} onLogout={onLogout} />
    <AccessibleDialog open={isMobileMenuOpen} onClose={onNavigate ?? (() => {})} label="Navegação" id="mobile-menu" className="mobile-menu-dialog">
      <button className="mobile-menu-close" type="button" aria-label="Fechar menu" title="Fechar menu" onClick={onNavigate}><X size={20} aria-hidden="true" /></button>
      <Sidebar store={store} className="mobile-sidebar open" pathname={pathname} onLogout={onLogout} onNavigate={onNavigate} />
    </AccessibleDialog>
  </>;
}

function Sidebar({ store, className = "", onLogout, onNavigate, pathname }: SidebarProps) {
  const { profile, latestRecord } = store;
  const initials = profile.name?.trim()?.slice(0, 1)?.toUpperCase() || "E";

  return (
    <aside className={`sidebar ${className}`.trim()}>
      <div>
        <Link className="sidebar-brand" href="/dashboard" aria-label="Ir para o dashboard" onClick={onNavigate}>
          <span className="sidebar-brand-mark">
            <Image className="brand-logo" src="/imgs/logo-BurnoutSense.svg" alt="" width={32} height={32} loading="eager" />
          </span>
          <span className="brand-copy">
            <span className="brand-name">BurnoutSense</span>
            <span className="brand-tagline">Apoio preventivo</span>
          </span>
        </Link>

        <section className="risk-orb tone-neutral" aria-label="Último índice registrado">
          <div className="sidebar-index-meter" data-band={indexColorBand(latestRecord?.estimatedOverall)}>
            <strong>{latestRecord ? formatIndex(latestRecord.estimatedOverall) : "—"}</strong>
          </div>
          <span>{latestRecord ? "Seu último índice" : "Seu primeiro registro"}</span>
          <span>Acompanhe sua rotina</span>
          {latestRecord && <IndexHelp />}
        </section>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} className={`sidebar-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} href={item.href} onClick={onNavigate}>
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

function SidebarIcon({ name }: { name: string }) {
  if (name === "info") return <span className="sidebar-help-icon" aria-hidden="true">?</span>;
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

function SessionNotice({ message }: { message: string }) {
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
