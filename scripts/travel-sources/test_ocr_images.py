import unittest
from types import SimpleNamespace

from ocr_images import MIN_SCORE, recognise


class RecogniseTest(unittest.TestCase):
    def test_keeps_confident_lines_in_order_and_drops_blanks(self):
        engine = lambda path: SimpleNamespace(txts=['House Jia', '  ', 'h', 'Via Giuseppe 4/A'], scores=[1.0, 0.99, MIN_SCORE - 0.01, 0.9])
        self.assertEqual(recognise(engine, 'card.webp'), ['House Jia', 'Via Giuseppe 4/A'])

    def test_handles_an_image_with_no_text(self):
        engine = lambda path: SimpleNamespace(txts=None, scores=None)
        self.assertEqual(recognise(engine, 'sky.webp'), [])


if __name__ == '__main__':
    unittest.main()
