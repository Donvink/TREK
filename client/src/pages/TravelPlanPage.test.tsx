import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { render, screen, waitFor } from '../../tests/helpers/render'
import { server } from '../../tests/helpers/msw/server'
import TravelPlanPage from './TravelPlanPage'
import TravelPlansPage from './TravelPlansPage'

const planId = 'a'.repeat(16)
const basePlan = {
  plan_id: planId, title: '都灵四日', origin: 'Bellinzona', destinations: ['Torino, Italy'], start_date: '2026-11-10', end_date: '2026-11-12',
  travellers: 2, focus: 'food', pace: 'normal', created_at: '', updated_at: '', trip_id: null, generated_at: null, days: [], legs: [], unplaced: [],
}
const poolPlace = (key: string, name: string, extra = {}) => ({
  pool_key: key, name, address: 'Via Test 1', city: 'Torino, Italy', kind: 'restaurant', lat: 45, lng: 7, location_status: 'confirmed', osm_id: null,
  mentions: [{ source_id: 's1', source_title: '都灵美食', source_url: 'https://www.xiaohongshu.com/explore/s1', place_id: 'p', sentiment: 'positive' }],
  evidence: [{ kind: 'text', image_id: null, image_order: null, quote: `${name} 很好吃` }], warnings: [],
  recommended: true, reasons: ['1 篇帖子提到', '符合「美食」侧重'], decision: null, included: true, ...extra,
})
const detail = (plan = {}, pool = [poolPlace('1'.repeat(16), 'House Jia'), poolPlace('2'.repeat(16), 'Al Jazira', { recommended: false, included: false })]) => ({
  plan: { ...basePlan, ...plan },
  pool,
  sources: [
    { source_id: '6a24184d000000001002d000', title: '都灵 中餐厅', city: 'Torino, Italy', extracted: true, extractor: 'llm', stale: false },
    { source_id: '6abcd3ba000000000a01fb7e', title: '大卖场美食', city: null, extracted: false, extractor: null, stale: false },
  ],
})

const renderPlan = () => render(
  <Routes><Route path="/travel-plans/:planId" element={<TravelPlanPage />} /></Routes>,
  { initialEntries: [`/travel-plans/${planId}`] },
)

