import type { TravelPlanDetail, TravelPlanFocus } from '@trek/shared'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { travelPlansApi } from '../../api/travelPlans'
import { apiMessage } from './travelPlanModel'

export function useTravelPlan() {
  const { planId = '' } = useParams()
  const [detail, setDetail] = useState<TravelPlanDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [extractCity, setExtractCity] = useState('')
  const [hotelQueries, setHotelQueries] = useState<Record<number, string>>({})

  useEffect(() => {
    let active = true
    setLoading(true)
    travelPlansApi
      .get(planId)
      .then((data) => {
        if (!active) return
        setDetail(data)
        setExtractCity(data.plan.destinations[0] ?? '')
      })
      .catch(() => { if (active) setError('计划不存在或加载失败。') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [planId])

  /** Run one change; on failure keep the last good state and say what went wrong. */
  async function run(key: string, action: () => Promise<TravelPlanDetail | null>, failure: string) {
    setBusy(key)
    setError('')
    try {
      const next = await action()
      setDetail(next ?? (await travelPlansApi.get(planId)))
    } catch (err) {
      setError(apiMessage(err, failure))
    } finally {
      setBusy(null)
    }
  }

  const extract = (sourceId: string, refresh: boolean) =>
    run(`extract:${sourceId}`, async () => {
      await travelPlansApi.extract(sourceId, extractCity, refresh)
      return null
    }, '地点提取失败，可稍后重试。')

  const extractPending = () =>
    run('extract:all', async () => {
      // Only notes already tied to one of the destinations; a new note is extracted on its own button.
      const destinations = detail?.plan.destinations ?? []
      for (const source of detail?.sources ?? []) {
        if (source.city && destinations.includes(source.city) && (source.stale || source.extractor !== 'llm')) {
          await travelPlansApi.extract(source.source_id, source.city, true)
        }
      }
      return null
    }, '部分素材提取失败，已完成的结果已保存。')

  const setFocus = (focus: TravelPlanFocus) => run('focus', () => travelPlansApi.setFocus(planId, focus), '切换侧重失败。')
  const decide = (poolKey: string, decision: 'include' | 'exclude' | null) =>
    run(`decide:${poolKey}`, () => travelPlansApi.decide(planId, poolKey, decision), '保存取舍失败。')
  const generate = () => run('generate', () => travelPlansApi.generate(planId), '生成行程失败，请重试。')
  const setHotelQuery = (stayIndex: number, query: string) => setHotelQueries((current) => ({ ...current, [stayIndex]: query }))
  const setHotel = (stayIndex: number) =>
    run(`hotel:${stayIndex}`, () => travelPlansApi.setHotel(planId, stayIndex, (hotelQueries[stayIndex] ?? '').trim()), '找不到这家酒店，请换成完整名称或地址再试。')
  const checkWeather = () => run('weather', () => travelPlansApi.weatherCheck(planId), '天气查询失败，请稍后重试。')
  const applyWeather = (dayIndex: number, swaps: { from_key: string; to_key: string }[]) =>
    run(`weather:${dayIndex}`, () => travelPlansApi.weatherApply(planId, dayIndex, swaps), '替换失败：这一天可能已在行程里改过，请到行程里调整。')

  const included = useMemo(() => detail?.pool.filter((place) => place.included) ?? [], [detail])
  const poolByKey = useMemo(() => new Map((detail?.pool ?? []).map((place) => [place.pool_key, place])), [detail])

  return {
    detail, loading, busy, error, extractCity, setExtractCity,
    extract, extractPending, setFocus, decide, generate, checkWeather, applyWeather, hotelQueries, setHotelQuery, setHotel, included, poolByKey,
  }
}
