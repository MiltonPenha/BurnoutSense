"use client";
import "./dashboard.css";

import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { getDailyOverview } from "@/lib/burnout-api";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";
import { dailyDate, dailyQuestions, shiftCalendarDay } from "@/lib/daily-checkin";
import { EsbeuTrend } from "@/components/indicators/EsbeuTrend";
import type { DailyOverview } from "@/lib/types";
import { routineTrend } from "@/lib/routine-trend";
import { RoutineFeedback } from "./_components/RoutineFeedback";
import { ReviewInvite } from "./_components/ReviewInvite";
import { GuidancePanels } from "./_components/GuidancePanels";

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
  const store = useBurnoutStore();
  const records = store.ready ? store.records : null;
  const error = store.error ?? "";
  const [daily, setDaily] = useState<DailyOverview | null>(null);
  const [dailyError, setDailyError] = useState("");
  const accountId = store.profile.id;
  useEffect(() => {
    let active = true;
    const loadDaily = () => getDailyOverview().then((value) => { if (active) { setDaily(value); setDailyError(""); } }).catch(() => { if (active) setDailyError("Não foi possível carregar seus check-ins."); });
    loadDaily(); window.addEventListener("burnoutsense-checkin-change", loadDaily);
    return () => { active = false; window.removeEventListener("burnoutsense-checkin-change", loadDaily); };
  }, []);
  const trend = daily ? routineTrend(daily.recentCheckIns, daily.today) : null;
  const latestDay = daily?.recentCheckIns[0];
  const latestQuality = latestDay?.observations ? dailyQuestions[0].labels[latestDay.observations.sleep_quality] : null;
  const latestPressure = latestDay?.observations ? dailyQuestions[1].labels[latestDay.observations.assessment_pressure] : null;
  return <section className="page esbeu-page dashboard-page">
    <header className="page-header dashboard-heading"><div><h1 className="page-title">Acompanhamento</h1>
      <p className="page-kicker">Acompanhe seus registros e perceba como sua rotina acadêmica se relaciona com seu bem-estar.</p></div>
      {records && records.length > 0 && <Link href="/registro" className="button dashboard-new-record"><Plus size={16} aria-hidden="true" /> Novo registro</Link>}
    </header>
    {error && <p role="alert" className="form-error">{error}</p>}
    {records === null && !error && <p role="status">Carregando registros…</p>}
    {records?.length === 0 && <section className="card empty-state dashboard-empty"><div><h2>Sua primeira avaliação</h2><p>Conte como foram suas últimas quatro semanas. Depois, acompanhe sua rotina com check-ins rápidos.</p><Link href="/registro" className="button">Fazer primeiro registro</Link></div></section>}
    {records && records.length > 0 && <>
      <div className="dashboard-overview">
      <section className="tracking-summary" aria-label="Seu acompanhamento diário"><div className="tracking-today"><div><span>Check-in de hoje</span><strong>{daily?.todayCheckIn ? `${daily.todayCheckIn.mood} · registrado` : daily ? "Ainda não registrado" : "Carregando…"}</strong></div>{daily?.todayCheckIn && <Link href="/registro" className="button secondary tracking-review"><Pencil size={15} aria-hidden="true" />Revisar check-in</Link>}</div>
        <div><span>Últimos 28 dias</span><strong>{daily ? `${daily.completedDays} ${daily.completedDays === 1 ? "dia acompanhado" : "dias acompanhados"}` : "…"}</strong>{daily && <TrackingDays overview={daily} />}</div>
      </section>
      <EsbeuTrend timeZone={daily?.timeZone} />
      </div>
      {dailyError && <p className="form-error" role="alert">{dailyError}</p>}
      {daily?.evolution?.pending && <p className="form-error" role="status">Há mudanças nos seus dias aguardando atualização do índice. <Link href="/registro">Tentar atualizar</Link></p>}
      {daily && (trend ? <RoutineFeedback trend={trend} />
        : <section className="routine-feedback" aria-labelledby="routine-feedback-title">
          <h2 id="routine-feedback-title">Sua rotina recente</h2>
          {latestDay && <p>Em {dailyDate(latestDay.date)}: {new Intl.NumberFormat("pt-BR").format(latestDay.sleepHours)} h de sono{latestQuality && ` · Qualidade do sono: ${latestQuality}`}{latestPressure && ` · Pressão: ${latestPressure}`}.</p>}
          <p>As mudanças na sua rotina aparecerão aqui quando houver registros recentes suficientes para comparar.</p>
        </section>)}
      {daily && daily.completedDays > 0 && accountId && <ReviewInvite key={accountId} today={daily.today} accountId={accountId} />}</>}
    <GuidancePanels key={records?.[0]?.id ?? "empty"} assessmentId={records?.[0]?.id} loading={records === null} failed={Boolean(error)} />
  </section>;
}