describe('TravelPlanPage', () => {
  it('FE-TRAVEL-PLAN-001: lists sources and the pool with reasons, and saves a keep or drop', async () => {
    let decision: unknown = null
    server.use(
      http.get(`/api/travel-plans/${planId}`, () => HttpResponse.json(detail())),
      http.post(`/api/travel-plans/${planId}/decisions`, async ({ request }) => {
        decision = await request.json()
        return HttpResponse.json(detail({}, [poolPlace('1'.repeat(16), 'House Jia', { decision: 'exclude', included: false })]))
      }),
    )
    renderPlan()
    expect(await screen.findByRole('heading', { name: '都灵四日' })).toBeInTheDocument()
    expect(screen.getByText('已提取（正文 + 图片文字）· Torino, Italy')).toBeInTheDocument()
    expect(screen.getByText('未提取')).toBeInTheDocument()
    expect(screen.getByText('共 2 处，已选 1 处。推荐按侧重、提及次数和评价排序；保留或划掉会覆盖推荐。')).toBeInTheDocument()
    expect(screen.getAllByText(/符合「美食」侧重/)).toHaveLength(2)
    await userEvent.click(screen.getAllByRole('button', { name: '划掉' })[0])
    await waitFor(() => expect(decision).toEqual({ pool_key: '1'.repeat(16), decision: 'exclude' }))
    expect(await screen.findByText(/已选 0 处/)).toBeInTheDocument()
  })

  it('FE-TRAVEL-PLAN-002: extracts a note, switches focus and generates the trip with checked journeys', async () => {
    let extracted = ''
    let focus: unknown = null
    const generated = detail({
      trip_id: 42, generated_at: '2026-10-27T08:00:00.000Z',
      days: [{ day_index: 0, date: '2026-11-10', city: 'Torino, Italy', pool_keys: ['1'.repeat(16)] }],
      legs: [
        { day_index: 0, date: '2026-11-10', from_name: 'Bellinzona', to_name: 'Torino, Italy', status: 'verified', departure: '08:12', arrival: '11:05', duration_minutes: 173, transfers: 1, summary: 'EC 12，换乘 1 次', check_url: 'https://maps.example', checked_at: '2026-10-27T08:00:00.000Z' },
        { day_index: 0, date: '2026-11-10', from_name: 'Torino, Italy', to_name: 'Bellinzona', status: 'unverified', departure: null, arrival: null, duration_minutes: null, transfers: null, summary: '这一天查不到公共交通班次，请到官方网站确认', check_url: 'https://maps.example', checked_at: '2026-10-27T08:00:00.000Z' },
      ],
      unplaced: [{ pool_key: '2'.repeat(16), reason: '地图位置未找到，未排入日程' }],
    })
    server.use(
      http.get(`/api/travel-plans/${planId}`, () => HttpResponse.json(detail())),
      http.post('/api/travel-sources/:sourceId/places/extract', ({ params }) => {
        extracted = String(params.sourceId)
        return HttpResponse.json({ places: [] })
      }),
      http.patch(`/api/travel-plans/${planId}/focus`, async ({ request }) => {
        focus = await request.json()
        return HttpResponse.json(detail({ focus: 'nature' }))
      }),
      http.post(`/api/travel-plans/${planId}/generate`, () => HttpResponse.json(generated)),
    )
    renderPlan()
    await userEvent.click(await screen.findByRole('button', { name: '提取地点' }))
    await waitFor(() => expect(extracted).toBe('6abcd3ba000000000a01fb7e'))
    await userEvent.click(screen.getByRole('button', { name: '自然风光' }))
    await waitFor(() => expect(focus).toEqual({ focus: 'nature' }))
    await userEvent.click(screen.getByRole('button', { name: '生成行程' }))
    expect(await screen.findByText('交通核验：已核验 1 段 · 参考 0 段 · 未核验 1 段')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开生成的行程 →' })).toHaveAttribute('href', '/trips/42')
    expect(screen.getByText('Al Jazira：地图位置未找到，未排入日程')).toBeInTheDocument()
    expect(screen.getByText('未核验')).toBeInTheDocument()
  })

  it('FE-TRAVEL-PLAN-003: keeps the plan on screen and says why when generation fails', async () => {
    server.use(
      http.get(`/api/travel-plans/${planId}`, () => HttpResponse.json(detail())),
      http.post(`/api/travel-plans/${planId}/generate`, () => HttpResponse.json({ error: 'No places included' }, { status: 400 })),
    )
    renderPlan()
    await userEvent.click(await screen.findByRole('button', { name: '生成行程' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('生成行程失败，请重试。（No places included）')
    expect(screen.getByRole('heading', { name: '都灵四日' })).toBeInTheDocument()
  })

  it('FE-TRAVEL-PLAN-004: reports a missing plan', async () => {
    server.use(http.get(`/api/travel-plans/${planId}`, () => HttpResponse.json({ error: 'Plan not found' }, { status: 404 })))
    renderPlan()
    expect(await screen.findByRole('alert')).toHaveTextContent('计划不存在或加载失败。')
  })
})

describe('TravelPlansPage', () => {
  const renderList = () => render(
    <Routes>
      <Route path="/travel-plans" element={<TravelPlansPage />} />
      <Route path="/travel-plans/:planId" element={<p>opened plan</p>} />
    </Routes>,
    { initialEntries: ['/travel-plans'] },
  )

  it('FE-TRAVEL-PLANS-001: lists plans, refuses an incomplete form and opens a created plan', async () => {
    let body: Record<string, unknown> | null = null
    server.use(
      http.get('/api/travel-plans', () => HttpResponse.json({ plans: [{ ...basePlan, trip_id: 3 }] })),
      http.post('/api/travel-plans', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(detail())
      }),
    )
    const { container } = renderList()
    expect(await screen.findByText('都灵四日')).toBeInTheDocument()
    expect(screen.getByText(/已生成行程/)).toBeInTheDocument()

    const form = container.querySelector('form')!
    form.noValidate = true
    await userEvent.click(screen.getByRole('button', { name: '创建计划' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('请填写出发地')

    await userEvent.type(screen.getByLabelText('出发日期'), '2026-11-10')
    await userEvent.type(screen.getByLabelText('返回日期'), '2026-11-12')
    await userEvent.click(screen.getByRole('button', { name: '美食' }))
    await userEvent.click(screen.getByRole('button', { name: '轻松' }))
    await userEvent.click(screen.getByRole('button', { name: '创建计划' }))
    expect(await screen.findByText('opened plan')).toBeInTheDocument()
    expect(body).toMatchObject({ origin: 'Bellinzona', destinations: ['Torino, Italy'], focus: 'food', pace: 'relaxed', travellers: 2 })
  })

  it('FE-TRAVEL-PLANS-002: says when there are no plans yet', async () => {
    server.use(http.get('/api/travel-plans', () => HttpResponse.json({ plans: [] })))
    renderList()
    expect(await screen.findByText('还没有计划。填上面的表单创建第一个。')).toBeInTheDocument()
  })
})
