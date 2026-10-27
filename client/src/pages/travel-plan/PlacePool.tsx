import type { TravelPlanFocus, TravelPoolPlace } from '@trek/shared'
import FactStatusBadge from '../../components/TravelGuide/FactStatusBadge'
import { FOCUS_OPTIONS, KIND_LABELS } from './travelPlanModel'

const LOCATION = { confirmed: 'verified', candidate: 'reference', unknown: 'unverified' } as const

interface Props {
  pool: TravelPoolPlace[]
  focus: TravelPlanFocus
  busy: string | null
  setFocus: (focus: TravelPlanFocus) => void
  decide: (poolKey: string, decision: 'include' | 'exclude' | null) => void
}

/** Every place the notes mention, with the reason it is or is not recommended, and the reader's keep or drop. */
export default function PlacePool({ pool, focus, busy, setFocus, decide }: Props) {
  const includedCount = pool.filter((place) => place.included).length
  return (
    <section className="mt-6 rounded-xl border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold">2. 地点池</h2>
      <p className="mt-1 text-sm text-content-secondary">
        共 {pool.length} 处，已选 {includedCount} 处。推荐按侧重、提及次数和评价排序；保留或划掉会覆盖推荐。
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="侧重">
        {FOCUS_OPTIONS.map((option) => (
          <button key={option.value} type="button" aria-pressed={focus === option.value} disabled={busy !== null} onClick={() => setFocus(option.value)}
            className={`rounded-full border px-3 py-1 text-sm ${focus === option.value ? 'border-accent bg-accent text-accent-text' : 'border-edge text-content-secondary'}`}>
            {option.label}
          </button>
        ))}
      </div>
      {pool.length === 0 && <p className="mt-4 text-content-muted">还没有地点。先在上面提取帖子。</p>}
      <ul className="mt-4 flex flex-col gap-3">
        {pool.map((place) => (
          <li key={place.pool_key} className={`rounded-lg border px-4 py-3 ${place.included ? 'border-accent' : 'border-edge opacity-80'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-content">
                  {place.name}
                  <span className="ml-2 text-xs font-normal text-content-muted">{KIND_LABELS[place.kind]}</span>
                  {place.recommended && <span className="ml-2 rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent-on">推荐</span>}
                </div>
                {place.address && <div className="text-xs text-content-muted">{place.address}</div>}
              </div>
              <div className="flex shrink-0 gap-1.5 text-sm">
                <button type="button" disabled={busy !== null} aria-pressed={place.decision === 'include'}
                  onClick={() => decide(place.pool_key, place.decision === 'include' ? null : 'include')}
                  className={`rounded-lg border px-2.5 py-1 ${place.decision === 'include' ? 'border-success bg-success-soft text-success' : 'border-edge text-content-secondary'}`}>
                  保留
                </button>
                <button type="button" disabled={busy !== null} aria-pressed={place.decision === 'exclude'}
                  onClick={() => decide(place.pool_key, place.decision === 'exclude' ? null : 'exclude')}
                  className={`rounded-lg border px-2.5 py-1 ${place.decision === 'exclude' ? 'border-danger bg-danger-soft text-danger' : 'border-edge text-content-secondary'}`}>
                  划掉
                </button>
              </div>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-content-secondary">
              <FactStatusBadge status={LOCATION[place.location_status]} />
              {place.reasons.join(' · ')}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {place.evidence.slice(0, 2).map((item, i) => (
                <li key={i} className="border-l-2 border-edge pl-2 text-xs text-content-secondary">
                  <span className="text-content-muted">{item.kind === 'image' ? `图 ${item.image_order}：` : '原文：'}</span>{item.quote}
                </li>
              ))}
            </ul>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
              {place.mentions.map((mention) => mention.source_url
                ? <a key={mention.source_id} href={mention.source_url} target="_blank" rel="noopener noreferrer" className="text-accent">{mention.source_title}</a>
                : <span key={mention.source_id} className="text-content-secondary">{mention.source_title}（手动添加）</span>)}
            </div>
            {place.warnings.length > 0 && <p className="mt-1 text-xs text-warning">{place.warnings.join('；')}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
