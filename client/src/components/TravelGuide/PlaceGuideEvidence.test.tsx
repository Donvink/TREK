import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import { server } from '../../../tests/helpers/msw/server'
import PlaceGuideEvidence from './PlaceGuideEvidence'

const evidence = {
  plan_id: 'a'.repeat(16), pool_key: 'b'.repeat(16), location_status: 'candidate',
  mentions: [{ source_id: 's1', source_title: '都灵 中餐厅', source_url: 'https://www.xiaohongshu.com/explore/s1', place_id: 'p', sentiment: 'positive' }],
  evidence: [{ kind: 'image', image_id: 'x', image_order: 10, quote: 'House Jia' }, { kind: 'text', image_id: null, image_order: null, quote: '餐馆的名字是“家”' }],
  reasons: ['1 篇帖子提到'], warnings: ['部分依据来自图片 OCR，可能有识别错误'],
  legs: [{ day_index: 0, date: '2026-09-10', from_name: 'Bellinzona', to_name: 'House Jia', status: 'verified', departure: '08:12', arrival: '11:05', duration_minutes: 173, transfers: 1, summary: 'EC 12，换乘 1 次', check_url: 'https://maps.example', checked_at: '2026-10-27T08:00:00.000Z' }],
}

describe('PlaceGuideEvidence', () => {
  it('FE-TRAVEL-EV-001: shows the notes, quotes, location state and checked journeys behind a place', async () => {
    server.use(http.get('/api/travel-plans/evidence/7/101', () => HttpResponse.json(evidence)))
    render(<PlaceGuideEvidence tripId={7} placeId={101} />)
    expect(await screen.findByText('攻略依据')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /都灵 中餐厅/ })).toHaveAttribute('href', evidence.mentions[0].source_url)
    expect(screen.getByText('图 10：')).toBeInTheDocument()
    expect(screen.getByText('地图位置为自动匹配')).toBeInTheDocument()
    expect(screen.getByText('已核验')).toBeInTheDocument()
    expect(screen.getByText(/EC 12，换乘 1 次/)).toBeInTheDocument()
    expect(screen.getByText(/OCR/)).toBeInTheDocument()
  })

  it('FE-TRAVEL-EV-002: renders nothing for a place that did not come from a guide, or before the trip is known', async () => {
    let asked = 0
    server.use(http.get('/api/travel-plans/evidence/7/102', () => {
      asked++
      return HttpResponse.json({ error: 'No guide evidence for this place' }, { status: 404 })
    }))
    const { container } = render(<PlaceGuideEvidence tripId={7} placeId={102} />)
    await waitFor(() => expect(asked).toBe(1))
    expect(container).toBeEmptyDOMElement()
    const { container: pending } = render(<PlaceGuideEvidence tripId={null} placeId={102} />)
    expect(pending).toBeEmptyDOMElement()
  })
})
