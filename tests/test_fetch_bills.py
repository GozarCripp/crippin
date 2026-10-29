"""Offline tests for scripts/fetch_bills.py (no network, no key). Run: python -m unittest"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_bills as fb  # noqa: E402

BILL = {"bill": {"title": "A bill <b>to</b> do things", "introducedDate": "2025-05-29",
                 "sponsors": [{"fullName": "Rep. Example, A. [R-AR-2]", "party": "R", "state": "AR"}],
                 "cosponsors": {"count": 7},
                 "latestAction": {"actionDate": "2025-07-18", "text": "Received in the Senate."}}}
ACTIONS = {"actions": [{"type": "Floor", "text": "Received in the Senate."},
                       {"type": "Floor", "text": "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 308 - 122."},
                       {"type": "IntroReferral", "text": "Referred to the Committee on Financial Services."}]}


def fake_fetch(path, key):
    assert key == "test-key"
    return ACTIONS if "/actions" in path else BILL


class Stage(unittest.TestCase):
    def s(self, *texts, laws=None):
        return fb.stage_of({"laws": laws} if laws else {}, [{"type": "", "text": t} for t in texts])

    def test_stages(self):
        self.assertEqual(self.s(), "INTRODUCED")
        self.assertEqual(self.s("Referred to the Committee on Banking."), "COMMITTEE")
        self.assertEqual(self.s("Placed on Senate Legislative Calendar under General Orders."), "REPORTED")
        self.assertEqual(self.s("Passed/agreed to in Senate: Passed Senate with an amendment."), "PASSED SENATE")
        self.assertEqual(self.s("Received in the Senate."), "PASSED HOUSE")
        self.assertEqual(self.s("Passed Senate.", "Passed House."), "PASSED BOTH")
        self.assertEqual(self.s("Presented to President."), "TO PRESIDENT")
        self.assertEqual(self.s("Became Public Law No: 119-27."), "LAW")
        self.assertEqual(self.s(laws=[{"number": "119-27"}]), "LAW")

    def test_ordinal(self):
        self.assertEqual([fb.ordinal(n) for n in (119, 121, 122, 123, 111)],
                         ["119th", "121st", "122nd", "123rd", "111th"])


class Main(unittest.TestCase):
    def setUp(self):
        self.out = Path(tempfile.mkdtemp()) / "bills.json"

    def test_no_key_keeps_old_file(self):
        self.out.write_text("old")
        with mock.patch.dict("os.environ", {"CONGRESS_API_KEY": ""}):
            self.assertEqual(fb.main(self.out), 0)
        self.assertEqual(self.out.read_text(), "old")

    def test_writes_bills_without_key(self):
        with mock.patch.dict("os.environ", {"CONGRESS_API_KEY": "test-key"}), \
             mock.patch.object(fb, "fetch", fake_fetch):
            self.assertEqual(fb.main(self.out), 0)
        text = self.out.read_text()
        self.assertNotIn("test-key", text)
        b = json.loads(text)["bills"][0]
        self.assertEqual((b["id"], b["stage"], b["progress"]), ("H.R.3633", "PASSED HOUSE", 50))
        self.assertEqual(b["title"], "A bill to do things")
        self.assertEqual(b["url"], "https://www.congress.gov/bill/119th-congress/house-bill/3633")

    def test_api_down_keeps_old_file(self):
        self.out.write_text("old")
        def down(path, key): raise OSError("boom")
        with mock.patch.dict("os.environ", {"CONGRESS_API_KEY": "test-key"}), \
             mock.patch.object(fb, "fetch", down):
            self.assertEqual(fb.main(self.out), 1)
        self.assertEqual(self.out.read_text(), "old")

    def test_one_bill_down_reuses_last_good(self):
        old = {"bills": [{"id": "S.1582", "stage": "LAW", "stale": False}]}
        self.out.write_text(json.dumps(old))
        def half(path, key):
            if "/s/1582" in path: raise OSError("boom")
            return fake_fetch(path, key)
        with mock.patch.dict("os.environ", {"CONGRESS_API_KEY": "test-key"}), \
             mock.patch.object(fb, "fetch", half):
            self.assertEqual(fb.main(self.out), 0)
        bills = {b["id"]: b for b in json.loads(self.out.read_text())["bills"]}
        self.assertTrue(bills["S.1582"]["stale"])
        self.assertEqual(bills["S.1582"]["stage"], "LAW")


if __name__ == "__main__":
    unittest.main()
