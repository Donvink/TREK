import type { TravelProfile, TravelProfileView } from '@trek/shared'
import { travelProfileSchema } from '@trek/shared'
import { useEffect, useState } from 'react'
import { travelProfileApi } from '../../api/travelPlans'

export const DEFAULT_PROFILE: TravelProfile = { likes: [], dislikes: [], pace: 'normal', walking: 'medium', avoid: [] }

export function useTravelProfile() {
  const [view, setView] = useState<TravelProfileView | null>(null)
  const [draft, setDraft] = useState<TravelProfile>(DEFAULT_PROFILE)
  const [avoidText, setAvoidText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmForget, setConfirmForget] = useState(false)

  function adopt(next: TravelProfileView) {
    setView(next)
    const profile = next.profile ?? DEFAULT_PROFILE
    setDraft(profile)
    setAvoidText(profile.avoid.join('，'))
  }

  useEffect(() => {
    let active = true
    travelProfileApi.get()
      .then((data) => { if (active) adopt(data) })
      .catch(() => { if (active) setError('画像加载失败，请刷新重试。') })
    return () => { active = false }
  }, [])

  async function run(action: () => Promise<TravelProfileView>, done: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      adopt(await action())
      setMessage(done)
    } catch {
      setError('操作失败，请重试。')
    } finally {
      setBusy(false)
    }
  }

  /** A kind is liked, disliked or neither; picking one side clears the other. */
  function toggleKind(side: 'likes' | 'dislikes', kind: TravelProfile['likes'][number]) {
    setDraft((current) => {
      const other = side === 'likes' ? 'dislikes' : 'likes'
      const on = current[side].includes(kind)
      return { ...current, [side]: on ? current[side].filter((k) => k !== kind) : [...current[side], kind], [other]: current[other].filter((k) => k !== kind) }
    })
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    const avoid = avoidText.split(/[，,、\n]/).map((term) => term.trim()).filter(Boolean)
    const parsed = travelProfileSchema.safeParse({ ...draft, avoid })
    if (!parsed.success) {
      setError('“想避开的”最多 10 项，每项不超过 40 个字。')
      return
    }
    void run(() => travelProfileApi.save(parsed.data), '已保存。新的计划会按这些偏好推荐。')
  }

  const accept = (key: string) => run(() => travelProfileApi.accept(key), '已记下。')
  const dismiss = (key: string) => run(() => travelProfileApi.dismiss(key), '已忽略，这条建议不会再出现。')
  const deleteSignal = (id: number) => run(() => travelProfileApi.deleteSignal(id), '已删除这条记录。')
  function forget() {
    if (!confirmForget) {
      setConfirmForget(true)
      return
    }
    setConfirmForget(false)
    void run(() => travelProfileApi.forget(), '已清空画像和全部行为记录。')
  }

  return {
    view, draft, setDraft, avoidText, setAvoidText, busy, error, message, confirmForget, setConfirmForget,
    toggleKind, save, accept, dismiss, deleteSignal, forget,
  }
}
