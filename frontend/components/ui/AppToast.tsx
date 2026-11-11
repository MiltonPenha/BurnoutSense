"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AppNotice } from "@/lib/toast";
import "./AppToast.css";

export function AppToast() {
  const [notice, setNotice] = useState<(AppNotice & { id: number }) | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const show = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      window.clearTimeout(timer);
      setNotice({ ...event.detail, id: Date.now() });
      timer = window.setTimeout(() => setNotice(null), 5000);
    };
    window.addEventListener("burnoutsense-toast", show);
    return () => { window.clearTimeout(timer); window.removeEventListener("burnoutsense-toast", show); };
  }, []);
  return notice && <div key={notice.id} className={`toast app-notice toast-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} style={{ "--toast-duration": "5s" }}>
    <strong>{notice.title}</strong><span>{notice.message}</span>
    <button type="button" aria-label="Fechar notificação" title="Fechar notificação" onClick={() => setNotice(null)}><X size={16} aria-hidden="true" /></button>
  </div>;
}
