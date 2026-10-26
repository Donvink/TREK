"""Import a local collector batch and its image files into an authenticated TREK account."""
import argparse
import http.cookiejar
import json
import re
import sys
import urllib.request
from pathlib import Path
from collect_rednote import note_id
from note_images import MAX_IMAGE_BYTES, NoRedirect


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', required=True, type=Path)
    parser.add_argument('--account', required=True, type=Path, help='Local JSON containing email and password; never logged')
    parser.add_argument('--api-url', default='http://127.0.0.1:3001')
    parser.add_argument('--image-dir', type=Path)
    args = parser.parse_args()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), NoRedirect())
    def post(path, body, mime='application/json'):
        request = urllib.request.Request(args.api_url.rstrip('/') + '/api/' + path, data=body, headers={'Content-Type': mime})
        with opener.open(request, timeout=30) as response: return json.load(response)
    try:
        account = json.loads(args.account.read_text())
        batch = json.loads(args.batch.read_text())
        post('auth/login', json.dumps({'email': account['email'], 'password': account['password']}).encode())
        result = post('travel-sources/import', json.dumps(batch, ensure_ascii=False).encode())
        folder = args.image_dir or args.batch.parent / 'images'
        saved = failed = 0
        for note in batch['notes']:
            source = note_id(note['url'])
            for image in note.get('images', []):
                if image['status'] != 'available': continue
                try:
                    filename = image['filename']
                    if not re.fullmatch(r'[a-f0-9]{64}\.(jpg|png|webp|gif)', filename): raise ValueError('Invalid filename')
                    path = folder / filename
                    if path.stat().st_size > MAX_IMAGE_BYTES: raise ValueError('Image too large')
                    post(f"travel-sources/{source}/images/{image['image_id']}", path.read_bytes(), image['content_type'])
                    saved += 1
                except Exception:
                    failed += 1
        print(json.dumps({'notes': result, 'images_saved': saved, 'images_failed': failed}))
        return 1 if failed else 0
    except Exception as error:
        print(f'Import failed ({type(error).__name__}); account credentials were not logged', file=sys.stderr)
        return 2


if __name__ == '__main__': sys.exit(main())
