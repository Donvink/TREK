import { Link } from 'react-router'
import PageShell from '../components/Layout/PageShell'
import PlacePool from './travel-plan/PlacePool'
import PlanResult from './travel-plan/PlanResult'
import SourceList from './travel-plan/SourceList'
import PriceQuestion from './travel-plan/PriceQuestion'
import StayList from './travel-plan/StayList'
import { FOCUS_OPTIONS } from './travel-plan/travelPlanModel'
import { useTravelPlan } from './travel-plan/useTravelPlan'

export default function TravelPlanPage() {
  const {
    detail, loading, busy, error, extractCity, setExtractCity,
    extract, extractPending, setFocus, decide, generate, askingPrice, answerPrice, checkWeather, applyWeather, hotelQueries, setHotelQuery, setHotel, included, poolByKey,
  } = useTravelPlan()

  return (
    <PageShell className="bg-surface-secondary">
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 text-content md:pb-8">
        <Link to="/travel-plans" className="text-sm text-accent">全部计划</Link>
        {loading && <p className="mt-6 text-content-muted">加载中…</p>}
        {!loading && !detail && <p role="alert" className="mt-6 text-danger">{error || '计划不存在。'}</p>}
        {detail && (
          <>
            <h1 className="mt-4 text-2xl font-bold">{detail.plan.title}</h1>
            <p className="mt-1 text-content-secondary">
              {detail.plan.origin} → {detail.plan.destinations.join(' → ')} → {detail.plan.origin} · {detail.plan.start_date} 至 {detail.plan.end_date} ·{' '}
              {detail.plan.travellers} 人 · {FOCUS_OPTIONS.find((option) => option.value === detail.plan.focus)?.label}
            </p>
            {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <SourceList sources={detail.sources} destinations={detail.plan.destinations} extractCity={extractCity} setExtractCity={setExtractCity}
              busy={busy} extract={extract} extractPending={extractPending} />
            <PlacePool pool={detail.pool} focus={detail.plan.focus} busy={busy} setFocus={setFocus} decide={decide} />
            {askingPrice && <PriceQuestion answer={answerPrice} />}
            <PlanResult plan={detail.plan} includedCount={included.length} poolByKey={poolByKey} busy={busy} generate={generate}
              checkWeather={checkWeather} applyWeather={applyWeather} />
            <StayList stays={detail.plan.stays ?? []} busy={busy} hotelQueries={hotelQueries} setHotelQuery={setHotelQuery} setHotel={setHotel} />
          </>
        )}
      </main>
    </PageShell>
  )
}
