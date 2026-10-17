import csv
import http.client
import io
import json
import tempfile
import traceback
import unittest
import urllib.error
import urllib.parse
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, call, patch

from ml import train_price_forecast as forecast


def response_with(payload):
    response = MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(payload).encode("utf-8")
    return response


class KamisRetryTests(unittest.TestCase):
    def setUp(self):
        self.params = {"action": "periodWholesaleProductList", "p_cert_key": "secret-test-key"}
        self.payload = {"data": {"error_code": "000", "item": []}}
        self.output = self.enterContext(patch("sys.stdout", new_callable=io.StringIO))
        self.urlopen = self.enterContext(patch.object(forecast.urllib.request, "urlopen"))
        self.sleep = self.enterContext(patch.object(forecast.time, "sleep"))

    def test_transient_connection_errors_retry_and_recover(self):
        errors = [
            http.client.RemoteDisconnected("closed"),
            http.client.IncompleteRead(b"partial"),
            urllib.error.URLError("closed"),
            TimeoutError("timed out"),
            ConnectionResetError("reset"),
        ]
        for error in errors:
            with self.subTest(error=type(error).__name__):
                self.urlopen.reset_mock()
                self.sleep.reset_mock()
                self.urlopen.side_effect = [error, response_with(self.payload)]
                self.assertEqual(forecast.request_kamis_json(self.params), self.payload)
                self.assertEqual(self.urlopen.call_count, 2)
                self.sleep.assert_called_once_with(1)

    def test_exhausted_retries_are_bounded_and_hide_credentials(self):
        self.urlopen.side_effect = urllib.error.URLError("secret-test-key")
        try:
            forecast.request_kamis_json(self.params)
        except RuntimeError as error:
            self.assertIn("4회 시도", str(error))
            self.assertNotIn("secret-test-key", traceback.format_exc())
        else:
            self.fail("Expected retry exhaustion")
        self.assertEqual(self.urlopen.call_count, 4)
        self.assertEqual(self.sleep.call_args_list, [call(1), call(2), call(4)])
        self.assertNotIn("secret-test-key", self.output.getvalue())

    def test_temporary_http_errors_retry(self):
        for status in (429, 500, 502, 503, 504):
            with self.subTest(status=status):
                self.urlopen.reset_mock()
                self.urlopen.side_effect = [
                    urllib.error.HTTPError("secret-test-key", status, "unavailable", {}, None),
                    response_with(self.payload),
                ]
                self.assertEqual(forecast.request_kamis_json(self.params), self.payload)
                self.assertEqual(self.urlopen.call_count, 2)

    def test_permanent_http_errors_fail_without_retry(self):
        for status in (400, 401, 403, 404):
            with self.subTest(status=status):
                self.urlopen.reset_mock()
                self.urlopen.side_effect = urllib.error.HTTPError("secret-test-key", status, "denied", {}, None)
                with self.assertRaisesRegex(RuntimeError, f"HTTP 오류 {status}"):
                    forecast.request_kamis_json(self.params)
                self.assertEqual(self.urlopen.call_count, 1)
        self.sleep.assert_not_called()

    def test_daily_requests_use_retry_policy(self):
        self.urlopen.side_effect = [http.client.RemoteDisconnected("closed"), response_with(self.payload)]
        env = {"KAMIS_CERT_KEY": "secret-test-key", "KAMIS_CERT_ID": "test"}
        self.assertEqual(forecast.kamis_request(date(2026, 10, 15), env), self.payload)
        self.assertEqual(self.urlopen.call_count, 2)

    def test_api_authentication_error_is_not_retried(self):
        self.urlopen.return_value = response_with({"data": {"error_code": "200"}})
        with self.assertRaisesRegex(RuntimeError, "오류 코드 200"):
            forecast.unwrap_items(forecast.request_kamis_json(self.params))
        self.assertEqual(self.urlopen.call_count, 1)
        self.sleep.assert_not_called()

    def test_period_collection_retries_and_preserves_existing_file_on_failure(self):
        day = date(2026, 10, 15)
        profile = {"item_name": "배추", "item_code": "211", "kind_code": "01",
                   "rank_code": "04", "rank": "상품", "unit": "kg", "dpr1": "1000"}
        daily_payload = {"data": {"error_code": "000", "item": [profile]}}
        period_payload = {"data": {"error_code": "000", "item": [
            {"marketname": "서울", "regday": "10/15", "yyyy": "2026", "price": "1,000"},
            {"marketname": "부산", "regday": "10/15", "yyyy": "2026", "price": "1,200"},
        ]}}
        for recover in (True, False):
            with self.subTest(recover=recover), tempfile.TemporaryDirectory() as directory:
                raw = Path(directory)
                target = raw / "kamis_prices_period.csv"
                target.write_text("existing data", encoding="utf-8")
                period_calls = []

                def urlopen(url, timeout):
                    self.assertEqual(timeout, 30)
                    action = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["action"][0]
                    if action == "dailyPriceByCategoryList":
                        return response_with(daily_payload)
                    period_calls.append(action)
                    if not recover or len(period_calls) == 1:
                        raise http.client.RemoteDisconnected("closed")
                    return response_with(period_payload)

                self.urlopen.side_effect = urlopen
                with patch.object(forecast, "RAW", raw), \
                     patch.object(forecast, "KAMIS_CATEGORIES", ("200",)), \
                     patch.object(forecast, "load_env", return_value={
                         "KAMIS_CERT_KEY": "secret-test-key", "KAMIS_CERT_ID": "test",
                     }):
                    if recover:
                        self.assertEqual(forecast.fetch_period_prices(day, day), target)
                        with target.open(encoding="utf-8-sig", newline="") as handle:
                            rows = list(csv.DictReader(handle))
                        self.assertEqual(len(rows), 1)
                        self.assertEqual(rows[0]["price"], "1100.0")
                        self.assertEqual(rows[0]["date"], day.isoformat())
                        self.assertEqual(len(period_calls), 2)
                    else:
                        with self.assertRaisesRegex(RuntimeError, "4회 시도"):
                            forecast.fetch_period_prices(day, day)
                        self.assertEqual(target.read_text(encoding="utf-8"), "existing data")
                        self.assertEqual(len(period_calls), 4)


if __name__ == "__main__":
    unittest.main()
