import type { TravelStay } from '@trek/shared'

interface Props {
  stays: TravelStay[]
  busy: string | null
  hotelQueries: Record<number, string>
  setHotelQuery: (stayIndex: number, query: string) => void
  setHotel: (stayIndex: number) => void
}

/** Where to sleep: the area and why, search links with the dates filled in, and the hotel once booked. */
export default function StayList({ stays, busy, hotelQueries, setHotelQuery, setHotel }: Props) {
  if (!stays.length) return null
  return (
    <section className="mt-6 rounded-xl border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold">4. 住宿</h2>
      <p className="mt-1 text-sm text-content-secondary">
        按到达车站和这几天的地点推荐住哪一片。价格和空房以预订网站为准；链接不带推广佣金参数。订好后填入酒店名，行程会以酒店为起点和终点重新核验。
      </p>
      <ul className="mt-4 flex flex-col gap-4">
        {stays.map((stay, i) => (
          <li key={stay.city} className="rounded-lg border border-edge px-4 py-3">
            <div className="font-medium">{stay.city} · {stay.check_in} 入住，{stay.check_out} 退房 · {stay.nights} 晚</div>
            <div className="mt-1 text-sm">推荐住在 <span className="font-medium">{stay.area.name}</span> 附近</div>
            {stay.reasons.length > 0 && <div className="text-xs text-content-secondary">{stay.reasons.join(' · ')}</div>}
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <a href={stay.booking_url} target="_blank" rel="noopener noreferrer" className="text-accent">在 Booking 搜索这片的酒店 ↗</a>
              <a href={stay.maps_url} target="_blank" rel="noopener noreferrer" className="text-accent">在地图上看附近酒店 ↗</a>
            </div>
            {stay.hotel ? (
              <p className="mt-2 text-sm text-success">已设为住宿：{stay.hotel.name}{stay.hotel.address ? `（${stay.hotel.address}）` : ''}</p>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor={`hotel-${i}`} className="text-sm">订好了？</label>
                <input id={`hotel-${i}`} value={hotelQueries[i] ?? ''} onChange={(e) => setHotelQuery(i, e.target.value)} placeholder="酒店名称或地址"
                  className="min-w-0 flex-1 rounded-lg border border-edge bg-surface-input px-3 py-1.5 text-sm text-content" />
                <button type="button" onClick={() => setHotel(i)} disabled={busy !== null || (hotelQueries[i] ?? '').trim().length < 2}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-text disabled:opacity-60">
                  {busy === `hotel:${i}` ? '设置中…' : '设为住宿'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
