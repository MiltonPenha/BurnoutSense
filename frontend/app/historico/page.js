"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getEsbeuPage } from "@/lib/burnout-api";
import { EsbeuHistoryTable } from "@/components/EsbeuHistoryTable";

export default function HistoricoPage() {
  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    getEsbeuPage().then((page) => { if (active) { setRecords(page.items); setCursor(page.nextCursor); } })
      .catch(() => { if (active) setError("Não foi possível consultar o histórico."); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
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
  return <section className="page esbeu-page"><header className="page-header"><p className="overline">Sua conta</p><h1 className="page-title">Histórico ESB-eu</h1>
    <p className="page-kicker">Somente suas avaliações da nova metodologia. Resultados antigos de classificação não são convertidos para ESB-eu.</p><Link className="button" href="/registro">Nova avaliação</Link></header>
    {!ready && <p role="status">Carregando histórico…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {ready && !error && !records.length && <section className="card empty-state"><h2>Nenhuma avaliação ESB-eu</h2><p>As avaliações que você salvar aparecerão aqui.</p></section>}
    {records.length > 0 && <section className="card"><EsbeuHistoryTable records={records} /></section>}
    {cursor && <button type="button" className="button secondary" disabled={busy} onClick={more}>{busy ? "Carregando…" : "Carregar mais avaliações"}</button>}
  </section>;
}
