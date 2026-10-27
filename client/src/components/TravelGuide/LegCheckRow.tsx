import type { TravelLegCheck } from '@trek/shared'
import FactStatusBadge from './FactStatusBadge'

/** One checked journey: what was found, when it was asked, and where to check it yourself. */
export default function LegCheckRow({ leg }: { leg: TravelLegCheck }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <FactStatusBadge status={leg.status} />
      <div className="min-w-0">
        <div className="text-content">
          {leg.from_name} → {leg.to_name}
          {leg.departure && <span className="ml-2 text-content-secondary">{`${leg.departure}–${leg.arrival}`}</span>}
        </div>
        <div className="text-xs text-content-muted">
          {leg.summary}
          <a href={leg.check_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-accent">
            自己查一遍
          </a>
          <span className="ml-2">{`查询于 ${new Date(leg.checked_at).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}`}</span>
        </div>
      </div>
    </li>
  )
}
