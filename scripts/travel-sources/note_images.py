"""Download only note carousel images into a local, content-addressed cache."""
import asyncio
import hashlib
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGES = 30


def image_type(data):
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg', 'jpg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png', 'png'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif', 'gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp', 'webp'
    raise ValueError('unsupported_image')


def validate_image_url(url):
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443)
            or not parsed.hostname or not any(parsed.hostname.endswith('.' + domain) or parsed.hostname == domain
                for domain in ('xhscdn.com', 'xhscdn.net', 'rednotecdn.com'))):
        raise ValueError('unsupported_image_host')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def download_image(url, directory, referer):
    validate_image_url(url)
    opener = urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(url, headers={'Referer': referer, 'User-Agent': 'Mozilla/5.0'})
    with opener.open(request, timeout=20) as response:
        if int(response.headers.get('Content-Length', '0')) > MAX_IMAGE_BYTES:
            raise ValueError('image_too_large')
        data = response.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError('image_too_large')
    mime, extension = image_type(data)
    digest = hashlib.sha256(data).hexdigest()
    filename = f'{digest}.{extension}'
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / filename
    if not target.exists():
        temp = directory / f'{digest}.tmp'
        temp.write_bytes(data)
        temp.replace(target)
    return {'image_id': digest, 'filename': filename, 'content_type': mime, 'status': 'available', 'failure_reason': None}


async def collect_images(page, directory):
    # Scope to the note's carousel: no avatars, comments or recommendation cards.
    carousel = page.locator('.note-container .swiper-wrapper').first
    if await carousel.count():
        count = await carousel.evaluate("""wrapper => {
            let root = wrapper.parentElement;
            while (root && !root.swiper) root = root.parentElement;
            if (!root) return 0;
            return wrapper.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate)').length;
        }""")
        for index in range(min(count, MAX_IMAGES)):
            await carousel.evaluate("""(wrapper, index) => {
                let root = wrapper.parentElement;
                while (root && !root.swiper) root = root.parentElement;
                const swiper = root.swiper;
                if (swiper.slideToLoop) swiper.slideToLoop(index, 0);
                else swiper.slideTo(index + (swiper.loopedSlides || 0), 0);
            }""", index)
            await page.wait_for_timeout(300)
            try:
                await page.wait_for_function("""() => {
                    const img = document.querySelector('.note-container .swiper-slide-active img');
                    return img && (img.currentSrc || img.getAttribute('src'));
                }""", timeout=5000)
            except Exception:
                pass
    urls = await page.locator('.note-container .swiper-slide:not(.swiper-slide-duplicate) img').evaluate_all(
        "elements => elements.map(e => e.currentSrc || e.src || e.getAttribute('data-src')).filter(Boolean)")
    result = []
    for order, url in enumerate(dict.fromkeys(urls), 1):
        if order > MAX_IMAGES:
            break
        try:
            item = await asyncio.to_thread(download_image, url, directory, page.url)
        except ValueError as error:
            item = {'image_id': None, 'filename': None, 'content_type': None, 'status': 'failed', 'failure_reason': str(error)}
        except Exception:
            item = {'image_id': None, 'filename': None, 'content_type': None, 'status': 'failed', 'failure_reason': 'image_download_failed'}
        result.append({'order': order, **item})
    return result
