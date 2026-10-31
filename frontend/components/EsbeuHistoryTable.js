import Link from "next/link";
import { formatEsbeu } from "@/lib/esbeu-form.mjs";

export function assessmentDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function EsbeuHistoryTable({ records }) {
  return <div className="esbeu-table-scroll" tabIndex={0} role="region" aria-label="Tabela de avaliações; role horizontalmente para ver todas as colunas"><table className="esbeu-table">
    <caption>Avaliações da sua conta, em ordem de registro</caption>
    <thead><tr><th>Registrada em</th><th>Estimada (0–4)</th><th>Observada (0–4)</th><th>Modelo / base</th><th>Detalhes</th></tr></thead>
    <tbody>{records.map((record) => <tr key={record.id}>
      <td><time dateTime={record.createdAt}>{assessmentDate(record.createdAt)}</time></td>
      <td>{formatEsbeu(record.estimatedOverall)}</td><td>{record.observedOverall === null ? "Não respondida" : formatEsbeu(record.observedOverall)}</td>
      <td>{record.modelName}<small className="esbeu-table-meta">{record.datasetVersion}</small></td>
      <td><Link className="esbeu-link" href={`/historico/${record.id}`}>Ver avaliação</Link></td>
    </tr>)}</tbody>
  </table></div>;
}
