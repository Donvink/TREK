import { travelPlanCreateSchema, type TravelPlan } from '@trek/shared'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { travelPlansApi, travelProfileApi } from '../../api/travelPlans'
import { apiMessage, EMPTY_FORM, formToInput, type PlanForm } from './travelPlanModel'

export function useTravelPlans() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<TravelPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    travelPlansApi
      .list()
      .then((list) => { if (active) setPlans(list) })
      .catch(() => { if (active) setError('计划加载失败，请刷新重试。') })
      .finally(() => { if (active) setLoading(false) })
    // Start from the traveller's usual pace; anything they have already chosen wins.
    travelProfileApi
      .get()
      .then((view) => { if (active && view.profile) setForm((current) => (current === EMPTY_FORM ? { ...current, pace: view.profile!.pace } : current)) })
      .catch(() => { /* the form keeps its defaults without a profile */ })
    return () => { active = false }
  }, [])

  const update = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm((current) => ({ ...current, [key]: value }))

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const parsed = travelPlanCreateSchema.safeParse(formToInput(form))
    if (!parsed.success) {
      setError('请填写出发地、1–3 个目的地和日期（结束不早于开始，最多 14 天）。')
      return
    }
    setSaving(true)
    try {
      const detail = await travelPlansApi.create(parsed.data)
      navigate(`/travel-plans/${detail.plan.plan_id}`)
    } catch (err) {
      setError(apiMessage(err, '创建失败，请重试。'))
    } finally {
      setSaving(false)
    }
  }

  return { plans, loading, form, update, saving, error, create }
}
