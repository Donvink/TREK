import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import { server } from '../../../tests/helpers/msw/server'
import ManualImportForm from './ManualImportForm'
import { sha256Hex, useManualImport } from './useManualImport'

function Harness({ onImported }: { onImported: () => void }) {
  const form = useManualImport(onImported)
  return <ManualImportForm form={form} />
}

const png = (bytes: number[], name = 'card.png') => new File([new Uint8Array([137, 80, 78, 71, ...bytes])], name, { type: 'image/png' })

describe('manual guide import', () => {
  it('FE-TRAVEL-MANUAL-001: hashes images the way the server checks them', async () => {
    const data = new TextEncoder().encode('abc').buffer as ArrayBuffer
    expect(await sha256Hex(data)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('FE-TRAVEL-MANUAL-002: stores the note, uploads each screenshot by its hash and reports what OCR read', async () => {
    let note: { images: { order: number; image_id: string; content_type: string }[]; link?: string } | null = null
    const uploads: string[] = []
    server.use(
      http.post('/api/travel-sources/manual', async ({ request }) => {
        note = (await request.json()) as typeof note
        return HttpResponse.json({ source_id: 'a'.repeat(24), created: true })
      }),
      http.post('/api/travel-sources/:sourceId/images/:imageId', ({ params, request }) => {
        uploads.push(`${params.imageId}:${request.headers.get('content-type')}`)
        return HttpResponse.json({ saved: true, text_read: uploads.length === 1 })
      }),
    )
    const onImported = vi.fn()
    render(<Harness onImported={onImported} />)
    await userEvent.type(screen.getByLabelText('笔记链接（可选）'), 'https://xhslink.com/a/AbC')
    await userEvent.type(screen.getByLabelText('标题'), '慕尼黑啤酒馆')
    await userEvent.type(screen.getByLabelText('正文（可以直接粘贴截图）'), '推荐 Augustiner')
    await userEvent.upload(screen.getByLabelText(/截图（最多 30 张/), [png([1]), png([2], 'menu.png')])
    expect(screen.getByText('图2：menu.png')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '添加攻略' }))

    expect(await screen.findByRole('status')).toHaveTextContent('2 张截图已上传，其中 1 张识别出文字。')
    expect(note!.link).toBe('https://xhslink.com/a/AbC')
    expect(note!.images.map((image) => image.order)).toEqual([1, 2])
    expect(uploads).toEqual(note!.images.map((image) => `${image.image_id}:image/png`))
    expect(onImported).toHaveBeenCalled()
    expect(screen.getByLabelText('标题')).toHaveValue('')
  })

  it('FE-TRAVEL-MANUAL-003: refuses other files, takes pasted screenshots, and says why a save failed', async () => {
    server.use(http.post('/api/travel-sources/manual', () => HttpResponse.json({ error: 'Link is not a valid URL' }, { status: 400 })))
    render(<Harness onImported={vi.fn()} />)
    await userEvent.upload(screen.getByLabelText(/截图（最多 30 张/), [new File(['x'], 'notes.pdf', { type: 'application/pdf' })], { applyAccept: false })
    expect(screen.getByRole('alert')).toHaveTextContent('1 个文件不是 JPG/PNG/GIF/WebP 图片或超过 8 MB')

    fireEvent.paste(screen.getByLabelText('正文（可以直接粘贴截图）'), { clipboardData: { files: [png([3], 'pasted.png')] } })
    expect(screen.getByText('图1：pasted.png')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '移除图1' }))
    expect(screen.queryByText('图1：pasted.png')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('标题'), 'T')
    await userEvent.type(screen.getByLabelText('正文（可以直接粘贴截图）'), '正文')
    await userEvent.click(screen.getByRole('button', { name: '添加攻略' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('添加失败（Link is not a valid URL）'))
  })
})
