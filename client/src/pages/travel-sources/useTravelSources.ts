import { travelSourceBatchSchema, type StoredTravelSource, type TravelSourceImportResult } from '@trek/shared';
import { useEffect, useRef, useState } from 'react';
import apiClient from '../../api/client';

const MAX_FILE_BYTES = 3 * 1024 * 1024;

export function useTravelSources() {
  const [notes, setNotes] = useState<StoredTravelSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('Torino, Italy');
  const [busySource, setBusySource] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get<{ notes: StoredTravelSource[] }>('/travel-sources')
      .then(({ data }) => {
        if (active) setNotes(data.notes);
      })
      .catch(() => {
        if (active) setError('素材加载失败，请刷新重试。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function importFile(file: File) {
    setError('');
    setMessage('');
    setImporting(true);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('文件超过 3 MB，请减少单次采集数量。');
      let input: unknown;
      try {
        input = JSON.parse(await file.text());
      } catch {
        throw new Error('文件不是有效的 JSON。');
      }
      const parsed = travelSourceBatchSchema.safeParse(input);
      if (!parsed.success) throw new Error('采集文件格式不正确，请使用本项目采集适配器导出的版本 1 文件。');
      const { data: result } = await apiClient.post<TravelSourceImportResult>('/travel-sources/import', parsed.data);
      setMessage(`导入完成：新增 ${result.imported} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条。`);
      const { data } = await apiClient.get<{ notes: StoredTravelSource[] }>('/travel-sources');
      setNotes(data.notes);
    } catch (cause) {
      setError(
        cause instanceof Error && !('response' in cause)
          ? cause.message
          : '导入或刷新失败，请重试；重复导入不会新增相同帖子。'
      );
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const filtered = notes.filter((note) =>
    `${note.title} ${note.content ?? ''} ${note.query}`.toLowerCase().includes(query.toLowerCase())
  );

  async function importImages(files: FileList) {
    setImporting(true);
    setError('');
    setMessage('');
    let saved = 0;
    let failed = 0;
    const selected = Array.from(files);
    try {
      for (const file of selected) {
        const matches = notes.flatMap((note) =>
          (note.images ?? [])
            .filter((image) => image.status === 'available' && image.filename === file.name)
            .map((image) => ({ sourceId: note.source_id, image }))
        );
        for (const { sourceId, image } of matches) {
          try {
            if (file.size > 8 * 1024 * 1024) throw new Error('Image too large');
            await apiClient.post(`/travel-sources/${sourceId}/images/${image.image_id}`, file, {
              headers: { 'Content-Type': image.content_type },
            });
            saved++;
          } catch {
            failed++;
          }
        }
      }
      const { data } = await apiClient.get<{ notes: StoredTravelSource[] }>('/travel-sources');
      setNotes(data.notes);
      setMessage(
        `图片导入：成功 ${saved} 张，失败 ${failed} 张。${saved === 0 && failed === 0 ? '请先导入带图片信息的 JSON，再选择 images 文件夹中的图片。' : ''}`
      );
    } catch {
      setError('图片已部分保存，但刷新失败，请刷新页面查看。');
    } finally {
      setImporting(false);
      if (imageInput.current) imageInput.current.value = '';
    }
  }

  async function extractPlaces(sourceId: string) {
    setBusySource(sourceId);
    setError('');
    try {
      // Map lookups are sequential and rate-limited; the shared 8 s timeout is too short.
      await apiClient.post(`/travel-sources/${sourceId}/places/extract`, { city, refresh_map: true }, { timeout: 180000 });
      const { data } = await apiClient.get<{ notes: StoredTravelSource[] }>('/travel-sources');
      setNotes(data.notes);
    } catch {
      setError('地点提取失败，请稍后重试；地图信息不会自动当作已核验。');
    } finally {
      setBusySource(null);
    }
  }

  async function confirmPlace(sourceId: string, placeId: string, candidateId: string) {
    setBusySource(sourceId);
    setError('');
    try {
      await apiClient.post(`/travel-sources/${sourceId}/places/${placeId}/confirm`, { candidate_id: candidateId });
      const { data } = await apiClient.get<{ notes: StoredTravelSource[] }>('/travel-sources');
      setNotes(data.notes);
    } catch {
      setError('确认失败。正文可能已经更新，请重新提取后核对。');
    } finally {
      setBusySource(null);
    }
  }

  return {
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
  };
}
