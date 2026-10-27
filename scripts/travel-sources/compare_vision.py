"""Compare place extraction by sending note images straight to a multimodal model.

The counterpart of the app's own path (local OCR, then a text model). Reads notes, images and
the app's prompt from the local prototype, calls an OpenAI-compatible endpoint, and prints the
places found with token usage. Needs GEMINI_API_KEY; spends real money, a few cents per run.
"""
import argparse
import base64
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'


def system_prompt():
    source = (ROOT / 'server/src/nest/travel-sources/llm-extract-places.ts').read_text()
    prompt = re.search(r'PLACE_EXTRACTION_SYSTEM = `(.*?)`;', source, re.S).group(1)
    # Same rules, but the model reads the pictures itself instead of OCR text.
    return prompt.replace('以及帖子图片中由 OCR 读出的文字（按图片序号标注）', '以及帖子的图片（按顺序为图1、图2……）') \
        .replace('对应图片的 OCR 文字', '对应图片中的文字')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=ROOT / '.local/travel-sources/prototype.sqlite')
    parser.add_argument('--images', type=Path, default=ROOT / '.local/travel-sources/images')
    parser.add_argument('--model', default='gemini-3.1-flash-lite')
    parser.add_argument('source_ids', nargs='+')
    args = parser.parse_args()
    db = sqlite3.connect(args.db)
    system = system_prompt()
    for source_id in args.source_ids:
        note = json.loads(db.execute('SELECT payload FROM travel_sources WHERE source_id = ?', (source_id,)).fetchone()[0])
        content = [{'type': 'text', 'text': f"标题：{note['title']}\n\n正文：\n{note['content']}"}]
        for image in note.get('images', []):
            if image['status'] != 'available':
                continue
            data = (args.images / image['filename']).read_bytes()
            content.append({'type': 'text', 'text': f"图{image['order']}："})
            content.append({'type': 'image_url', 'image_url': {'url': f"data:{image['content_type']};base64,{base64.b64encode(data).decode()}"}})
        body = {'model': args.model, 'temperature': 0, 'max_tokens': 8192, 'response_format': {'type': 'json_object'},
                'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': content}]}
        request = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), headers={
            'Content-Type': 'application/json', 'Authorization': 'Bearer ' + os.environ['GEMINI_API_KEY']})
        for attempt in range(2):
            try:
                with urllib.request.urlopen(request, timeout=300) as response:
                    result = json.load(response)
                break
            except urllib.error.HTTPError as error:
                # Hosted models shed load with 429/503 now and then; one retry after a pause.
                if attempt or error.code not in (429, 500, 502, 503, 504):
                    raise
                time.sleep(3)
        answer = json.loads(result['choices'][0]['message']['content'].strip().removeprefix('```json').removesuffix('```'))
        places = answer if isinstance(answer, list) else answer.get('places', [])
        print(json.dumps({'source_id': source_id, 'usage': result.get('usage'),
                          'places': [{'name': p.get('name'), 'address': p.get('address'), 'kind': p.get('kind')} for p in places]},
                         ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
