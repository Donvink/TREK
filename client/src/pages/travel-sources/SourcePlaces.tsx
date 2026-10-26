import type { ExtractedTravelPlace, StoredTravelSource, TravelPlaceClaim } from '@trek/shared';

// Also handles saved results from before uncertain names were classified explicitly.
const needsNameConfirmation = (place: ExtractedTravelPlace) =>
  place.name_status === 'needs_confirmation' || (place.name.length < 3 && !place.address);

function Claims({ label, claims }: { label: string; claims: TravelPlaceClaim[] }) {
  if (!claims.length) return <p className="text-xs text-content-secondary">{label}：原帖未明确提供</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-content-secondary">{label} · 帖子声称，尚未核验</p>
      {claims.map((claim, index) => (
        <div key={index} className="text-sm leading-7">
          <p className="break-words">{claim.text}</p>
          <details className="text-xs text-content-secondary">
            <summary className="cursor-pointer">查看依据</summary>
            <blockquote className="mt-1 border-l-2 border-edge pl-3">{claim.evidence}</blockquote>
          </details>
        </div>
      ))}
    </div>
  );
}

export default function SourcePlaces({
  note,
  busy,
  working,
  city,
  setCity,
  extract,
  confirm,
}: {
  note: StoredTravelSource;
  busy: boolean;
  working: boolean;
  city: string;
  setCity: (city: string) => void;
  extract: () => void;
  confirm: (placeId: string, candidateId: string) => void;
}) {
  const extraction = note.place_extraction;
  const unresolved = extraction?.places.filter(needsNameConfirmation).length ?? 0;
  return (
    <section className="mt-5 border-t border-edge pt-4" aria-label="攻略中的地点">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">
          攻略中的地点{extraction ? ` · ${extraction.places.length - unresolved} 处` : ''}
          {unresolved > 0 ? ` · ${unresolved} 条待确认线索` : ''}
        </h4>
        <button
          type="button"
          onClick={extract}
          disabled={busy || city.trim().length < 2 || note.status !== 'available'}
          className="rounded-lg border border-edge px-3 py-2 text-xs text-accent disabled:opacity-50"
        >
          {working ? '正在处理…' : extraction ? '重新提取 / 匹配' : '提取地点并匹配地图'}
        </button>
      </div>
      <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
        地图搜索城市
        <input
          aria-label="地图搜索城市"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          maxLength={100}
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-content"
        />
      </label>
      {!extraction && (
        <p className="mt-2 text-xs leading-6 text-content-secondary">
          提取正文中明确写出的地点名、地址与特色，再核对地图候选。
        </p>
      )}
      {extraction && (
        <p className="mt-2 text-xs text-content-secondary">
          地图搜索范围：{extraction.city} · 更新：{new Date(extraction.extracted_at).toLocaleString()}
        </p>
      )}
      {extraction?.stale && (
        <p className="mt-3 text-sm text-content-secondary">正文已更新，下面是旧版提取结果。请重新提取后再确认位置。</p>
      )}
      {extraction && extraction.places.length === 0 && (
        <p className="mt-3 text-sm text-content-secondary">未找到明确的地点名，需补充名称或地址。</p>
      )}
      <div className="mt-3 space-y-3">
        {extraction?.places.map((place) => (
          <div key={place.place_id} className="rounded-xl border border-edge p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="font-semibold">{needsNameConfirmation(place) ? '餐厅线索（店名待确认）' : place.name}</h5>
              <span className="text-xs text-content-secondary">
                {needsNameConfirmation(place) ? (
                  '名称信息不足'
                ) : (
                  <>
                    {place.kind === 'cafe' ? '咖啡店' : '餐饮地点'} ·{' '}
                    {place.selected_candidate_id ? '地图位置已由你确认' : '地图位置待确认'}
                  </>
                )}
              </span>
            </div>
            {needsNameConfirmation(place) && (
              <p className="mt-2 text-sm leading-7 text-content-secondary">
                正文中的名称片段不足以识别具体商家。需从图片或其他来源补充完整店名、地址后再匹配。
              </p>
            )}
            <p className="mt-2 break-words text-sm leading-7">
              {place.name_image_id ? '图片中的地址' : '原帖地址'}：{place.address ?? '未提供'}
            </p>
            <details className="mt-1 text-xs text-content-secondary">
              <summary className="cursor-pointer">
                {needsNameConfirmation(place)
                  ? '查看原文名称线索（未确认）'
                  : place.name_image_id
                    ? '店名与地址的图片依据'
                    : '地点名称的原文依据'}
              </summary>
              <blockquote className="mt-2 border-l-2 border-edge pl-3 leading-6">{place.name_evidence}</blockquote>
              {place.name_image_id && (
                <a
                  href={`/api/travel-sources/${note.source_id}/images/${place.name_image_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-accent"
                >
                  查看店名与地址的图片依据 ↗
                </a>
              )}
            </details>
            <div className="mt-4 space-y-4">
              <Claims label="特色" claims={place.features} />
              <Claims label="价格" claims={place.prices} />
              <Claims label="营业时间" claims={place.opening_hours} />
            </div>
            {!!place.warnings.length && (
              <ul className="mt-3 list-inside list-disc text-xs leading-6 text-content-secondary">
                {place.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {place.map_status === 'not_found' && (
              <p className="mt-3 text-xs text-content-secondary">地图未找到结果；可核对名称和搜索城市后重试。</p>
            )}
            <div className="mt-3 space-y-2">
              {(!needsNameConfirmation(place) ? place.candidates : []).map((candidate) => (
                <div key={candidate.candidate_id} className="rounded-lg bg-surface-secondary p-3 text-xs leading-6">
                  <a
                    href={candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-accent"
                  >
                    {candidate.name || '地图地址点'} ↗
                  </a>
                  <p className="break-words">{candidate.address}</p>
                  <p className="text-content-secondary">
                    OpenStreetMap ·{' '}
                    {candidate.match_basis === 'address' ? '按地址匹配，店名仍需核对' : '按名称搜索的候选'}
                  </p>
                  <button
                    type="button"
                    disabled={busy || extraction.stale || place.selected_candidate_id === candidate.candidate_id}
                    onClick={() => confirm(place.place_id, candidate.candidate_id)}
                    className="mt-2 rounded-md border border-edge px-3 py-1 text-accent disabled:opacity-50"
                  >
                    {place.selected_candidate_id === candidate.candidate_id ? '已确认此位置' : '确认是这个地点'}
                  </button>
                </div>
              ))}
            </div>
            <a
              href={extraction.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs text-accent"
            >
              查看信息来源：{note.title} ↗
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
