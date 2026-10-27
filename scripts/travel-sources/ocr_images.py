"""Read the text inside note images with local OCR and upload it to an authenticated TREK account.

OCR runs on this machine (RapidOCR, CPU). Only recognised text leaves it; the images are
already stored in TREK. Re-running replaces the stored text for the same image.
"""
import argparse
import http.cookiejar
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

from collect_rednote import note_id
from note_images import NoRedirect

MIN_SCORE = 0.5
MAX_TEXT = 4000


def recognise(engine, path):
    """Return recognised lines in reading order, dropping low-confidence fragments."""
    result = engine(str(path))
    texts = list(getattr(result, 'txts', None) or [])
    scores = list(getattr(result, 'scores', None) or [])
    lines = [text.strip() for text, score in zip(texts, scores) if text and text.strip() and score >= MIN_SCORE]
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', required=True, type=Path, help='Collector batch JSON whose images to read')
    parser.add_argument('--account', required=True, type=Path, help='Local JSON containing email and password; never logged')
    parser.add_argument('--api-url', default='http://127.0.0.1:3001')
    parser.add_argument('--image-dir', type=Path)
    parser.add_argument('--report', type=Path, help='Optionally write per-image OCR results and timings here')
    args = parser.parse_args()

    from rapidocr import RapidOCR  # imported late so --help works without the model
    engine = RapidOCR()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), NoRedirect())

    def post(path, body):
        request = urllib.request.Request(args.api_url.rstrip('/') + '/api/' + path, data=body,
                                         headers={'Content-Type': 'application/json'})
        with opener.open(request, timeout=30) as response:
            return json.load(response)

    try:
        account = json.loads(args.account.read_text())
        batch = json.loads(args.batch.read_text())
        post('auth/login', json.dumps({'email': account['email'], 'password': account['password']}).encode())
    except Exception as error:
        print(f'Login failed ({type(error).__name__}); account credentials were not logged', file=sys.stderr)
        return 2

    folder = args.image_dir or args.batch.parent / 'images'
    report, saved, failed = [], 0, 0
    for note in batch['notes']:
        source = note_id(note['url'])
        for image in note.get('images', []):
            if image['status'] != 'available':
                continue
            entry = {'source_id': source, 'order': image['order'], 'image_id': image['image_id']}
            try:
                if not re.fullmatch(r'[a-f0-9]{64}\.(jpg|png|webp|gif)', image['filename']):
                    raise ValueError('Invalid filename')
                started = time.monotonic()
                lines = recognise(engine, folder / image['filename'])
                entry['seconds'] = round(time.monotonic() - started, 2)
                text = '\n'.join(lines)[:MAX_TEXT]
                entry['text'] = text
                post(f"travel-sources/{source}/images/{image['image_id']}/text",
                     json.dumps({'engine': 'rapidocr', 'text': text}, ensure_ascii=False).encode())
                saved += 1
            except Exception as error:
                entry['error'] = type(error).__name__
                failed += 1
            report.append(entry)
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({'images_read': saved, 'images_failed': failed}))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
