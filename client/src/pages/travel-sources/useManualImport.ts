import type { TravelManualNote } from '@trek/shared'
import { useState } from 'react'
import { travelSourcesApi } from '../../api/travelSources'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGES = 30

type ImageType = (typeof IMAGE_TYPES)[number]

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Paste a note's text and link, attach its screenshots, and store it as a guide source. */
export function useManualImport(onImported: () => Promise<void> | void) {
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function addFiles(list: FileList | File[] | null) {
    if (!list) return
    const incoming = Array.from(list)
    const rejected = incoming.filter((file) => !IMAGE_TYPES.includes(file.type as ImageType) || file.size > MAX_IMAGE_BYTES)
    setError(rejected.length ? `${rejected.length} 个文件不是 JPG/PNG/GIF/WebP 图片或超过 8 MB，已跳过。` : '')
    setFiles((current) => [...current, ...incoming.filter((file) => !rejected.includes(file))].slice(0, MAX_IMAGES))
  }

  const removeFile = (index: number) => setFiles((current) => current.filter((_, i) => i !== index))

  /** Screenshots pasted into the text box become attachments instead of text. */
  function onPaste(event: React.ClipboardEvent) {
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
    if (!images.length) return
    event.preventDefault()
    addFiles(images)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!title.trim() || !content.trim()) {
      setError('请填写标题和正文。')
      return
    }
    setSaving(true)
    try {
      const images = await Promise.all(files.map(async (file, i) => {
        const data = await file.arrayBuffer()
        return { order: i + 1, image_id: await sha256Hex(data), content_type: file.type as ImageType, data }
      }))
      const note: TravelManualNote = {
        title: title.trim(),
        content: content.trim(),
        ...(link.trim() ? { link: link.trim() } : {}),
        images: images.map(({ order, image_id, content_type }) => ({ order, image_id, content_type })),
      }
      const { source_id: sourceId } = await travelSourcesApi.importManual(note)
      let read = 0
      let failed = 0
      for (const image of images) {
        try {
          if ((await travelSourcesApi.uploadImage(sourceId, image.image_id, image.content_type, image.data)).text_read) read++
        } catch {
          failed++
        }
      }
      setMessage(`已添加。${images.length ? `${images.length - failed} 张截图已上传，其中 ${read} 张识别出文字。` : ''}${failed ? `${failed} 张上传失败，可重新添加。` : ''}`)
      setLink('')
      setTitle('')
      setContent('')
      setFiles([])
      await onImported()
    } catch (err) {
      const reason = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(reason ? `添加失败（${reason}）` : '添加失败，请重试。')
    } finally {
      setSaving(false)
    }
  }

  return { link, setLink, title, setTitle, content, setContent, files, addFiles, removeFile, onPaste, saving, error, message, submit }
}
