"use client";

import "./RoutineFeedback.css";
import Link from "next/link";
import { ArrowRight, BookOpen, CircleAlert, Moon, TrendingUp } from "lucide-react";
import { dailyDate, dailyQuestions } from "@/lib/daily-checkin";
import type { RoutineTrend } from "@/lib/routine-trend";
import type { DailyCheckIn } from "@/lib/types";

const hours = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pressureLevels = ["Nenhuma", "Baixa", "Moderada", "Alta", "Extrema"];

export function RoutineFeedback({ trend, latestCheckIn }: { trend: RoutineTrend | null; latestCheckIn?: DailyCheckIn }) {
  const tone = trend?.strong ? trend.direction : null;
  const lines = trend?.changes.map(({ key, label }) => <li key={key}>{label}</li>) ?? [];
  if (trend && Math.abs(trend.sleepDelta) >= 1) lines.push(<li key="hours">{hours.format(Math.abs(trend.sleepDelta))} h {trend.sleepDelta > 0 ? "a mais" : "a menos"} de sono por noite (mediana)</li>);

  const observations = latestCheckIn?.observations;
  const quality = observations && dailyQuestions[0].labels[observations.sleep_quality];
  const pressure = observations && pressureLevels[observations.assessment_pressure];

  return <section className="routine-feedback" data-tone={tone ?? undefined} aria-labelledby="routine-feedback-title">
    <div className="routine-feedback-content">
      <header className="routine-feedback-heading">
        <div className="routine-feedback-title">
          {tone && <span className="routine-feedback-icon">{tone === "better" ? <TrendingUp size={20} aria-hidden="true" /> : <CircleAlert size={20} aria-hidden="true" />}</span>}
          <h2 id="routine-feedback-title">{tone === "better" ? "Que bom ver essa melhora!" : tone === "worse" ? "Sua rotina merece atenção" : trend ? "O que mudou na sua rotina" : "Sua rotina recente"}</h2>
        </div>
        {trend ? <p>Seus 3 check-ins mais recentes em comparação com os 3 anteriores</p>
          : latestCheckIn ? <p>Último check-in em <time dateTime={latestCheckIn.date.slice(0, 10)}>{dailyDate(latestCheckIn.date)}</time></p>
          : <p>Nenhum check-in recente.</p>}
      </header>
      {trend ? (
        lines.length > 0 ? <ul className="routine-changes">{lines}</ul>
          : <p className="routine-changes">Sem mudanças consistentes nesse período.</p>
      ) : latestCheckIn && (
        <dl className="routine-snapshot">
          <div>
            <dt><Moon size={15} aria-hidden="true" /> Sono</dt>
            <dd>{hours.format(latestCheckIn.sleepHours)} h{quality && <span className="routine-sleep-quality"><span className="sr-only">, qualidade do sono: </span>{quality}</span>}</dd>
          </div>
          {pressure && <div>
            <dt><BookOpen size={15} aria-hidden="true" /> Pressão dos estudos</dt>
            <dd>{pressure}</dd>
          </div>}
        </dl>
      )}
    </div>
    <Link className="button routine-review" href="/contexto?revisao=escolher">
      {trend ? "O que mudou na rotina?" : "Revisar minha rotina"}<ArrowRight size={16} aria-hidden="true" />
    </Link>
  </section>;
}
