import Link from "next/link";
import "./indicators.css";
import { formatIndex, reviewDetails } from "@/lib/esbeu-form";
import type { Assessment } from "@/lib/types";
import { AssessmentDates } from "./AssessmentDates";

export function assessmentDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function EsbeuHistoryTable({ records }: { records: Assessment[] }) {
  return <div className="esbeu-table-scroll" tabIndex={0} role="region" aria-label="Tabela de avaliações; role horizontalmente para ver todas as colunas"><table className="esbeu-table">
    <caption>Seus registros, do mais recente ao mais antigo</caption>
    <thead><tr><th>Referência e registro</th><th>Seu índice</th><th>Detalhes</th></tr></thead>
    <tbody>{records.map((record) => { const review = reviewDetails(record); return <tr key={record.id}>
      <td><AssessmentDates record={record} /><small className="esbeu-table-meta">{record.source === "daily_experimental" ? "Pelos check-ins" : record.source === "guided_review" ? "Revisão rápida" : "Contexto informado"}</small></td>
      <td>{formatIndex(record.estimatedOverall)}{review && formatIndex(review.previousEstimatedOverall) === formatIndex(record.estimatedOverall) && <small className="esbeu-table-meta">Sem mudança no percentual</small>}</td>
      <td><Link className="esbeu-link" href={`/historico/${record.id}`}>Ver avaliação</Link></td>
    </tr>; })}</tbody>
  </table></div>;
}
