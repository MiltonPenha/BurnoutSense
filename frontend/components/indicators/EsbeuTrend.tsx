"use client";

import { useEffect, useRef, useState } from "react";
import { formatIndex } from "@/lib/esbeu-form";
import { getAssessmentTrend } from "@/lib/burnout-api";
import { dailyDate } from "@/lib/daily-checkin";
import { trendSeries } from "@/lib/trend-series";
import type { TrendMode } from "@/lib/trend-series";
import type { TrendRecord } from "@/lib/types";
import "./indicators.css";
import "./EsbeuTrend.css";

const modes = [{ id: "daily", label: "Diário" }, { id: "weekly", label: "Semanal" }, { id: "monthly", label: "Mensal" }] as const;

export function EsbeuTrend({ timeZone = "America/Sao_Paulo" }: { timeZone?: string }) {
  const [records, setRecords] = useState<TrendRecord[] | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<TrendMode>("weekly");
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(640);
  const plot = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let active = true;
    const load = () => getAssessmentTrend().then((items) => { if (active) { setRecords(items); setError(""); } })
      .catch(() => { if (active) setError("Não foi possível carregar o gráfico."); });
    load(); window.addEventListener("burnoutsense-esbeu-change", load);
    return () => { active = false; window.removeEventListener("burnoutsense-esbeu-change", load); };
  }, [attempt]);
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.min(640, Math.round(entry.contentRect.width)))));
    observer.observe(element);
    return () => observer.disconnect();
  }, [records, mode]);
  const points = trendSeries(records ?? [], mode, timeZone);
  const first = Date.parse(points[0]?.start ?? "2000-01-01"), last = Date.parse(points.at(-1)?.start ?? "2000-01-01");
  const x = (i: number) => first === last ? width / 2 : 70 + (Date.parse(points[i].start) - first) * (width - 132) / (last - first);
  const y = (value: number) => 146 - value * 30;
  const labelIndices = new Set<number>();
  let previousX = -100;
  points.forEach((_, index) => {
    if (x(index) - previousX >= 90 && (index === points.length - 1 || x(points.length - 1) - x(index) >= 90)) {
      labelIndices.add(index); previousX = x(index);
    }
  });
  if (points.length > 0) labelIndices.add(points.length - 1);
  return <section className="index-chart" aria-labelledby="index-chart-title">
    <header><div><h2 id="index-chart-title">Evolução do acompanhamento</h2><p>{mode === "daily" ? "Último índice calculado de cada dia." : "Média dos últimos índices de cada dia registrado no período."}</p></div>
      <div className="index-chart-modes" role="group" aria-label="Período do gráfico">
        {modes.map(({ id, label }) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>)}
      </div></header>
    {error ? <p role="alert">{error} <button type="button" className="button secondary" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></p>
      : records === null ? <p role="status">Carregando evolução…</p> : points.length === 0 ? <p role="status">Ainda não há índices para este gráfico.</p> : <>
        <svg ref={plot} className="index-chart-plot" viewBox={`0 0 ${width} 195`} role="img" aria-label={`Evolução ${modes.find(({ id }) => id === mode)?.label.toLowerCase()} dos índices. Valores na tabela abaixo.`}>
          {[0, 1, 2, 3, 4].map((value) => <g key={value}><line x1="54" x2={width - 28} y1={y(value)} y2={y(value)} stroke="currentColor" opacity=".12" /><text x="0" y={y(value) + 4} fill="currentColor" fontSize="11">{value * 25}%</text></g>)}
          {points.map((point, i) => <g key={point.start}>
            {point.connectPrevious && <line x1={x(i - 1)} x2={x(i)} y1={y(points[i - 1].value)} y2={y(point.value)} stroke="var(--chart-accent)" strokeWidth="2" />}
            <circle cx={x(i)} cy={y(point.value)} r="4" fill="var(--chart-accent)"><title>{point.label}: {formatIndex(point.value)} · {point.days} {point.days === 1 ? "dia" : "dias"} com cálculo</title></circle>
            {labelIndices.has(i) && <text x={x(i)} y="174" textAnchor="middle" fill="currentColor" fontSize="11">{point.label}</text>}
          </g>)}
        </svg>
        {points.length === 1 && <p className="index-chart-note">Há apenas um período com dados disponíveis.</p>}
        <details className="index-chart-data"><summary>Ver dados do gráfico</summary><div className="esbeu-table-scroll"><table className="esbeu-table"><caption>Índices agrupados pela data de cálculo</caption><thead><tr><th>Período</th><th>Índice</th><th>Dias com cálculo</th><th>Dias dos check-ins vinculados</th></tr></thead>
          <tbody>{points.map((point) => <tr key={point.start}><td>{dailyDate(point.start)}{point.start !== point.end && ` a ${dailyDate(point.end)}`}</td><td>{formatIndex(point.value)}</td><td>{point.days}</td>
            <td>{[...new Set(point.records.flatMap(({ triggerCheckIn }) => triggerCheckIn ? [dailyDate(triggerCheckIn.date)] : []))].join("; ") || "Sem vínculo com check-in"}</td></tr>)}</tbody></table></div></details>
      </>}
  </section>;
}
