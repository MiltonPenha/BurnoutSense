"use client";

import "./RoutineFeedback.css";
import Link from "next/link";
import { CircleAlert, Sparkles } from "lucide-react";
import { dailyDate } from "@/lib/daily-checkin";
import type { RoutineTrend } from "@/lib/routine-trend";

const hours = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function RoutineFeedback({ trend }: { trend: RoutineTrend }) {
  const { strong, direction, latestDay } = trend;
  const reviewUrl = "/contexto?revisao=escolher";
  const lines = trend.changes.map(({ key, label }) => <li key={key}>{label}</li>);
  if (Math.abs(trend.sleepDelta) >= 1) lines.push(<li key="hours">{hours.format(Math.abs(trend.sleepDelta))} h {trend.sleepDelta > 0 ? "a mais" : "a menos"} de sono por noite (mediana)</li>);
  const improving = direction === "better";
  return <section className="routine-feedback" data-tone={strong ? direction : undefined} aria-labelledby="routine-feedback-title">
    <div className="routine-feedback-heading"><div>
      <div className="routine-feedback-title">
      {strong && <span className="routine-feedback-icon">{improving ? <Sparkles size={20} aria-hidden="true" /> : <CircleAlert size={20} aria-hidden="true" />}</span>}
      <h2 id="routine-feedback-title">{strong ? improving ? "Que bom ver essa melhora!" : "Sua rotina merece atenção" : "O que mudou na sua rotina"}</h2>
      </div>
      <p>Seus 3 check-ins mais recentes comparados aos 3 anteriores, até {dailyDate(latestDay)}.</p></div></div>
    {lines.length > 0 ? <ul>{lines}</ul> : <p>Não apareceu uma diferença consistente entre esses registros.</p>}
    {strong && <p>Este aviso acompanha o que você relatou nos seus dias, não uma mudança no índice.</p>}
    <Link className="button secondary" href={reviewUrl}>O que mudou na rotina?</Link>
  </section>;
}
