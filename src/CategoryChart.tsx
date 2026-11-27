export default function CategoryChart({ data, label, format = (value) => value.toLocaleString() }: {
  data: { label: string; value: number; detail?: string }[]
  label: string
  format?: (value: number) => string
}) {
  const max = Math.max(...data.map(item => item.value), 0)
  return <figure className="admin-category-chart">
    <figcaption>{label}</figcaption>
    {data.map(item => <div key={item.label} className="admin-category-row" title={item.detail ?? `${item.label}: ${format(item.value)}`}>
      <span>{item.label}</span>
      <span className="admin-category-track" aria-hidden="true">
        <span className="admin-category-bar" style={{ display: 'block', width: `${max > 0 ? Math.max(item.value ? 2 : 0, item.value / max * 100) : 0}%` }} />
      </span>
      <span>{format(item.value)}</span>
    </div>)}
  </figure>
}
