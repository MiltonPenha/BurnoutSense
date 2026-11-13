"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { formatIndex } from "@/lib/esbeu-form";
import { getAssessmentTrend } from "@/lib/burnout-api";
import { dailyDate, shiftCalendarDay } from "@/lib/daily-checkin";
import { trendSeries } from "@/lib/trend-series";
import type { TrendMode, TrendPoint } from "@/lib/trend-series";
import type { DailyCheckIn, TrendRecord } from "@/lib/types";
import "./EsbeuTrend.css";

const modes = [{ id: "daily", label: "Diário" }, { id: "weekly", label: "Semanal" }, { id: "monthly", label: "Mensal" }] as const;
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const plotTop = 14;
const plotBottom = 140;
const y = (value: number) => plotBottom - value * (plotBottom - plotTop) / 4;

function periodLabel(point: TrendPoint, mode: TrendMode) {
  if (mode === "daily") return dailyDate(point.start);
  if (mode === "monthly") return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(point.start));
  return `${point.label.replace("–", " a ")} de ${point.end.slice(0, 4)}`;
}

function TrendPlot({ points, dates, checkInDates, mode, selectedDate, onSelect }: {
  points: TrendPoint[]; dates: string[]; checkInDates: Set<string>; mode: TrendMode;
  selectedDate: string; onSelect: (date: string) => void;
}) {
  const plot = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(480);

  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const left = 44;
  const right = width - 22;
  const lastDay = dates[dates.length - 1];
  const weekStart = shiftCalendarDay(lastDay, -6);
  const axisDays = mode === "daily" && dates[0] >= weekStart
    ? Array.from({ length: 7 }, (_, index) => shiftCalendarDay(weekStart, index))
    : dates;
  const labels = new Map(points.map(point => [point.start, point.label]));
  const ticks = axisDays.map(start => ({ start, label: labels.get(start) ?? `${start.slice(8, 10)}/${start.slice(5, 7)}` }));
  const hasCheckIns = checkInDates.size > 0;
  const labelTop = hasCheckIns ? 164 : 151;
  const first = Date.parse(ticks[0].start);
  const last = Date.parse(lastDay);
  const x = (date: string) => first === last ? (left + right) / 2
    : left + (Date.parse(date) - first) * (right - left) / (last - first);
  const runs: TrendPoint[][] = [];
  for (const point of points) {
    if (!point.connectPrevious) runs.push([]);
    runs[runs.length - 1].push(point);
  }
  const active = points.find(point => point.start === selectedDate);
  const activeX = x(selectedDate);
  const dateLabels: { date: string; label: string; center: number; width: number }[] = [];
  const selectedTick = ticks.findIndex(tick => tick.start === selectedDate);
  const checkInTicks = [...ticks.keys()].filter(index => checkInDates.has(ticks[index].start)).reverse();
  const labelOrder = new Set([selectedTick, ...checkInTicks, 0, ticks.length - 1, ...ticks.keys()]);
  for (const index of labelOrder) {
    const { start, label } = ticks[index];
    const labelWidth = label.length * 6 + 6;
    const center = Math.min(width - labelWidth / 2, x(start));
    if (dateLabels.every(other => Math.abs(other.center - center) >= (other.width + labelWidth) / 2 + 4)) {
      dateLabels.push({ date: start, label, center, width: labelWidth });
    }
  }

  function selectNearest(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) * width / bounds.width;
    let nearest = 0;
    for (let index = 1; index < dates.length; index++) {
      if (Math.abs(x(dates[index]) - position) < Math.abs(x(dates[nearest]) - position)) nearest = index;
    }
    onSelect(dates[nearest]);
  }

  return (
    <svg
      ref={plot}
      className="index-chart-plot"
      data-interactive={dates.length > 1}
      data-check-ins={hasCheckIns}
      viewBox={`0 0 ${width} ${labelTop + 25}`}
      aria-hidden="true"
      onPointerUp={dates.length > 1 ? selectNearest : undefined}
    >
      {[0, 1, 2, 3, 4].map((value) => (
        <g key={value}>
          <line className="index-chart-grid" x1={left} x2={right} y1={y(value)} y2={y(value)} />
          <text x={left - 9} y={y(value) + 4} textAnchor="end">{value * 25}%</text>
        </g>
      ))}
      {runs.filter(run => run.length > 1).map(run => (
        <polyline key={run[0].start} className="index-chart-line" points={run.map(point => `${x(point.start)},${y(point.value)}`).join(" ")} />
      ))}
      {ticks.map(({ start }) => (
        <line key={start} className="index-chart-tick" x1={x(start)} x2={x(start)} y1={plotBottom} y2={plotBottom + 5} />
      ))}
      <line className="index-chart-guide" x1={activeX} x2={activeX} y1={plotTop} y2={plotBottom} />
      {active && <circle className="index-chart-point-active" cx={activeX} cy={y(active.value)} r="8" />}
      {points.map(point => (
        <circle key={point.start} className="index-chart-point" cx={x(point.start)} cy={y(point.value)} r="4" />
      ))}
      {[...checkInDates].map(date => (
        <rect key={date} className="index-chart-checkin" data-date={date} data-selected={date === selectedDate}
          x={x(date) - 3.5} y="150" width="7" height="7" transform={`rotate(45 ${x(date)} 153.5)`} />
      ))}
      {dateLabels.map(({ date, label, center, width: labelWidth }) => (
        <g key={date} className="index-chart-date" data-selected={date === selectedDate}>
          {date === selectedDate && <rect x={center - labelWidth / 2} y={labelTop} width={labelWidth} height="22" rx="5" />}
          <text x={center} y={labelTop + 15} textAnchor="middle">{label}</text>
        </g>
      ))}
    </svg>
  );
}

