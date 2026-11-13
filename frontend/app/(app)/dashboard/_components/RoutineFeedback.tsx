"use client";

import "./RoutineFeedback.css";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, BookOpen, CircleAlert, HandHeart, Moon, TrendingUp } from "lucide-react";
import { dailyDate, dailyQuestions } from "@/lib/daily-checkin";
import type { RoutineTrend } from "@/lib/routine-trend";
import type { DailyCheckIn } from "@/lib/types";

const hours = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pressureLevels = ["Nenhuma", "Baixa", "Moderada", "Alta", "Extrema"];
const changeIcons = {
  sleep_quality: Moon,
  assessment_pressure: BookOpen,
  study_rest_difficulty: ArrowLeftRight,
  personal_support: HandHeart
};

export function RoutineFeedback({ trend, latestCheckIn }: { trend: RoutineTrend | null; latestCheckIn?: DailyCheckIn }) {
  const tone = trend?.strong ? trend.direction : null;
  const ComparisonIcon = tone === "better" ? TrendingUp : tone === "worse" ? CircleAlert : ArrowLeftRight;
  const sleepDelta = trend?.sleepDelta ?? 0;
  const hasSleepChange = Math.abs(sleepDelta) >= 1;

  const observations = latestCheckIn?.observations;
  const quality = observations && dailyQuestions[0].labels[observations.sleep_quality];
  const pressure = observations && pressureLevels[observations.assessment_pressure];

  return <section className="routine-feedback" data-comparison={trend ? "" : undefined} data-tone={tone ?? undefined} aria-labelledby="routine-feedback-title">
    <div className="routine-feedback-content">
      <header className="routine-feedback-heading">
        <div className="routine-feedback-title">
          {trend && <span className="routine-feedback-icon"><ComparisonIcon size={19} aria-hidden="true" /></span>}
          <h2 id="routine-feedback-title">{tone === "better" ? "Que bom ver essa melhora!" : tone === "worse" ? "Sua rotina merece atenção" : trend ? "O que mudou na sua rotina" : "Sua rotina recente"}</h2>
        </div>
        {trend ? <p>Seus 7 check-ins mais recentes em comparação com os 7 anteriores</p>
          : latestCheckIn ? <p>Último check-in em <time dateTime={latestCheckIn.date.slice(0, 10)}>{dailyDate(latestCheckIn.date)}</time></p>
          : <p>Nenhum check-in recente.</p>}
      </header>
      {trend ? (
        trend.changes.length || hasSleepChange ? <ul className="routine-changes" role="list">
          {trend.changes.map(({ key, label }) => {
            const Icon = changeIcons[key];
            return <li key={key}><Icon size={16} aria-hidden="true" /><span>{label}</span></li>;
          })}
          {hasSleepChange && <li>
            <Moon size={16} aria-hidden="true" />
            <span><strong>{hours.format(Math.abs(sleepDelta))} h {sleepDelta > 0 ? "a mais" : "a menos"}</strong> de sono por noite <span className="routine-change-note">(mediana)</span></span>
          </li>}
        </ul> : <p className="routine-changes">Sem mudanças consistentes nesse período.</p>
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
