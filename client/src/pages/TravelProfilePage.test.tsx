import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '../../tests/helpers/render'
import { server } from '../../tests/helpers/msw/server'
import TravelProfilePage from './TravelProfilePage'

const view = (extra = {}) => ({
  profile: null, updated_at: null, visited_count: 3,
  suggestions: [{ key: 'dislike:museum', text: '你好像不太喜欢博物馆，要记下来吗？', evidence: '在地点池里划掉过 3 处博物馆', change: { dislikes: 'museum' } }],
  signals: [{ id: 9, plan_id: 'p', kind: 'pool_decision', summary: '划掉了「埃及博物馆」', created_at: '2026-10-27T08:00:00.000Z' }],
  ...extra,
})

describe('TravelProfilePage', () => {
  it('FE-TRAVEL-PROFILE-001: saves the five answers, then accepts a suggestion only once there is a profile', async () => {
    let saved: Record<string, unknown> | null = null
    const savedView = view({ profile: { likes: ['cafe'], dislikes: ['bar'], pace: 'relaxed', walking: 'low', avoid: ['不吃辣', '排长队'] }, updated_at: '2026-10-27T09:00:00.000Z' })
    server.use(
      http.get('/api/travel-profile', () => HttpResponse.json(view())),
      http.put('/api/travel-profile', async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(savedView)
      }),
      http.post('/api/travel-profile/suggestions/:key/accept', () => HttpResponse.json({ ...savedView, suggestions: [] })),
    )
    render(<TravelProfilePage />)
    expect(await screen.findByText('你好像不太喜欢博物馆，要记下来吗？')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '记下' })).toBeDisabled()
    expect(screen.getByText(/已结束的行程里去过 3 处地点/)).toBeInTheDocument()

    const likes = screen.getByRole('group', { name: '1. 喜欢去哪类地方？' })
    const dislikes = screen.getByRole('group', { name: '2. 不太想去哪类？' })
    await userEvent.click(likes.querySelector('button:nth-child(2)')!) // 咖啡
    await userEvent.click(likes.querySelector('button:nth-child(3)')!) // 酒吧
    await userEvent.click(dislikes.querySelector('button:nth-child(3)')!) // 酒吧 moves to dislikes
    await userEvent.click(screen.getByRole('button', { name: /轻松/ }))
    await userEvent.click(screen.getByRole('button', { name: /少走路/ }))
    await userEvent.type(screen.getByLabelText(/5. 想避开的/), '不吃辣，排长队')
    await userEvent.click(screen.getByRole('button', { name: '保存画像' }))
    await waitFor(() => expect(saved).toEqual({ likes: ['cafe'], dislikes: ['bar'], pace: 'relaxed', walking: 'low', avoid: ['不吃辣', '排长队'] }))
    expect(await screen.findByText('已保存。新的计划会按这些偏好推荐。')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '记下' }))
    expect(await screen.findByText('已记下。')).toBeInTheDocument()
    expect(screen.queryByText('你好像不太喜欢博物馆，要记下来吗？')).not.toBeInTheDocument()
  })

  it('FE-TRAVEL-PROFILE-002: dismisses a suggestion, deletes a record, and clears everything after confirming', async () => {
    let cleared = false
    server.use(
      http.get('/api/travel-profile', () => HttpResponse.json(view())),
      http.post('/api/travel-profile/suggestions/:key/dismiss', () => HttpResponse.json(view({ suggestions: [] }))),
      http.delete('/api/travel-profile/signals/:id', () => HttpResponse.json(view({ suggestions: [], signals: [] }))),
      http.delete('/api/travel-profile', () => {
        cleared = true
        return HttpResponse.json(view({ suggestions: [], signals: [], visited_count: 3 }))
      }),
    )
    render(<TravelProfilePage />)
    await userEvent.click(await screen.findByRole('button', { name: '忽略' }))
    expect(await screen.findByText('已忽略，这条建议不会再出现。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '删除记录：划掉了「埃及博物馆」' }))
    expect(await screen.findByText('还没有记录。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '清空画像和全部记录' }))
    expect(cleared).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: '确认清空画像和全部记录' }))
    await waitFor(() => expect(cleared).toBe(true))
  })

  it('FE-TRAVEL-PROFILE-003: refuses too many things to avoid', async () => {
    server.use(http.get('/api/travel-profile', () => HttpResponse.json(view({ suggestions: [] }))))
    render(<TravelProfilePage />)
    await screen.findByText('划掉了「埃及博物馆」')
    await userEvent.type(screen.getByLabelText(/5. 想避开的/), Array.from({ length: 11 }, (_, i) => `项${i}`).join('，'))
    await userEvent.click(screen.getByRole('button', { name: '保存画像' }))
    expect(screen.getByRole('alert')).toHaveTextContent('最多 10 项')
  })
})
