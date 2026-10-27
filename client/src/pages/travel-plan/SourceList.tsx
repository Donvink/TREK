import type { TravelPlanDetail } from '@trek/shared'
import { Link } from 'react-router'

interface Props {
  sources: TravelPlanDetail['sources']
  destinations: string[]
  extractCity: string
  setExtractCity: (city: string) => void
  busy: string | null
  extract: (sourceId: string, refresh: boolean) => void
  extractPending: () => void
}

function status(source: TravelPlanDetail['sources'][number]) {
  if (!source.extracted) return '未提取'
  if (source.stale) return '原文已更新，需重新提取'
  return `已提取（${source.extractor === 'llm' ? '正文 + 图片文字' : '仅正文规则'}）· ${source.city}`
}

/** The imported notes: which ones feed this plan, and a button to read places out of each. */
export default function SourceList({ sources, destinations, extractCity, setExtractCity, busy, extract, extractPending }: Props) {
  return (
    <section className="mt-6 rounded-xl border border-edge bg-surface-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">1. 攻略素材</h2>
        <Link to="/travel-sources" className="text-sm text-accent">导入更多帖子</Link>
      </div>
      <p className="mt-1 text-sm text-content-secondary">
        提取会读取帖子正文和图片中识别出的文字，每个地点都要能在原文里找到依据。
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="extract-city">按目的地提取：</label>
        <select id="extract-city" value={extractCity} onChange={(e) => setExtractCity(e.target.value)} className="rounded-lg border border-edge bg-surface-input px-2 py-1 text-content">
          {destinations.map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
        <button type="button" onClick={extractPending} disabled={busy !== null} className="rounded-lg border border-edge px-3 py-1 text-content-secondary disabled:opacity-60">
          {busy === 'extract:all' ? '提取中…' : '更新这些目的地的已提取帖子'}
        </button>
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-edge-faint">
        {sources.map((source) => (
          <li key={source.source_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="truncate text-content">{source.title}</div>
              <div className="text-xs text-content-muted">{status(source)}</div>
            </div>
            <button type="button" disabled={busy !== null} onClick={() => extract(source.source_id, source.extracted)}
              className="shrink-0 rounded-lg border border-edge px-3 py-1 text-sm text-content-secondary disabled:opacity-60">
              {busy === `extract:${source.source_id}` ? '提取中…' : source.extracted ? '重新提取' : '提取地点'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
