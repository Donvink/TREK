import { Link } from 'react-router'
import PageShell from '../components/Layout/PageShell'
import { FOCUS_OPTIONS, PACE_OPTIONS } from './travel-plan/travelPlanModel'
import { useTravelPlans } from './travel-plan/useTravelPlans'

const fieldClass = 'mt-1 w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-content'

export default function TravelPlansPage() {
  const { plans, loading, form, update, saving, error, create } = useTravelPlans()

  return (
    <PageShell className="bg-surface-secondary">
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 text-content md:pb-8">
        <Link to="/travel-sources" className="text-sm text-accent">管理攻略素材</Link>
        <h1 className="mt-4 text-2xl font-bold">从攻略生成行程</h1>
        <p className="mt-2 text-content-secondary">
          选目的地和日期，系统从你导入的小红书攻略里整理地点，你取舍后生成一份标准行程，交通按出行日期查询核验。
        </p>

        <form onSubmit={create} className="mt-6 grid gap-4 rounded-xl border border-edge bg-surface-card p-5 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            行程名称
            <input id="plan-title" className={fieldClass} value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="例如：都灵四日" maxLength={120} />
          </label>
          <label className="text-sm">
            出发地（也是返回地）
            <input id="plan-origin" className={fieldClass} value={form.origin} onChange={(e) => update('origin', e.target.value)} required />
          </label>
          <label className="text-sm">
            人数
            <input id="plan-travellers" type="number" min={1} max={10} className={fieldClass} value={form.travellers} onChange={(e) => update('travellers', e.target.value)} />
          </label>
          <label className="text-sm sm:col-span-2">
            目的地（每行一个，最多 3 个，按游览顺序）
            <textarea id="plan-destinations" rows={2} className={fieldClass} value={form.destinations} onChange={(e) => update('destinations', e.target.value)} required />
          </label>
          <label className="text-sm">
            出发日期
            <input id="plan-start" type="date" className={fieldClass} value={form.start_date} onChange={(e) => update('start_date', e.target.value)} required />
          </label>
          <label className="text-sm">
            返回日期
            <input id="plan-end" type="date" className={fieldClass} value={form.end_date} onChange={(e) => update('end_date', e.target.value)} required />
          </label>
          <fieldset className="text-sm">
            <legend>侧重</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map((option) => (
                <button key={option.value} type="button" aria-pressed={form.focus === option.value} onClick={() => update('focus', option.value)}
                  className={`rounded-full border px-3 py-1 ${form.focus === option.value ? 'border-accent bg-accent text-accent-text' : 'border-edge text-content-secondary'}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-sm">
            <legend>节奏</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {PACE_OPTIONS.map((option) => (
                <button key={option.value} type="button" aria-pressed={form.pace === option.value} onClick={() => update('pace', option.value)} title={option.hint}
                  className={`rounded-full border px-3 py-1 ${form.pace === option.value ? 'border-accent bg-accent text-accent-text' : 'border-edge text-content-secondary'}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-text disabled:opacity-60">
              {saving ? '创建中…' : '创建计划'}
            </button>
          </div>
        </form>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">我的计划</h2>
          {loading ? (
            <p className="mt-3 text-content-muted">加载中…</p>
          ) : plans.length === 0 ? (
            <p className="mt-3 text-content-muted">还没有计划。填上面的表单创建第一个。</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {plans.map((plan) => (
                <li key={plan.plan_id}>
                  <Link to={`/travel-plans/${plan.plan_id}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-edge bg-surface-card px-4 py-3 text-content no-underline">
                    <span className="font-medium">{plan.title}</span>
                    <span className="text-sm text-content-muted">
                      {plan.origin} → {plan.destinations.join(' → ')} · {plan.start_date} 至 {plan.end_date}
                      {plan.trip_id ? ' · 已生成行程' : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </PageShell>
  )
}
