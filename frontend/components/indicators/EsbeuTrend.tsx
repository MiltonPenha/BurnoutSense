import { formatIndex } from "@/lib/esbeu-form";
import "./indicators.css";
import type { Assessment } from "@/lib/types";

export function EsbeuTrend({ records }: { records: Assessment[] }) {
  const points = [...records].reverse();
  const x = (index: number) => points.length === 1 ? 300 : 55 + index * 510 / (points.length - 1);
  const y = (value: number) => 190 - value * 40;
  return <section className="card"><h2>Seu acompanhamento ao longo do tempo</h2>
    <p>Veja os índices dos seus últimos registros.</p>
    <svg className="esbeu-trend" viewBox="0 0 600 230" role="img" aria-label="Histórico dos índices em porcentagem. Índice do registro em azul e questionário complementar em roxo; valores disponíveis na tabela do histórico.">
      {[0, 1, 2, 3, 4].map((value) => <g key={value}><line x1="55" x2="570" y1={y(value)} y2={y(value)} stroke="currentColor" opacity=".12" /><text x="0" y={y(value) + 5} fill="currentColor" fontSize="12">{value * 25}%</text></g>)}
      {points.length > 1 && <polyline points={points.map((record, index) => `${x(index)},${y(record.estimatedOverall)}`).join(" ")} fill="none" stroke="#2563eb" strokeWidth="2" />}
      {points.map((record, index) => <g key={record.id}>
        <circle cx={x(index)} cy={y(record.estimatedOverall)} r="4" fill="#2563eb"><title>Seu índice: {formatIndex(record.estimatedOverall)}</title></circle>
        {record.observedOverall !== null && <circle cx={x(index)} cy={y(record.observedOverall)} r="4" fill="#7c3aed"><title>Complementar: {formatIndex(record.observedOverall)}</title></circle>}
      </g>)}
      <text x="40" y="220" fill="currentColor" fontSize="12">Mais antiga</text><text x="495" y="220" fill="currentColor" fontSize="12">Mais recente</text>
    </svg><p className="esbeu-legend"><span>● Seu índice</span><span>● Questionário complementar</span></p>
  </section>;
}
