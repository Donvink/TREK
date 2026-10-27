import type { useManualImport } from './useManualImport'

const fieldClass = 'mt-1 w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-content'

/** Add a note by hand: the link, the text as copied from the app, and its screenshots. */
export default function ManualImportForm({ form }: { form: ReturnType<typeof useManualImport> }) {
  return (
    <section id="manual" className="mt-6 rounded-xl border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold">手动添加攻略</h2>
      <p className="mt-1 text-sm text-content-secondary">
        在小红书里打开笔记，复制链接和正文粘贴到这里，再加上带店名、地址或菜单的截图。截图里的文字会自动识别。
      </p>
      <form onSubmit={form.submit} className="mt-4 grid gap-3">
        <label className="text-sm">
          笔记链接（可选）
          <input id="manual-link" className={fieldClass} value={form.link} onChange={(e) => form.setLink(e.target.value)} placeholder="https://www.xiaohongshu.com/… 或 xhslink.com 短链" />
        </label>
        <label className="text-sm">
          标题
          <input id="manual-title" className={fieldClass} value={form.title} onChange={(e) => form.setTitle(e.target.value)} maxLength={500} required />
        </label>
        <label className="text-sm">
          正文（可以直接粘贴截图）
          <textarea id="manual-content" rows={6} className={fieldClass} value={form.content} onChange={(e) => form.setContent(e.target.value)} onPaste={form.onPaste} maxLength={20000} required />
        </label>
        <label className="text-sm">
          截图（最多 30 张，每张不超过 8 MB）
          <input id="manual-images" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="mt-1 block text-sm text-content-secondary"
            onChange={(e) => { form.addFiles(e.target.files); e.target.value = '' }} />
        </label>
        {form.files.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-xs">
            {form.files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-1 rounded-full border border-edge px-2 py-0.5 text-content-secondary">
                图{i + 1}：{file.name}
                <button type="button" onClick={() => form.removeFile(i)} aria-label={`移除图${i + 1}`} className="text-content-muted">×</button>
              </li>
            ))}
          </ul>
        )}
        {form.error && <p role="alert" className="text-sm text-danger">{form.error}</p>}
        {form.message && <p role="status" className="text-sm text-success">{form.message}</p>}
        <div>
          <button type="submit" disabled={form.saving} className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-text disabled:opacity-60">
            {form.saving ? '添加中…' : '添加攻略'}
          </button>
        </div>
      </form>
    </section>
  )
}
