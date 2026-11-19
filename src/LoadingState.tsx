import { Classes, Spinner } from '@blueprintjs/core'

export function LoadingStatus({ label }: { label: string }) {
  return <div className="admin-loading-status" role="status">
    <span aria-hidden="true"><Spinner size={16} /></span>
    <span>{label}</span>
  </div>
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return <div className="admin-loading-rows" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => <div className={Classes.SKELETON} key={index} />)}
  </div>
}
