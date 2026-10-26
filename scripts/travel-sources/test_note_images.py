import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from note_images import MAX_IMAGE_BYTES, download_image, image_type, validate_image_url


class ImageTests(unittest.TestCase):
    def test_only_supported_https_image_cdns(self):
        validate_image_url('https://sns-web-i10.rednotecdn.com/image')
        for url in ['https://example.com/image', 'https://xhscdn.com.evil.test/image', 'http://sns.xhscdn.com/image', 'https://user@sns.xhscdn.com/image', 'https://sns.xhscdn.com:8443/image']:
            with self.assertRaises(ValueError): validate_image_url(url)

    def test_image_signatures_reject_html_and_svg(self):
        self.assertEqual(image_type(b'RIFFxxxxWEBPabc'), ('image/webp', 'webp'))
        for data in [b'<html>login</html>', b'<svg/>', b'RIFFxxxxWAVEabc']:
            with self.assertRaises(ValueError): image_type(data)

    def test_download_is_content_addressed_and_rejects_oversize(self):
        class Response(io.BytesIO):
            headers = {}
        class Opener:
            def open(self, *args, **kwargs): return Response(b'\xff\xd8\xfftest')
        with tempfile.TemporaryDirectory() as directory, patch('note_images.urllib.request.build_opener', return_value=Opener()):
            folder = Path(directory)
            a = download_image('https://sns.xhscdn.com/image', folder, 'https://www.xiaohongshu.com')
            b = download_image('https://sns.xhscdn.com/image', folder, 'https://www.xiaohongshu.com')
            self.assertEqual(a, b)
            self.assertEqual(len(list(folder.iterdir())), 1)
            self.assertEqual((folder / a['filename']).read_bytes(), b'\xff\xd8\xfftest')
        class HugeOpener:
            def open(self, *args, **kwargs):
                response = Response(b'')
                response.headers = {'Content-Length': str(MAX_IMAGE_BYTES + 1)}
                return response
        with tempfile.TemporaryDirectory() as directory, patch('note_images.urllib.request.build_opener', return_value=HugeOpener()):
            with self.assertRaisesRegex(ValueError, 'image_too_large'):
                download_image('https://sns.xhscdn.com/image', Path(directory), 'https://www.xiaohongshu.com')
            self.assertFalse(list(Path(directory).iterdir()))


if __name__ == '__main__': unittest.main()
