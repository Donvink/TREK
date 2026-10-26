"""Read-only adapter for the user's existing rednote_mcp.py; no publishing tools."""
import argparse
import ast
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlsplit
from note_images import collect_images


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def note_id(url):
    parsed = urlsplit(url)
    match = re.fullmatch(r"/(?:explore|search_result|discovery/item)/([a-f0-9]{24})/?", parsed.path)
    if (parsed.scheme != "https" or parsed.hostname not in {"www.xiaohongshu.com", "xiaohongshu.com", "www.rednote.com", "rednote.com"}
            or parsed.username or parsed.password or parsed.port or not match):
        raise ValueError("Expected a Xiaohongshu note URL")
    if parsed.hostname.endswith('xiaohongshu.com') and parsed.path.startswith('/discovery/'):
        raise ValueError("Expected a Xiaohongshu note URL")
    return match.group(1)


def canonical_url(url):
    key = note_id(url)
    if urlsplit(url).hostname.endswith('rednote.com'):
        return f"https://www.rednote.com/discovery/item/{key}"
    return f"https://www.xiaohongshu.com/explore/{key}"


def parse_search(text, limit):
    links = re.findall(r"链接:\s*(https://[^\s]+)", text)
    result, seen = [], set()
    for url in links:
        key = note_id(url)
        if key not in seen:
            seen.add(key)
            result.append(url)
    return result[:limit]


def parse_note(url, text, collected_at):
    note_id(url)
    header, separator, body = text.partition("内容:\n")
    fields = {}
    for line in header.splitlines():
        name, sep, value = line.partition(":")
        if sep:
            fields[name.strip()] = value.strip()
    missing = not separator or not body.strip() or body.strip() == "未能获取内容"
    oversized = len(body.strip()) > 20000
    if oversized:
        missing = True
    status = "missing" if separator and missing else "failed" if missing else "available"
    return {
        "url": canonical_url(url),
        "title": fields.get("标题", "")[:500],
        "author": None if fields.get("作者") in {None, "未知作者", ""} else fields["作者"][:200],
        "published_at": None if fields.get("发布时间") in {None, "未知", ""} else fields["发布时间"][:100],
        "collected_at": collected_at,
        "content": None if missing else body.strip(),
        "status": status,
        "failure_reason": "content_too_large" if oversized else "content_unavailable" if missing else None,
    }


def load_reader(source, page, host="www.xiaohongshu.com"):
    # Load only these trusted local functions: no decorators, top-level side
    # effects, imports, publishing functions, or MCP server startup.
    tree = ast.parse(Path(source).read_text(encoding="utf-8"))
    names = {"process_url", "search_notes", "get_note_content"}
    functions = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
    if {node.name for node in functions} != names:
        raise ValueError("Crawler must define process_url, search_notes, get_note_content")
    for node in functions:
        node.decorator_list = []
    if host == "www.rednote.com":
        # Adapt the trusted reader's fixed URL strings without loading other tools.
        class HostAdapter(ast.NodeTransformer):
            def visit_Constant(self, node):
                if isinstance(node.value, str):
                    node.value = node.value.replace("www.xiaohongshu.com", "www.rednote.com")
                return node
        functions = [HostAdapter().visit(node) for node in functions]
    async def ensure_browser():
        return True
    class ReaderPage:
        def __init__(self):
            self.search_url = None

        def __getattr__(self, name):
            return getattr(page, name)

        async def goto(self, url, **kwargs):
            # Dynamic feeds can render while unrelated resources keep loading.
            kwargs.setdefault("wait_until", "domcontentloaded")
            if urlsplit(url).hostname in {"rednote.com", "www.rednote.com"} and re.fullmatch(
                    r"/(?:search_result|explore|discovery/item)/[a-f0-9]{24}/?", urlsplit(url).path):
                if self.search_url:
                    # International detail pages work through the search SPA;
                    # direct requests may return 404 even for visible notes.
                    await page.goto(self.search_url, **kwargs)
                    card = page.locator(f'section.note-item a.cover[href*="/{note_id(url)}"]')
                    await card.first.click(timeout=20000)
                    return None
                parts = urlsplit(url)
                url = parts._replace(path=f"/discovery/item/{note_id(url)}").geturl()
            elif urlsplit(url).path == "/search_result" and urlsplit(url).query:
                self.search_url = url
            return await page.goto(url, **kwargs)
    namespace = {
        "asyncio": asyncio, "json": json, "main_page": ReaderPage(),
        "ensure_browser": ensure_browser, "print": lambda *args, **kwargs: None,
    }
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), "exec"), namespace)
    return namespace


