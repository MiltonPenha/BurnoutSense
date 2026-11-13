"use client";
import "./historico.css";

import { useEffect, useRef, useState } from "react";
import { getEsbeuPage } from "@/lib/burnout-api";
import { EsbeuHistoryTable } from "@/components/indicators/EsbeuHistoryTable";
import { DailyHistory } from "./_components/DailyHistory";
import type { Assessment } from "@/lib/types";

const views = [{ id: "daily", label: "Check-ins diários" }, { id: "indices", label: "Índices e rotina" }] as const;
type HistoryView = (typeof views)[number]["id"];

export default function HistoricoPage() {
  const [records, setRecords] = useState<Assessment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const [view, setView] = useState<HistoryView>("daily");
  const tabs = useRef<Partial<Record<HistoryView, HTMLButtonElement>>>({});
  useEffect(() => {
    let active = true;
    const load = () => getEsbeuPage().then((page) => { if (active) { setRecords(page.items); setCursor(page.nextCursor); setError(""); } })
      .catch(() => { if (active) setError("Não foi possível consultar o histórico."); })
      .finally(() => { if (active) setReady(true); });
    load(); window.addEventListener("burnoutsense-esbeu-change", load);
    return () => { active = false; window.removeEventListener("burnoutsense-esbeu-change", load); };
  }, []);
  async function more() {
    if (inFlight.current || !cursor) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const page = await getEsbeuPage(cursor);
      setRecords((previous) => [...new Map([...previous, ...page.items].map((item) => [item.id, item])).values()]);
      setCursor(page.nextCursor);
    } catch { setError("Não foi possível carregar mais avaliações. As avaliações já carregadas continuam disponíveis."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="page esbeu-page"><header className="page-header"><h1 className="page-title">Histórico de registros</h1></header>
    <div className="history-view-tabs" role="tablist" aria-label="Tipo de acompanhamento" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "daily" : event.key === "End" ? "indices" : view === "daily" ? "indices" : "daily";
      setView(next); tabs.current[next]?.focus();
    }}>
      {views.map(({ id, label }) => <button key={id} ref={element => { if (element) tabs.current[id] = element; }} id={`${id}-tab`} role="tab" aria-controls={`${id}-panel`} aria-selected={view === id} tabIndex={view === id ? 0 : -1} type="button" onClick={() => setView(id)}>{label}</button>)}
    </div>
    {view === "daily" ? <div id="daily-panel" role="tabpanel" aria-labelledby="daily-tab"><DailyHistory /></div> : <div id="indices-panel" role="tabpanel" aria-labelledby="indices-tab">
    {!ready && <p role="status">Carregando histórico…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {ready && !error && !records.length && <section className="card empty-state"><h2>Nenhum registro ainda</h2><p>Seus registros aparecerão aqui.</p></section>}
    {records.length > 0 && <section className="card"><EsbeuHistoryTable records={records} /></section>}
    {cursor && <button type="button" className="button secondary" disabled={busy} onClick={more}>{busy ? "Carregando…" : "Carregar mais avaliações"}</button>}
    </div>}
  </section>;
}
