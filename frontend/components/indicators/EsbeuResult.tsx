import { formatIndex, indexPercentage } from "@/lib/esbeu-form";
import { calculationDate } from "@/lib/daily-checkin";
import "./indicators.css";
import type { Assessment } from "@/lib/types";
import { IndexHelp } from "./IndexHelp";

function IndexBar({ value, label }: { value: number | null; label: string }) {
  const percentage = indexPercentage(value);
  return percentage === null ? null : <div className="index-track" role="meter" aria-label={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
    <span style={{ width: `${percentage}%` }} />
  </div>;
}

export function EsbeuResult({ record, title = "Seu índice", timeZone }: { record: Assessment; title?: string; timeZone?: string }) {
  const experimental = record.source === "daily_experimental";
  const days = record.evolution && "recordedDays" in record.evolution ? record.evolution.recordedDays : undefined;
  const hasComplement = record.observedOverall !== null;
  return (
    <section className={`esbeu-results${hasComplement ? " has-complement" : ""}`} aria-label="Indicadores do seu registro">
      <article className="card esbeu-score">
        <div className="esbeu-score-heading"><h2>{title}</h2><span className={`index-source${experimental ? " is-experimental" : ""}`}>{experimental ? "Atualização em teste" : record.source === "guided_review" ? "Revisão rápida" : "Contexto informado"}</span></div>
        <p className="esbeu-score-value">{formatIndex(record.estimatedOverall)}</p>
        <IndexBar value={record.estimatedOverall} label="Índice calculado do registro" />
        <div className="index-meta"><time dateTime={record.createdAt}>Calculado em {calculationDate(record.createdAt, timeZone)}</time>
          {experimental && days !== undefined && <span>{days === 1 ? "1 dia usado no cálculo" : `${days} dias usados no cálculo`}</span>}
        </div>
        <IndexHelp />
      </article>
      {hasComplement && <article className="card esbeu-score esbeu-score-complement">
        <p className="overline">Um olhar complementar</p>
        <h2>Questionário complementar</h2>
        <p className="esbeu-score-value">{formatIndex(record.observedOverall)}</p>
        <IndexBar value={record.observedOverall} label="Índice do questionário complementar" />
        <dl className="esbeu-dimensions">
          <div><dt>Desgaste emocional e físico</dt><dd>{formatIndex(record.observedExhaustion)}</dd></div>
          <div><dt>Distanciamento</dt><dd>{formatIndex(record.observedDistancing)}</dd></div>
          <div><dt>Ineficácia da formação</dt><dd>{formatIndex(record.observedInefficacy)}</dd></div>
        </dl>
      </article>}
    </section>
  );
}
