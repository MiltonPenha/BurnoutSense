"use client";
import "./dashboard.css";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { getDailyOverview, getRecords } from "@/lib/burnout-api";
import { CHECK_IN_FEEDBACK_KEY, dailyDate, shiftCalendarDay } from "@/lib/daily-checkin";
import { EsbeuResult } from "@/components/indicators/EsbeuResult";
import { EsbeuHistoryTable } from "@/components/indicators/EsbeuHistoryTable";
import { EsbeuTrend } from "@/components/indicators/EsbeuTrend";
import type { Assessment, DailyOverview } from "@/lib/types";

function TrackingDays({ overview }: { overview: DailyOverview }) {
  const recorded = new Set(overview.recentCheckIns.map(entry => entry.date.slice(0, 10)));
  return <>
    <ol className="tracking-days" aria-label="Registros dos últimos 28 dias, do mais antigo ao mais recente">
      {Array.from({ length: 28 }, (_, offset) => shiftCalendarDay(overview.windowStart, offset)).map(date => {
        const status = recorded.has(date) ? "registrado" : "sem registro";
        const label = `${dailyDate(date)}: ${status}${date === overview.today ? " (hoje)" : ""}`;
        return <li key={date} data-recorded={recorded.has(date)} data-today={date === overview.today} title={label}>
          <time dateTime={date} aria-hidden="true">{date.slice(8, 10)}/{date.slice(5, 7)}</time><span className="tracking-day-label">{label}</span>
        </li>;
      })}
    </ol>
    <div className="tracking-key" aria-hidden="true"><span><i data-marker="recorded" /> Registrado</span><span><i /> Sem registro</span><span><i data-marker="today" /> Hoje</span></div>
  </>;
}

export default function DashboardPage() {
  const [records, setRecords] = useState<Assessment[] | null>(null);
  const [error, setError] = useState("");
  const [daily, setDaily] = useState<DailyOverview | null>(null);
  const [dailyError, setDailyError] = useState("");
  const [checkInFeedback, setCheckInFeedback] = useState("");
  useEffect(() => {
    let active = true;
    const feedback = window.setTimeout(() => {
      try {
        const message = sessionStorage.getItem(CHECK_IN_FEEDBACK_KEY);
        sessionStorage.removeItem(CHECK_IN_FEEDBACK_KEY);
        if (message) setCheckInFeedback(message);
      } catch { /* The dashboard still works without browser storage. */ }
    }, 0);
    const loadRecords = () => getRecords().then((value) => { if (active) { setRecords(value); setError(""); } }).catch(() => { if (active) setError("Não foi possível carregar seus registros. Tente novamente mais tarde."); });
    loadRecords(); window.addEventListener("burnoutsense-esbeu-change", loadRecords);
    const loadDaily = () => getDailyOverview().then((value) => { if (active) { setDaily(value); setDailyError(""); } }).catch(() => { if (active) setDailyError("Não foi possível carregar seus check-ins."); });
    loadDaily(); window.addEventListener("burnoutsense-checkin-change", loadDaily);
    return () => { active = false; window.clearTimeout(feedback); window.removeEventListener("burnoutsense-checkin-change", loadDaily); window.removeEventListener("burnoutsense-esbeu-change", loadRecords); };
  }, []);
  return <section className="page esbeu-page dashboard-page">
    <header className="page-header dashboard-heading"><div><p className="overline">Seu espaço de acompanhamento</p><h1 className="page-title">Seus indicadores, com mais clareza</h1>
      <p className="page-kicker">Acompanhe seus registros e perceba como sua rotina acadêmica se relaciona com seu bem-estar.</p></div>
      {records && records.length > 0 && <Link href="/registro" className="button dashboard-new-record"><Plus size={16} aria-hidden="true" /> Novo registro</Link>}
    </header>
    {checkInFeedback && <p className="dashboard-check-in-feedback" role="status"><strong>Check-in salvo.</strong> {checkInFeedback}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {records === null && !error && <p role="status">Carregando registros…</p>}
    {records?.length === 0 && <section className="card empty-state dashboard-empty"><div><h2>Seu acompanhamento começa aqui</h2><p>Faça seu primeiro registro para começar a acompanhar seus índices.</p></div><Link href="/registro" className="button">Fazer primeiro registro</Link></section>}
    {records && records.length > 0 && <>
      <section className="tracking-summary" aria-label="Seu acompanhamento diário"><div><span>Check-in de hoje</span><strong>{daily?.todayCheckIn ? `${daily.todayCheckIn.mood} · registrado` : daily ? "Ainda não registrado" : "Carregando…"}</strong>{daily?.todayCheckIn && <Link href="/registro" className="esbeu-link">Revisar check-in</Link>}</div>
        <div><span>Últimos 28 dias</span><strong>{daily ? `${daily.completedDays} ${daily.completedDays === 1 ? "dia acompanhado" : "dias acompanhados"}` : "…"}</strong>{daily && <TrackingDays overview={daily} />}</div>
        <div><span>Algo mudou na sua rotina?</span><strong>Atualize seu acompanhamento</strong><Link href="/contexto" className="esbeu-link">Revisar minha rotina</Link></div>
      </section>
      {dailyError && <p className="form-error" role="alert">{dailyError}</p>}
      {daily?.evolution?.pending && <p className="form-error" role="status">Há mudanças nos seus dias aguardando atualização do índice. <Link href="/registro">Tentar atualizar</Link></p>}
      <EsbeuResult record={records[0]} title="Seu índice atual" timeZone={daily?.timeZone} /></>}
    <div className="dashboard-feedback" aria-label="Dicas e recomendações para você">
      <section className="card feedback-panel" aria-labelledby="tips-title">
        <header className="feedback-heading"><span className="feedback-icon feedback-icon-blue" aria-hidden="true">💡</span><h2 id="tips-title">Dicas</h2></header>
        <div className="feedback-placeholder"><p>{error ? "Dicas indisponíveis no momento." : records === null ? "Carregando…" : records.length ? "Ainda não há dicas para este registro." : "Suas dicas aparecerão após o primeiro registro."}</p></div>
      </section>
      <section className="card feedback-panel" aria-labelledby="recommendations-title">
        <header className="feedback-heading"><span className="feedback-icon feedback-icon-mint" aria-hidden="true">🌿</span><h2 id="recommendations-title">Recomendações</h2></header>
        <div className="feedback-placeholder"><p>{error ? "Recomendações indisponíveis no momento." : records === null ? "Carregando…" : records.length ? "Ainda não há recomendações para este registro." : "Suas recomendações aparecerão após o primeiro registro."}</p></div>
      </section>
    </div>
    {records && records.length > 0 && <><EsbeuTrend records={records} />
      <section className="card"><h2>Atualizações recentes do índice</h2><EsbeuHistoryTable records={records.slice(0, 5)} /><Link href="/historico" className="esbeu-link">Ver histórico completo</Link></section></>}
  </section>;
}