async def collect(args):
    from playwright.async_api import Error as PlaywrightError, async_playwright
    async with async_playwright() as playwright:
        launch_options = {"headless": not args.login, "viewport": {"width": 1280, "height": 800}}
        if args.browser:
            launch_options["executable_path"] = args.browser
        owns_context = not args.cdp
        start_url = "https://www.xiaohongshu.com"
        if args.cdp:
            browser = await playwright.chromium.connect_over_cdp(args.cdp)
            if not browser.contexts:
                raise RuntimeError("browser_context_unavailable")
            context = browser.contexts[0]
            if any(urlsplit(tab.url).hostname in {"rednote.com", "www.rednote.com"} for tab in context.pages):
                start_url = "https://www.rednote.com/"
        else:
            context = await playwright.chromium.launch_persistent_context(str(args.profile.resolve()), **launch_options)
        page = None
        try:
            page = (context.pages[0] if context.pages else await context.new_page()) if owns_context else await context.new_page()
            try:
                await page.goto(start_url, wait_until="domcontentloaded", timeout=30000)
            except PlaywrightError:
                if not args.login:
                    raise RuntimeError("navigation_failed: page did not load; inspect with --login")
                print("页面自动加载失败，窗口保持打开；请在浏览器中手动访问小红书并登录。", file=sys.stderr)
            await page.wait_for_timeout(3000)
            if args.login:
                print("请在浏览器完成登录，再回终端按 Enter。", file=sys.stderr)
                await asyncio.to_thread(input)
                await page.reload(wait_until="domcontentloaded", timeout=30000)
            if await page.get_by_text("登录", exact=True).filter(visible=True).count():
                raise RuntimeError("login_required: run with --login to save your local session")
            host = urlsplit(page.url).hostname
            if host not in {"www.xiaohongshu.com", "xiaohongshu.com", "www.rednote.com", "rednote.com"}:
                raise RuntimeError("unexpected_site_redirect")
            reader = load_reader(args.source, page, "www.rednote.com" if host.endswith("rednote.com") else "www.xiaohongshu.com")
            search = await asyncio.wait_for(reader["search_notes"](quote(args.query, safe=""), args.limit), timeout=120)
            urls = parse_search(search, args.limit)
            if not urls:
                text = await page.locator("body").inner_text()
                diagnostics = {
                    "checked_at": utc_now(),
                    "page_path": urlsplit(page.url).path,
                    "page_host": urlsplit(page.url).hostname,
                    "login_redirected": urlsplit(page.url).path.startswith("/website-login"),
                    "note_cards": await page.locator("section.note-item").count(),
                    "login_prompt_present": any(marker in text for marker in ("登录", "登陆", "扫码登录")),
                    "restriction_prompt_present": any(marker in text for marker in ("访问频次异常", "请完成验证", "安全验证")),
                    "reader_reported_error": "出错" in search,
                }
                args.output.parent.mkdir(parents=True, exist_ok=True)
                diagnostics_path = args.output.with_suffix(".diagnostics.json")
                diagnostics_path.write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                if diagnostics["restriction_prompt_present"]:
                    raise RuntimeError("access_restricted: collection paused; session needs attention")
                if diagnostics["login_prompt_present"]:
                    raise RuntimeError("login_required: run with --login to save your local session")
                if diagnostics["login_redirected"]:
                    raise RuntimeError("login_redirect: search was redirected to a login/error page; inspect with --login")
                raise RuntimeError("search_unavailable_or_empty: no readable note links returned")
            notes = []
            for index, url in enumerate(urls, 1):
                # Avoid recording query tokens, HTML dumps or account data in logs.
                print(f"Reading note {index}/{len(urls)}", file=sys.stderr)
                try:
                    text = await asyncio.wait_for(reader["get_note_content"](url), timeout=120)
                except asyncio.TimeoutError:
                    text = "读取超时"
                except Exception:
                    text = "读取失败"
                note = parse_note(url, text, utc_now())
                if args.images and note['status'] == 'available':
                    note['images'] = await collect_images(page, args.image_dir or args.output.parent / 'images')
                    print(f"Images saved: {sum(image['status'] == 'available' for image in note['images'])}/{len(note['images'])}", file=sys.stderr)
                notes.append(note)
                body = await page.locator("body").inner_text()
                if any(marker in body for marker in ("访问频次异常", "请完成验证", "安全验证", "请先登录")):
                    raise RuntimeError("access_restricted: collection paused; session needs attention")
            return {"schema_version": 1, "query": args.query, "collected_at": utc_now(), "notes": notes}
        finally:
            if owns_context:
                await context.close()
            elif page is not None:
                await page.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Path to your trusted rednote_mcp.py")
    parser.add_argument("--query", required=True)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--profile", type=Path, default=Path(".local/travel-sources/browser"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--browser", help="Optional Chromium executable path")
    parser.add_argument("--cdp", help="Use an already-open local browser (e.g. http://127.0.0.1:9223)")
    parser.add_argument("--login", action="store_true", help="Open a visible browser to sign in locally")
    parser.add_argument("--images", action="store_true", help="Also save note carousel images locally")
    parser.add_argument("--image-dir", type=Path, help="Image folder; defaults to images/ beside the output JSON")
    args = parser.parse_args()
    if not 1 <= args.limit <= 100 or not 1 <= len(args.query.strip()) <= 200:
        parser.error("limit must be 1–100 and query must be 1–200 characters")
    try:
        args.profile.mkdir(parents=True, exist_ok=True)
        batch = asyncio.run(collect(args))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(batch, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        counts = {status: sum(note["status"] == status for note in batch["notes"]) for status in ("available", "missing", "failed")}
        print(json.dumps({"output": str(args.output), "counts": counts}, ensure_ascii=False))
    except ImportError:
        print("Missing Playwright: install scripts/travel-sources/requirements.txt in a local virtualenv", file=sys.stderr)
        return 2
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 2
    except Exception as error:
        print(f"Collection failed ({type(error).__name__}); no new export was written", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
