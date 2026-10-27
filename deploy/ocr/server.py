"""OCR sidecar for TREK guide images: POST image bytes to /ocr, get the recognised lines back.

Stdlib HTTP server around RapidOCR (CPU). It holds no state and keeps nothing: the image is
read in memory and dropped. Listen only on the compose network, never on a public port.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from rapidocr import RapidOCR

MAX_BYTES = 8 * 1024 * 1024
MIN_SCORE = 0.5
ENGINE = RapidOCR()
# The engine is not documented as thread-safe; one image at a time is plenty here.
LOCK = threading.Lock()


def recognise(data):
    with LOCK:
        result = ENGINE(data)
    texts = list(getattr(result, 'txts', None) or [])
    scores = list(getattr(result, 'scores', None) or [])
    return [text.strip() for text, score in zip(texts, scores) if text and text.strip() and score >= MIN_SCORE]


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self._send(200, {'status': 'ok'}) if self.path == '/health' else self._send(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/ocr':
            return self._send(404, {'error': 'not found'})
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > MAX_BYTES:
            return self._send(413, {'error': 'image must be 1 byte to 8 MB'})
        data = self.rfile.read(length)
        try:
            lines = recognise(data)
        except Exception as error:  # an unreadable image is the caller's problem, not a crash
            return self._send(422, {'error': f'could not read image ({type(error).__name__})'})
        self._send(200, {'lines': lines})

    def log_message(self, fmt, *args):
        pass  # requests carry user images; keep them out of the logs


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
