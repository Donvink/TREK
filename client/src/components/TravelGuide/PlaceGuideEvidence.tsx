import { ExternalLink } from 'lucide-react'
import FactStatusBadge from './FactStatusBadge'
import LegCheckRow from './LegCheckRow'
import { usePlaceGuideEvidence } from './usePlaceGuideEvidence'

const LOCATION_STATUS = { confirmed: 'verified', candidate: 'reference', unknown: 'unverified' } as const
const LOCATION_LABEL = { confirmed: '地图位置已确认', candidate: '地图位置为自动匹配', unknown: '地图位置未找到' } as const

/** "攻略依据": which notes recommend this place, the lines they say it in, and how its journeys were checked. */
export default function PlaceGuideEvidence({ tripId, placeId, className = '' }: { tripId: number | string | null | undefined; placeId: number | string; className?: string }) {
  const evidence = usePlaceGuideEvidence(tripId, placeId)
  if (!evidence) return null
  return (
    <section className={`${className} rounded-[10px] border border-edge-faint bg-surface-hover px-3 py-2.5 text-sm`} aria-label="攻略依据">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="font-semibold text-content">攻略依据</h4>
        <span className="flex items-center gap-1.5 text-xs text-content-muted">
          <FactStatusBadge status={LOCATION_STATUS[evidence.location_status]} />
          {LOCATION_LABEL[evidence.location_status]}
        </span>
      </div>
      {evidence.reasons.length > 0 && <p className="mb-1.5 text-xs text-content-secondary">{evidence.reasons.join(' · ')}</p>}
      <ul className="flex flex-col gap-1.5">
        {evidence.mentions.map((mention) => (
          <li key={mention.source_id}>
            {mention.source_url ? (
              <a href={mention.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent">
                {mention.source_title}
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            ) : (
              <span className="text-content-secondary">{mention.source_title}（手动添加）</span>
            )}
          </li>
        ))}
      </ul>
      <ul className="mt-1.5 flex flex-col gap-1">
        {evidence.evidence.slice(0, 4).map((item, i) => (
          <li key={i} className="border-l-2 border-edge pl-2 text-xs text-content-secondary">
            <span className="text-content-muted">{item.kind === 'image' ? `图 ${item.image_order}：` : '原文：'}</span>
            {item.quote}
          </li>
        ))}
      </ul>
      {evidence.warnings.length > 0 && <p className="mt-1.5 text-xs text-warning">{evidence.warnings.join('；')}</p>}
      {evidence.legs.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-edge-faint pt-2">
          {evidence.legs.map((leg, i) => <LegCheckRow key={i} leg={leg} />)}
        </ul>
      )}
    </section>
  )
}
