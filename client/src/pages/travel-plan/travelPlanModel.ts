import type { TravelPlaceKind, TravelPlanFocus, TravelPlanInput, TravelPlanPace } from '@trek/shared'

export const FOCUS_OPTIONS: { value: TravelPlanFocus; label: string }[] = [
  { value: 'mixed', label: '综合' },
  { value: 'food', label: '美食' },
  { value: 'nature', label: '自然风光' },
  { value: 'culture', label: '人文艺术' },
]

export const PACE_OPTIONS: { value: TravelPlanPace; label: string; hint: string }[] = [
  { value: 'relaxed', label: '轻松', hint: '每天约 3 处' },
  { value: 'normal', label: '适中', hint: '每天约 4 处' },
  { value: 'packed', label: '紧凑', hint: '每天约 6 处' },
]

export const KIND_LABELS: Record<TravelPlaceKind, string> = {
  restaurant: '餐厅', cafe: '咖啡', bar: '酒吧', attraction: '景点', museum: '博物馆', nature: '自然', shop: '购物', place: '地点',
}

export interface PlanForm {
  title: string
  origin: string
  destinations: string
  start_date: string
  end_date: string
  travellers: string
  focus: TravelPlanFocus
  pace: TravelPlanPace
}

export const EMPTY_FORM: PlanForm = {
  title: '', origin: 'Bellinzona', destinations: 'Torino, Italy', start_date: '', end_date: '',
  travellers: '2', focus: 'mixed', pace: 'normal',
}

/** Form text to the request body; destinations are one per line or separated by commas outside the city name. */
export function formToInput(form: PlanForm): TravelPlanInput {
  return {
    title: form.title.trim() || `${form.destinations.split('\n')[0]?.split(',')[0] ?? '旅行'} 行程`,
    origin: form.origin.trim(),
    destinations: form.destinations.split('\n').map((d) => d.trim()).filter(Boolean),
    start_date: form.start_date,
    end_date: form.end_date,
    travellers: Number(form.travellers) || 1,
    focus: form.focus,
    pace: form.pace,
  }
}

export function apiMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } }).response?.data
  const text = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : null
  return text ? `${fallback}（${text}）` : fallback
}
