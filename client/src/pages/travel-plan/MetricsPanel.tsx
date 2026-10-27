import type { TravelMetrics } from '@trek/shared'

const KIND_LABELS: Record<string, string> = {
  plan_created: '新建计划', import_manual: '手动添加攻略', extract: '提取地点', decide: '地点取舍', generate: '生成行程',
  weather_check: '天气检查', weather_apply: '天气替换', set_hotel: '设置住宿',
}

/** Validation numbers for the admin: how far people get, how long it takes, what they would pay. */
export default function MetricsPanel({ metrics }: { metrics: TravelMetrics }) {
  const answered = metrics.price_test.would_pay + metrics.price_test.would_not_pay
  return (
    <section className="mt-8 rounded-xl border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold">使用指标（仅管理员可见）</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div><dt className="text-content-muted">用户</dt><dd className="text-lg font-semibold">{metrics.users}</dd></div>
        <div><dt className="text-content-muted">计划 / 已生成</dt><dd className="text-lg font-semibold">{metrics.plans} / {metrics.generated_plans}</dd></div>
        <div><dt className="text-content-muted">建计划到生成（中位数）</dt><dd className="text-lg font-semibold">{metrics.median_minutes_to_trip === null ? '—' : `${Math.round(metrics.median_minutes_to_trip)} 分钟`}</dd></div>
        <div><dt className="text-content-muted">每次提取的地点</dt><dd className="text-lg font-semibold">{metrics.places_per_extraction ?? '—'}</dd></div>
        <div><dt className="text-content-muted">交通：已核验 / 参考 / 未核验</dt><dd className="text-lg font-semibold">{metrics.legs.verified} / {metrics.legs.reference} / {metrics.legs.unverified}</dd></div>
        <div><dt className="text-content-muted">愿意付费</dt><dd className="text-lg font-semibold">{answered ? `${metrics.price_test.would_pay} / ${answered}` : '—'}</dd></div>
      </dl>
      {metrics.events.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-content-muted"><tr><th className="py-1 font-medium">操作</th><th className="font-medium">次数</th><th className="font-medium">失败</th><th className="font-medium">平均耗时</th></tr></thead>
            <tbody>
              {metrics.events.map((event) => (
                <tr key={event.kind} className="border-t border-edge-faint">
                  <td className="py-1">{KIND_LABELS[event.kind] ?? event.kind}</td>
                  <td>{event.count}</td>
                  <td>{event.failed}</td>
                  <td>{(event.avg_ms / 1000).toFixed(1)} 秒</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
