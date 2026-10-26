import tempfile
import unittest
from pathlib import Path
from collect_rednote import load_reader, note_id, parse_note, parse_search

URL = 'https://www.xiaohongshu.com/explore/0123456789abcdef01234567'
AT = '2026-10-06T10:00:00.000Z'


class CollectorTests(unittest.TestCase):
    def test_search_deduplicates_note_id_but_retains_token_for_reading(self):
        signed = URL + '?xsec_token=public-link-token'
        text = f'1. 笔记\n 链接: {signed}\n2. 同一篇\n 链接: {URL}'
        self.assertEqual(parse_search(text, 5), [signed])

    def test_parse_preserves_body_and_unknown_metadata(self):
        text = '标题: 都灵\n作者: 未知作者\n发布时间: 未知\n链接: ' + URL + '\n\n内容:\n第一行\n第二行: 美食'
        note = parse_note(URL + '?xsec_token=t', text, AT)
        self.assertEqual(note['content'], '第一行\n第二行: 美食')
        self.assertEqual(note['url'], URL)
        self.assertIsNone(note['published_at'])
        self.assertEqual(note['status'], 'available')

    def test_rednote_links_preserve_domain_and_deduplicate_by_id(self):
        url = 'https://www.rednote.com/search_result/0123456789abcdef01234567?xsec_token=test'
        note = parse_note(url, '标题: 都灵\n内容:\n正文', AT)
        self.assertEqual(note['url'], 'https://www.rednote.com/discovery/item/0123456789abcdef01234567')
        self.assertEqual(parse_search(f'链接: {url}\n链接: {URL}', 3), [url])

    def test_reader_adapts_fixed_search_host_for_international_session(self):
        source = '''def process_url(url): return url
async def search_notes(keywords, limit): return "https://www.xiaohongshu.com/search_result?keyword=" + keywords
async def get_note_content(url): return url
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'reader.py'
            path.write_text(source)
            reader = load_reader(path, None, 'www.rednote.com')
            import asyncio
            self.assertEqual(asyncio.run(reader['search_notes']('test', 1)), 'https://www.rednote.com/search_result?keyword=test')

    def test_reader_navigation_waits_for_dom_and_keeps_timeout(self):
        import asyncio
        class Page:
            async def goto(self, url, **kwargs):
                return kwargs
        source = '''def process_url(url): return url
async def search_notes(keywords, limit): return await main_page.goto(keywords, timeout=60000)
async def get_note_content(url): return url
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'reader.py'
            path.write_text(source)
            reader = load_reader(path, Page())
            self.assertEqual(asyncio.run(reader['search_notes']('test', 1)), {'timeout':60000, 'wait_until':'domcontentloaded'})

    def test_international_navigation_uses_item_route_and_retains_signature(self):
        import asyncio
        class Page:
            async def goto(self, url, **kwargs):
                return url
        source = '''def process_url(url): return url
async def search_notes(keywords, limit): return keywords
async def get_note_content(url): return await main_page.goto(url)
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'reader.py'
            path.write_text(source)
            reader = load_reader(path, Page(), 'www.rednote.com')
            url = 'https://www.rednote.com/search_result/0123456789abcdef01234567?xsec_token=test'
            self.assertEqual(asyncio.run(reader['get_note_content'](url)), url.replace('/search_result/', '/discovery/item/'))

    def test_international_reader_opens_detail_from_search_card(self):
        import asyncio
        calls = []
        class Card:
            @property
            def first(self): return self
            async def click(self, **kwargs): calls.append('click')
        class Page:
            async def goto(self, url, **kwargs): calls.append(url)
            def locator(self, selector):
                self_selector = 'section.note-item a.cover[href*="/0123456789abcdef01234567"]'
                if selector != self_selector: raise AssertionError(selector)
                return Card()
        source = '''def process_url(url): return url
async def search_notes(keywords, limit): return await main_page.goto(keywords)
async def get_note_content(url): return await main_page.goto(url)
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'reader.py'
            path.write_text(source)
            reader = load_reader(path, Page(), 'www.rednote.com')
            async def run():
                search = 'https://www.rednote.com/search_result?keyword=test'
                await reader['search_notes'](search, 1)
                await reader['get_note_content']('https://www.rednote.com/search_result/0123456789abcdef01234567?xsec_token=test')
                return search
            search = asyncio.run(run())
            self.assertEqual(calls, [search, search, 'click'])

    def test_missing_and_failed_notes_are_not_usable_content(self):
        self.assertEqual(parse_note(URL, '内容:\n未能获取内容', AT)['status'], 'missing')
        self.assertEqual(parse_note(URL, '请先登录小红书账号', AT)['status'], 'failed')
        self.assertIsNone(parse_note(URL, '读取超时', AT)['content'])

    def test_rejects_foreign_hosts_and_invalid_note_ids(self):
        for url in ['https://example.com/explore/0123456789abcdef01234567', URL.replace('https:', 'http:'), URL.replace('0123456789abcdef01234567', 'foo')]:
            with self.assertRaises(ValueError):
                note_id(url)

    def test_oversized_body_is_reported_instead_of_silently_truncated(self):
        note = parse_note(URL, '内容:\n' + 'x' * 20001, AT)
        self.assertIsNone(note['content'])
        self.assertEqual(note['failure_reason'], 'content_too_large')

    def test_reader_does_not_run_top_level_or_publishing_code(self):
        source = '''raise RuntimeError("top level must not run")
def process_url(url): return url
@mcp.tool()
async def search_notes(keywords, limit): return keywords
@mcp.tool()
async def get_note_content(url): return url
def create_notes(): raise RuntimeError("publishing must not load")
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'reader.py'
            path.write_text(source)
            reader = load_reader(path, None)
            self.assertNotIn('create_notes', reader)
            self.assertEqual(reader['process_url'](URL), URL)


if __name__ == '__main__':
    unittest.main()
