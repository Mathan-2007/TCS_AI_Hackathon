import unittest

from analyze import parse_anchor


class AnchorParserTests(unittest.TestCase):
    def test_decimal_time_string(self):
        self.assertEqual(parse_anchor('10.00'), '10:00')

    def test_clock_time_string(self):
        self.assertEqual(parse_anchor('10:15'), '10:15')

    def test_invalid_value(self):
        self.assertIsNone(parse_anchor('abc'))


if __name__ == '__main__':
    unittest.main()
