import { travelPlaceKinds } from '@trek/shared'
import { Link } from 'react-router'
import PageShell from '../components/Layout/PageShell'
import { KIND_LABELS, PACE_OPTIONS } from './travel-plan/travelPlanModel'
import { useTravelProfile } from './travel-profile/useTravelProfile'

const WALKING = [
  { value: 'low', label: '少走路', hint: '800 米以内才步行' },
  { value: 'medium', label: '一般', hint: '1.2 公里以内步行' },
  { value: 'high', label: '能走', hint: '2 公里以内步行' },
] as const

const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? 'border-accent bg-accent text-accent-text' : 'border-edge text-content-secondary'}`

export default function TravelProfilePage() {
  const {
    view, draft, setDraft, avoidText, setAvoidText, busy, error, message, confirmForget, setConfirmForget,
    toggleKind, save, accept, dismiss, deleteSignal, forget,
  } = useTravelProfile()

  return (
    <PageShell className="bg-surface-secondary">
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 text-content md:pb-8">
        <Link to="/travel-plans" className="text-sm text-accent">攻略行程</Link>
        <h1 className="mt-4 text-2xl font-bold">我的旅行画像</h1>
        <p className="mt-2 text-content-secondary">
          推荐地点时会参考这里的偏好。系统从你的取舍里看出的倾向只会作为建议出现，你点“记下”才会写进画像。这些数据只保存在你的账户里，不用于训练模型，可以随时删除。
        </p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {message && <p role="status" className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{message}</p>}

        {view && view.suggestions.length > 0 && (
          <section className="mt-6 rounded-xl border border-accent bg-surface-card p-5">
            <h2 className="text-lg font-semibold">建议</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {view.suggestions.map((s) => (
                <li key={s.key} className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div>{s.text}</div>
                    <div className="text-xs text-content-muted">依据：{s.evidence}</div>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button type="button" disabled={busy || !view.profile} onClick={() => void accept(s.key)} title={view.profile ? undefined : '先保存一次下面的问题'}
                      className="rounded-lg bg-accent px-3 py-1 text-accent-text disabled:opacity-60">记下</button>
                    <button type="button" disabled={busy} onClick={() => void dismiss(s.key)} className="rounded-lg border border-edge px-3 py-1 text-content-secondary">忽略</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <form onSubmit={save} className="mt-6 grid gap-5 rounded-xl border border-edge bg-surface-card p-5">
          <fieldset>
            <legend className="font-medium">1. 喜欢去哪类地方？</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {travelPlaceKinds.map((kind) => (
                <button key={kind} type="button" aria-pressed={draft.likes.includes(kind)} onClick={() => toggleKind('likes', kind)} className={chip(draft.likes.includes(kind))}>{KIND_LABELS[kind]}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="font-medium">2. 不太想去哪类？</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {travelPlaceKinds.map((kind) => (
                <button key={kind} type="button" aria-pressed={draft.dislikes.includes(kind)} onClick={() => toggleKind('dislikes', kind)} className={chip(draft.dislikes.includes(kind))}>{KIND_LABELS[kind]}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="font-medium">3. 每天的节奏</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PACE_OPTIONS.map((option) => (
                <button key={option.value} type="button" aria-pressed={draft.pace === option.value} onClick={() => setDraft({ ...draft, pace: option.value })} className={chip(draft.pace === option.value)}>
                  {option.label}<span className="ml-1 text-xs opacity-80">{option.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="font-medium">4. 能走多远</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {WALKING.map((option) => (
                <button key={option.value} type="button" aria-pressed={draft.walking === option.value} onClick={() => setDraft({ ...draft, walking: option.value })} className={chip(draft.walking === option.value)}>
                  {option.label}<span className="ml-1 text-xs opacity-80">{option.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="font-medium">
            5. 想避开的（用逗号分开，例如：不吃辣，排长队）
            <input id="profile-avoid" value={avoidText} onChange={(e) => setAvoidText(e.target.value)}
              className="mt-2 w-full rounded-lg border border-edge bg-surface-input px-3 py-2 font-normal text-content" />
          </label>
          <div>
            <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-text disabled:opacity-60">保存画像</button>
            {view?.updated_at && <span className="ml-3 text-xs text-content-muted">上次保存：{new Date(view.updated_at).toLocaleString('zh-CN')}</span>}
          </div>
        </form>

        {view && (
          <section className="mt-6 rounded-xl border border-edge bg-surface-card p-5">
            <h2 className="text-lg font-semibold">记录了什么</h2>
            <p className="mt-1 text-sm text-content-secondary">
              已结束的行程里去过 {view.visited_count} 处地点，新的计划会把它们排在后面。下面是你在计划里的操作记录，可以逐条删除。
            </p>
            {view.signals.length === 0 ? (
              <p className="mt-3 text-sm text-content-muted">还没有记录。</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-edge-faint text-sm">
                {view.signals.map((signal) => (
                  <li key={signal.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{signal.summary}<span className="ml-2 text-xs text-content-muted">{new Date(signal.created_at).toLocaleString('zh-CN')}</span></span>
                    <button type="button" disabled={busy} onClick={() => void deleteSignal(signal.id)} aria-label={`删除记录：${signal.summary}`} className="text-xs text-content-muted">删除</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <button type="button" disabled={busy} onClick={forget}
                className={`rounded-lg border px-3 py-1.5 ${confirmForget ? 'border-danger bg-danger-soft text-danger' : 'border-edge text-content-secondary'}`}>
                {confirmForget ? '确认清空画像和全部记录' : '清空画像和全部记录'}
              </button>
              {confirmForget && <button type="button" onClick={() => setConfirmForget(false)} className="rounded-lg border border-edge px-3 py-1.5 text-content-secondary">取消</button>}
            </div>
          </section>
        )}
      </main>
    </PageShell>
  )
}
