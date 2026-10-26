import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../helpers/msw/server';
import { useSystemNoticeStore } from '../../../src/store/systemNoticeStore';

const initial = useSystemNoticeStore.getState();

beforeEach(() => {
  useSystemNoticeStore.setState(initial, true);
});

describe('systemNoticeStore', () => {
  describe('FE-SYSNOTICE-001: fetch()', () => {
    it('keeps the notices the server returns', async () => {
      const notice = {
        id: 'outage', display: 'modal', severity: 'info', dismissible: true,
        titleKey: 'system_notice.outage.title', bodyKey: 'system_notice.outage.body',
      };
      server.use(
        http.get('/api/system-notices/active', () => HttpResponse.json([notice])),
      );

      await useSystemNoticeStore.getState().fetch();

      const state = useSystemNoticeStore.getState();
      expect(state.loaded).toBe(true);
      expect(state.notices.map(n => n.id)).toEqual(['outage']);
    });

    it('still marks itself loaded when the request fails', async () => {
      server.use(
        http.get('/api/system-notices/active', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      );

      await useSystemNoticeStore.getState().fetch();

      expect(useSystemNoticeStore.getState().loaded).toBe(true);
      expect(useSystemNoticeStore.getState().notices).toEqual([]);
    });
  });
});
