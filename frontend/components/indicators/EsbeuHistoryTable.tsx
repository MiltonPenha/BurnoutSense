import Link from "next/link";
import "./indicators.css";
import { formatIndex } from "@/lib/esbeu-form";
import type { Assessment } from "@/lib/types";

export function assessmentDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function EsbeuHistoryTable({ records }: { records: Assessment[] }) {
  return <div className="esbeu-table-scroll" tabIndex={0} role="region" aria-label="Tabela de avaliações; role horizontalmente para ver todas as colunas"><table className="esbeu-table">
    <caption>Seus registros, do mais recente ao mais antigo</caption>
    <thead><tr><th>Registrado em</th><th>Seu índice</th><th>Complementar</th><th>Detalhes</th></tr></thead>
    <tbody>{records.map((record) => <tr key={record.id}>
      <td><time dateTime={record.createdAt}>{assessmentDate(record.createdAt)}</time><small className="esbeu-table-meta">{record.source === "daily_experimental" ? "Pelos check-ins" : "Contexto informado"}</small></td>
      <td>{formatIndex(record.estimatedOverall)}</td><td>{record.observedOverall === null ? "Não respondido" : formatIndex(record.observedOverall)}</td>
      <td><Link className="esbeu-link" href={`/historico/${record.id}`}>Ver avaliação</Link></td>
    </tr>)}</tbody>
  </table></div>;
}