export function EsbeuTrend({ timeZone = "America/Sao_Paulo", checkIns = [] }: { timeZone?: string; checkIns?: DailyCheckIn[] }) {
  const [records, setRecords] = useState<TrendRecord[] | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<TrendMode>("weekly");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => getAssessmentTrend().then((items) => {
      if (active) { setRecords(items); setError(""); setSelected(null); }
    }).catch(() => { if (active) setError("Não foi possível carregar o gráfico."); });
    load();
    window.addEventListener("burnoutsense-esbeu-change", load);
    return () => { active = false; window.removeEventListener("burnoutsense-esbeu-change", load); };
  }, [attempt]);

  const points = trendSeries(records ?? [], mode, timeZone);
  const checkInDates = new Set(mode === "daily" ? checkIns.map(checkIn => checkIn.date.slice(0, 10)) : []);
  const dates = [...new Set([...points.map(point => point.start), ...checkInDates])].sort();
  const selectedDate = selected && dates.includes(selected) ? selected : points.at(-1)?.start ?? dates.at(-1);
  const selectedIndex = selectedDate ? dates.indexOf(selectedDate) : -1;
  const activeIndex = points.findIndex(point => point.start === selectedDate);
  const active = points[activeIndex];
  const previous = points[activeIndex - 1];
  const difference = active && previous ? Math.round((active.value - previous.value) * 250) / 10 : null;

  return (
    <section className="index-chart" aria-labelledby="index-chart-title">
      <header>
        <div>
          <h2 id="index-chart-title">Evolução do acompanhamento</h2>
          <p>{mode === "daily" ? "Último índice por data de cálculo." : "Média dos dias com índice calculado."}</p>
        </div>
        <div className="index-chart-modes" role="group" aria-label="Período do gráfico">
          {modes.map(({ id, label }) => (
            <button type="button" key={id} aria-pressed={mode === id} onClick={() => { setMode(id); setSelected(null); }}>{label}</button>
          ))}
        </div>
      </header>
      {error ? <p role="alert">{error} <button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></p>
        : records === null ? <p role="status">Carregando evolução…</p>
        : !selectedDate ? <p role="status">Ainda não há índices para este gráfico.</p>
        : <div className="index-chart-panel">
            <div className="index-chart-readout">
              <div aria-live="polite" aria-atomic="true">
                <p className="index-chart-period">{active ? periodLabel(active, mode) : dailyDate(selectedDate)}</p>
                {active ? <strong className="index-chart-value">{formatIndex(active.value)}</strong> : <p>Check-in registrado. Sem índice calculado nesta data.</p>}
                {active && checkInDates.has(selectedDate) && <p>Check-in registrado</p>}
                {difference !== null && <p>{difference === 0 ? "Sem variação em relação ao período anterior com dados." : `${difference > 0 ? "+" : "−"}${number.format(Math.abs(difference))} p.p. em relação ao período anterior com dados`}</p>}
              </div>
              {dates.length > 1 && (
                <div className="index-chart-navigation" role="group" aria-label="Consultar períodos do gráfico">
                  <button type="button" aria-label="Período anterior" disabled={selectedIndex === 0} onClick={() => setSelected(dates[selectedIndex - 1])}>‹</button>
                  <button type="button" aria-label="Próximo período" disabled={selectedIndex === dates.length - 1} onClick={() => setSelected(dates[selectedIndex + 1])}>›</button>
                </div>
              )}
            </div>
            <TrendPlot points={points} dates={dates} checkInDates={checkInDates} mode={mode} selectedDate={selectedDate} onSelect={setSelected} />
            {checkInDates.size > 0 ? (
              <p className="index-chart-legend"><span>Índice calculado</span><span>Check-in registrado</span></p>
            ) : points.length === 1 && <p className="index-chart-note">{mode === "daily" ? "Só há índice calculado em um dia." : "Só há índice calculado em um período."}</p>}
          </div>}
    </section>
  );
}
