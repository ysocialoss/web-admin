import { Classes } from '@blueprintjs/core'

// Compact daily bar chart. Colours follow the Blueprint theme through currentColor.
export default function BarChart({ data, label, unit }: { data: { day: string; count: number }[]; label: string; unit: string }) {
  const max = Math.max(1, ...data.map(item => item.count))
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const width = 100
  const height = 40
  const step = width / Math.max(1, data.length)
  return <figure className="admin-chart">
    <figcaption><span>{label}</span><strong>{total.toLocaleString()}</strong></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
      aria-label={`${label}: ${data.map(item => `${item.day} ${item.count}`).join(', ')}`}>
      {data.map((item, index) => {
        const barHeight = item.count ? Math.max(1.5, item.count / max * (height - 2)) : 0.6
        return <rect key={item.day} x={index * step + step * 0.12} y={height - barHeight} width={step * 0.76} height={barHeight}
          rx={0.6} opacity={item.count ? 1 : 0.25}><title>{`${item.day}: ${item.count.toLocaleString()} ${unit}`}</title></rect>
      })}
    </svg>
    <div className={`admin-chart-axis ${Classes.TEXT_MUTED}`}>
      <span>{data[0]?.day.slice(5)}</span><span>{data.at(-1)?.day.slice(5)}</span>
    </div>
  </figure>
}
