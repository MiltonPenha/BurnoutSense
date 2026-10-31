export function EsbeuTrend({ records }) {
  const points = [...records].reverse();
  const x = (index) => points.length === 1 ? 300 : 40 + index * 520 / (points.length - 1);
  const y = (value) => 190 - value * 40;
  return <section className="card"><h2>Histórico recente dos escores</h2>
    <p>Até 25 avaliações, em ordem de registro. Os contextos consideram as últimas 4 semanas; as janelas podem se sobrepor. Este gráfico não representa previsão futura.</p>
    <svg className="esbeu-trend" viewBox="0 0 600 230" role="img" aria-label="Escores de 0 a 4. Estimativas em azul e medições observadas em roxo; valores na tabela de avaliações.">
      {[0, 1, 2, 3, 4].map((value) => <g key={value}><line x1="40" x2="570" y1={y(value)} y2={y(value)} stroke="currentColor" opacity=".12" /><text x="15" y={y(value) + 5} fill="currentColor" fontSize="12">{value}</text></g>)}
      {points.length > 1 && <polyline points={points.map((record, index) => `${x(index)},${y(record.estimatedOverall)}`).join(" ")} fill="none" stroke="#2563eb" strokeWidth="2" />}
      {points.map((record, index) => <g key={record.id}>
        <circle cx={x(index)} cy={y(record.estimatedOverall)} r="4" fill="#2563eb"><title>Estimada: {record.estimatedOverall.toFixed(2)}</title></circle>
        {record.observedOverall !== null && <circle cx={x(index)} cy={y(record.observedOverall)} r="4" fill="#7c3aed"><title>Observada: {record.observedOverall.toFixed(2)}</title></circle>}
      </g>)}
      <text x="40" y="220" fill="currentColor" fontSize="12">Mais antiga</text><text x="495" y="220" fill="currentColor" fontSize="12">Mais recente</text>
    </svg><p className="esbeu-legend"><span>● Estimada pelo contexto</span><span>● Observada pelos itens</span></p>
  </section>;
}
