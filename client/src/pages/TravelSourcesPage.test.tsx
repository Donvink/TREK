import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '../../tests/helpers/render'
import { server } from '../../tests/helpers/msw/server'
import TravelSourcesPage from './TravelSourcesPage'

const note = (id: string, title: string, url: string) => ({
  url, title, author: null, published_at: null, collected_at: '2026-10-27T00:00:00.000Z', content: '正文', status: 'available',
  failure_reason: null, source_id: id, query: '手动导入', content_hash: 'h', images: [], saved_image_ids: [], read_image_ids: [],
})

describe('TravelSourcesPage', () => {
  it('FE-TRAVEL-SRC-001: offers manual import, and deletes a note only after a second click', async () => {
    let notes = [note('a'.repeat(24), '有链接的笔记', 'https://www.xiaohongshu.com/explore/' + 'a'.repeat(24)), note('b'.repeat(24), '手动笔记', '')]
    const deleted: string[] = []
    server.use(
      http.get('/api/travel-sources', () => HttpResponse.json({ notes })),
      http.delete('/api/travel-sources/:sourceId', ({ params }) => {
        deleted.push(String(params.sourceId))
        notes = notes.filter((n) => n.source_id !== params.sourceId)
        return HttpResponse.json({ deleted: true })
      }),
    )
    render(<TravelSourcesPage />)
    expect(await screen.findByText('手动笔记')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '手动添加攻略' })).toBeInTheDocument()
    expect(screen.getByText('手动添加，没有原帖链接')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看原帖' })).toHaveAttribute('href', notes[0].url)

    await userEvent.click(screen.getAllByRole('button', { name: '删除' })[1])
    expect(deleted).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('button', { name: '确认删除' })).not.toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: '删除' })[1])
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(deleted).toEqual(['b'.repeat(24)]))
    await waitFor(() => expect(screen.queryByText('手动笔记')).not.toBeInTheDocument())
    expect(screen.getByText('已删除这篇攻略及其图片、识别文字和地点。')).toBeInTheDocument()
  })

  it('FE-TRAVEL-SRC-002: says when a delete fails', async () => {
    server.use(
      http.get('/api/travel-sources', () => HttpResponse.json({ notes: [note('c'.repeat(24), '笔记', '')] })),
      http.delete('/api/travel-sources/:sourceId', () => HttpResponse.json({ error: 'nope' }, { status: 500 })),
    )
    render(<TravelSourcesPage />)
    await userEvent.click(await screen.findByRole('button', { name: '删除' }))
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(await screen.findByText('删除失败，请重试。')).toBeInTheDocument()
  })
})
