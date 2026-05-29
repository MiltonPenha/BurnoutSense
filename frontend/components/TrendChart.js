import { formatDateShort } from "@/lib/burnout-data";

export function TrendChart({ color, records, title, valueKey }) {
  const chartRecords = [...records].reverse().slice(-7);
  const values = chartRecords.map((record) => Number(record[valueKey] ?? 0));
  const latestValue = values.at(-1) ?? 0;
  const averageValue = values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0;
  const max = 10;
  const min = 0;
  const width = 520;
  const height = 190;
  const padding = { top: 18, right: 22, bottom: 32, left: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const safeRecords = chartRecords.length ? chartRecords : [];

  const points = safeRecords.map((record, index) => {
    const x = padding.left + (safeRecords.length === 1 ? plotWidth : (index / (safeRecords.length - 1)) * plotWidth);
    const y = padding.top + ((max - Number(record[valueKey] ?? 0)) / (max - min)) * plotHeight;
    return { x, y, record };
  });

  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const baseline = height - padding.bottom;
  const area = points.length > 1 ? `${padding.left},${baseline} ${line} ${points.at(-1).x},${baseline}` : "";
  const gradientId = `chart-gradient-${valueKey}`;
  const glowId = `chart-glow-${valueKey}`;

  return (
    <article className="card chart-card">
      <div className="chart-heading">
        <h2 className="card-title">{title}</h2>
        <span>{latestValue}/10 agora · média {averageValue}/10</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="78%" stopColor={color} stopOpacity="0.03" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor={color} floodOpacity="0.2" />
          </filter>
        </defs>
        {[0, 3, 6, 10].map((tick) => {
          const y = padding.top + ((max - tick) / (max - min)) * plotHeight;
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="chart-label" x={padding.left - 8} y={y + 4} textAnchor="end">{tick}</text>
            </g>
          );
        })}
        <line className="chart-axis" x1={padding.left} x2={padding.left} y1={padding.top} y2={baseline} />
        <line className="chart-axis" x1={padding.left} x2={width - padding.right} y1={baseline} y2={baseline} />
        {points.length > 1 ? <polygon fill={`url(#${gradientId})`} points={area} /> : null}
        {points.length > 1 ? <polyline className="chart-line chart-line-glow" fill="none" filter={`url(#${glowId})`} stroke={color} points={line} /> : null}
        {points.length > 1 ? <polyline className="chart-line" fill="none" stroke={color} points={line} /> : null}
        {points.map((point) => (
          <g key={`${point.record.id}-${valueKey}`}>
            <circle className="chart-point-halo" cx={point.x} cy={point.y} r="9" fill={color} />
            <circle className="chart-point" cx={point.x} cy={point.y} r="4.5" fill="#ffffff" stroke={color} />
          </g>
        ))}
        {points.map((point, index) => (
          <text
            key={`${point.record.id}-label-${valueKey}`}
            x={point.x}
            y={height - 10}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            className="chart-label"
            fontSize="10"
          >
            {formatDateShort(point.record.date)}
          </text>
        ))}
      </svg>
    </article>
  );
}
