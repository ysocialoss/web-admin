import { Classes, HTMLTable } from '@blueprintjs/core'

export type Series = { key: string; label: string }
export type SeriesRow = { day: string; values: Record<string, number | null> }

const colors = ['var(--app-series-1)', 'var(--app-series-2)', 'var(--app-series-3)']
const width = 300
const height = 120
const pad = 4

function format(value: number | null, unit: string) {
  return value === null ? 'n/a' : `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`
}

export default function SeriesChart({ data, series, label, unit, kind = 'stack' }: {
  data: SeriesRow[]
  series: Series[]
  label: string
  unit: string
  kind?: 'stack' | 'line'
}) {
  const shown = series.slice(0, 3)
  const step = (width - pad * 2) / Math.max(1, data.length)
  const totals = data.map(row => shown.reduce((sum, item) => sum + (row.values[item.key] ?? 0), 0))
  const max = Math.max(1, ...(kind === 'stack' ? totals : data.flatMap(row => shown.map(item => row.values[item.key] ?? 0))))
  const y = (value: number) => height - pad - value / max * (height - pad * 2)
  const sums = Object.fromEntries(shown.map(item => [item.key, data.reduce((sum, row) => sum + (row.values[item.key] ?? 0), 0)]))
  return <figure className="admin-chart admin-series-chart">
    <figcaption><span>{label}</span></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
      aria-label={`${label}: ${shown.map(item => `${item.label} ${format(sums[item.key], unit)}`).join(', ')}`}>
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="var(--app-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {kind === 'stack' && data.map((row, index) => {
        let base = height - pad
        return shown.map((item, slot) => {
          const value = row.values[item.key] ?? 0
          if (!value) return null
          const barHeight = value / max * (height - pad * 2)
          const top = base - barHeight
          const rect = <rect key={`${row.day}-${item.key}`} x={pad + index * step + step * 0.14} y={top + (slot ? 1 : 0)}
            width={step * 0.72} height={Math.max(0.8, barHeight - (slot ? 1 : 0))} rx={1.5} fill={colors[slot]} />
          base = top
          return rect
        })
      })}
      {kind === 'line' && shown.map((item, slot) => {
        const points = data.map((row, index) => ({ x: pad + index * step + step / 2, value: row.values[item.key] }))
        const segments: string[] = []
        let current = ''
        for (const point of points) {
          if (point.value === null || point.value === undefined) {
            if (current) segments.push(current)
            current = ''
          } else current += `${current ? 'L' : 'M'}${point.x},${y(point.value)}`
        }
        if (current) segments.push(current)
        return <g key={item.key}>
          {segments.map(path => <path key={path} d={path} fill="none" stroke={colors[slot]} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
          {points.map(point => point.value === null || point.value === undefined ? null
            : <path key={point.x} d={`M${point.x},${y(point.value)}l0.001,0`} stroke={colors[slot]} strokeWidth={8}
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
        </g>
      })}
      {data.map((row, index) => <rect key={row.day} className="admin-chart-hit" x={pad + index * step} y={0} width={step} height={height}>
        <title>{`${row.day}\n${shown.map(item => `${item.label}: ${format(row.values[item.key] ?? (kind === 'stack' ? 0 : null), unit)}`).join('\n')}`}</title>
      </rect>)}
    </svg>
    <div className={`admin-chart-axis ${Classes.TEXT_MUTED}`}>
      <span>{data[0]?.day.slice(5)}</span><span>{data.at(-1)?.day.slice(5)}</span>
    </div>
    <ul className="admin-chart-legend">
      {shown.map((item, slot) => <li key={item.key}>
        <span className="admin-chart-swatch" style={{ background: colors[slot] }} aria-hidden="true" />
        <span>{item.label}</span>
        {kind === 'stack' && <span className={Classes.TEXT_MUTED}>{sums[item.key].toLocaleString()}</span>}
      </li>)}
    </ul>
    <details className="admin-chart-table">
      <summary className={Classes.TEXT_MUTED}>Show table</summary>
      <HTMLTable compact striped>
        <thead><tr><th scope="col">Day</th>{shown.map(item => <th key={item.key} scope="col">{item.label}</th>)}</tr></thead>
        <tbody>{data.map(row => <tr key={row.day}>
          <td>{row.day}</td>
          {shown.map(item => <td key={item.key}>{format(row.values[item.key] ?? (kind === 'stack' ? 0 : null), '')}</td>)}
        </tr>)}</tbody>
      </HTMLTable>
    </details>
  </figure>
}
