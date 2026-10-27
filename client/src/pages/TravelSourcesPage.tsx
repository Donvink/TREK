import { Link } from 'react-router';
import PageShell from '../components/Layout/PageShell';
import ManualImportForm from './travel-sources/ManualImportForm';
import SourceNoteText from './travel-sources/SourceNoteText';
import SourcePlaces from './travel-sources/SourcePlaces';
import { useTravelSources } from './travel-sources/useTravelSources';

const statusLabels = { available: '已读取 · 尚未核验', missing: '正文缺失', failed: '读取失败' };

export default function TravelSourcesPage() {
  const {
    manual,
    pendingDelete,
    setPendingDelete,
    removeSource,
    notes,
    loading,
    importing,
    error,
    message,
    query,
    setQuery,
    fileInput,
    imageInput,
    importFile,
    importImages,
    filtered,
    city,
    setCity,
    busySource,
    extractPlaces,
    confirmPlace,
  } = useTravelSources();

  return (
    <PageShell className="bg-surface-secondary">
      <main className="mx-auto max-w-4xl px-4 pb-28 pt-8 text-content md:pb-8">
        <Link to="/dashboard" className="text-sm text-accent">
          返回行程首页
        </Link>
        <h1 className="mt-4 text-2xl font-bold">旅行灵感素材</h1>
        <p className="mt-2 text-content-secondary">
          添加你收藏的攻略，保留来源和缺失信息。帖子中的交通、价格与营业时间仍需核验。整理好后可以去<Link to="/travel-plans" className="text-accent">攻略行程</Link>生成行程。
        </p>
        <ManualImportForm form={manual} />
        <section className="mt-6 rounded-xl border border-edge bg-surface-card p-5">
          <label htmlFor="travel-source-file" className="block font-semibold">
            导入采集结果
          </label>
          <p className="mt-1 text-sm text-content-secondary">选择本地采集生成的 JSON 文件。素材仅保存在你的账户中。</p>
          <input
            ref={fileInput}
            id="travel-source-file"
            type="file"
            accept=".json,application/json"
            disabled={importing || loading}
            className="mt-4 block max-w-full text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
          <label htmlFor="travel-source-images" className="mt-5 block text-sm font-semibold">
            导入已下载图片
          </label>
          <p className="mt-1 text-sm text-content-secondary">
            先导入 JSON，再选择同目录 images 文件夹中的图片，可多选。
          </p>
          <input
            ref={imageInput}
            id="travel-source-images"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            disabled={importing || loading}
            className="mt-2 block max-w-full text-sm"
            onChange={(event) => {
              if (event.target.files?.length) void importImages(event.target.files);
            }}
          />
          {importing && (
            <p role="status" className="mt-3 text-sm">
              正在导入…
            </p>
          )}
          {message && (
            <p role="status" className="mt-3 text-sm text-accent">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-content">
              {error}
            </p>
          )}
        </section>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">素材库 · {notes.length} 条</h2>
          <input
            aria-label="搜索素材"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、正文或关键词"
            className="w-full rounded-lg border border-edge bg-surface-card px-3 py-2 text-sm sm:w-72"
          />
        </div>
        {loading ? (
          <p role="status" className="mt-6">
            正在加载…
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-6 text-content-secondary">
            {notes.length ? '没有匹配的素材。' : '还没有素材。先完成本地采集，再导入结果。'}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {filtered.map((note) => (
              <article key={note.source_id} className="rounded-xl border border-edge bg-surface-card p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <h3 className="text-lg font-semibold leading-7">{note.title || '无标题帖子'}</h3>
                  <span className="shrink-0 text-xs leading-7 text-content-secondary">{statusLabels[note.status]}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-6 text-content-secondary">
                  <span>作者：{note.author ?? '未知'}</span>
                  <span>发布时间：{note.published_at ?? '未知'}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-6 text-content-secondary">
                  <span>搜索：{note.query}</span>
                  <span>采集：{new Date(note.collected_at).toLocaleString()}</span>
                </div>
                {note.content && <SourceNoteText content={note.content} />}
                {!note.content && (
                  <p className="mt-3 text-sm text-content-secondary">正文无法读取，不会作为推荐依据。</p>
                )}
                <SourcePlaces
                  note={note}
                  city={city}
                  setCity={setCity}
                  busy={busySource !== null}
                  working={busySource === note.source_id}
                  extract={() => void extractPlaces(note.source_id)}
                  confirm={(placeId, candidateId) => void confirmPlace(note.source_id, placeId, candidateId)}
                />
                {!!note.images?.length && (
                  <div className="mt-4">
                    <p className="text-xs text-content-secondary">帖子图片 · {note.images.length} 张</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {note.images.map((image) =>
                        image.image_id && note.saved_image_ids?.includes(image.image_id) ? (
                          <a
                            key={image.order}
                            href={`/api/travel-sources/${note.source_id}/images/${image.image_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`查看图片 ${image.order}`}
                          >
                            <img
                              src={`/api/travel-sources/${note.source_id}/images/${image.image_id}`}
                              alt={`帖子图片 ${image.order}`}
                              loading="lazy"
                              className="h-40 w-full rounded-lg bg-surface-secondary object-cover"
                            />
                          </a>
                        ) : (
                          <p
                            key={image.order}
                            className="rounded-lg bg-surface-secondary p-3 text-xs text-content-secondary"
                          >
                            图片 {image.order} · {image.status === 'failed' ? '下载失败' : '待导入图片文件'}
                          </p>
                        )
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <button type="button" onClick={() => void removeSource(note.source_id)}
                    className={`rounded-lg border px-3 py-1 ${pendingDelete === note.source_id ? 'border-danger bg-danger-soft text-danger' : 'border-edge text-content-secondary'}`}>
                    {pendingDelete === note.source_id ? '确认删除' : '删除'}
                  </button>
                  {pendingDelete === note.source_id && (
                    <button type="button" onClick={() => setPendingDelete(null)} className="rounded-lg border border-edge px-3 py-1 text-content-secondary">取消</button>
                  )}
                </div>
                {note.url ? (
                  <a
                    href={note.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm text-accent"
                  >
                    查看原帖
                  </a>
                ) : (
                  <p className="mt-3 text-sm text-content-muted">手动添加，没有原帖链接</p>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </PageShell>
  );
}
