import { formatDateShort } from "@/lib/burnout-data";

export function TrendChart({ color, records, title, valueKey }) {
  const chartRecords = [...records].reverse().slice(-7);
  const values = chartRecords.map((record) => Number(record[valueKey] ?? 0));
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

  return (
    <article className="card chart-card">
      <h2 className="card-title">{title}</h2>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        {[0, 3, 6, 10].map((tick) => {
          const y = padding.top + ((max - tick) / (max - min)) * plotHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#d9e7ed" strokeDasharray="4 4" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="#587083" fontSize="11">{tick}</text>
            </g>
          );
        })}
        <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#688091" />
        <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#688091" />
        {points.length > 1 && <polyline fill="none" stroke={color} strokeWidth="3" points={line} />}
        {points.map((point) => (
          <circle key={`${point.record.id}-${valueKey}`} cx={point.x} cy={point.y} r="4" fill="#ffffff" stroke={color} strokeWidth="3" />
        ))}
        {points.map((point, index) => (
          <text
            key={`${point.record.id}-label-${valueKey}`}
            x={point.x}
            y={height - 10}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            fill="#587083"
            fontSize="10"
          >
            {formatDateShort(point.record.date)}
          </text>
        ))}
      </svg>
    </article>
  );
}
