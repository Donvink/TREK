import type { TravelPlan, TravelPoolPlace } from '@trek/shared'
import { Link } from 'react-router'
import LegCheckRow from '../../components/TravelGuide/LegCheckRow'

interface Props {
  plan: TravelPlan
  includedCount: number
  poolByKey: Map<string, TravelPoolPlace>
  busy: string | null
  generate: () => void
}

/** Generate the trip, then show what went where and how each journey was checked. */
export default function PlanResult({ plan, includedCount, poolByKey, busy, generate }: Props) {
  const counts = plan.legs.reduce((acc, leg) => ({ ...acc, [leg.status]: (acc[leg.status] ?? 0) + 1 }), {} as Record<string, number>)
  return (
    <section className="mt-6 rounded-xl border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold">3. 生成行程</h2>
      <p className="mt-1 text-sm text-content-secondary">
        把已选的 {includedCount} 处地点排进每天，查询出行日期当天的公共交通，生成一个可以继续修改、邀请同伴的 TREK 行程。
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={generate} disabled={busy !== null || includedCount === 0}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-text disabled:opacity-60">
          {busy === 'generate' ? '生成中，正在查询交通…' : plan.trip_id ? '重新生成（新建一个行程）' : '生成行程'}
        </button>
        {plan.trip_id && <Link to={`/trips/${plan.trip_id}`} className="text-accent">打开生成的行程 →</Link>}
      </div>

      {plan.generated_at && (
        <div className="mt-5">
          <p className="text-sm text-content-secondary">
            交通核验：已核验 {counts.verified ?? 0} 段 · 参考 {counts.reference ?? 0} 段 · 未核验 {counts.unverified ?? 0} 段
          </p>
          <ol className="mt-3 flex flex-col gap-4">
            {plan.days.map((day) => (
              <li key={day.day_index}>
                <h3 className="font-medium">第 {day.day_index + 1} 天 · {day.date} · {day.city}</h3>
                <p className="text-sm text-content-secondary">
                  {day.pool_keys.length ? day.pool_keys.map((key) => poolByKey.get(key)?.name ?? '（已移出地点池）').join(' → ') : '没有安排地点'}
                </p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {plan.legs.filter((leg) => leg.day_index === day.day_index).map((leg, i) => <LegCheckRow key={i} leg={leg} />)}
                </ul>
              </li>
            ))}
          </ol>
          {plan.unplaced.length > 0 && (
            <div className="mt-4 text-sm">
              <h3 className="font-medium">未排入日程</h3>
              <ul className="text-content-secondary">
                {plan.unplaced.map((item) => <li key={item.pool_key}>{poolByKey.get(item.pool_key)?.name ?? item.pool_key}：{item.reason}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
