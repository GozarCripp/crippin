"""Offline tests: fake network, check the guarantees the site relies on."""
import importlib.util, json, os, sys, tempfile, unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rss(n=6):
    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
    items = "".join(f"<item><title>Story {i} - Src</title><link>https://e.com/{i}</link>"
                    f"<pubDate>{now}</pubDate></item>" for i in range(n))
    items += "<item><title>insecure</title><link>http://e.com/x</link></item>"
    return f"<rss><channel>{items}</channel></rss>".encode()


class News(unittest.TestCase):
    def test_minimum_and_https(self):
        fn = load("fetch_news")
        fn.fetch = lambda url: rss()
        p = tempfile.mktemp(suffix=".json")
        self.assertEqual(fn.main(p), 0)
        d = json.load(open(p))
        self.assertGreaterEqual(len(d["stories"]), 3)
        self.assertTrue(all(s["url"].startswith("https://") for s in d["stories"]))

    def test_keeps_old_file_when_feeds_down(self):
        fn = load("fetch_news")
        def boom(url): raise OSError("down")
        fn.fetch = boom
        p = tempfile.mktemp(suffix=".json")
        self.assertEqual(fn.main(p), 1)
        self.assertFalse(os.path.exists(p))


class Gov(unittest.TestCase):
    def fake(self, url, headers=None):
        if "/actions" in url:
            return json.dumps({"actions": [
                {"actionDate": "2025-07-17", "text": "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 294 - 134."},
                {"actionDate": "2025-07-18", "text": "Received in the Senate."}]}).encode()
        if "congress.gov" in url:
            self.assertEqual(headers.get("X-Api-Key"), "k")      # key goes in a header...
            self.assertNotIn("api_key", url)                      # ...never in the URL
            return json.dumps({"bill": {"title": "A Bill", "introducedDate": "2025-01-01",
                "sponsors": [{"fullName": "Rep. Test"}], "laws": [],
                "latestAction": {"actionDate": "2025-02-02", "text": "Referred to the Committee."}}}).encode()
        if "federalregister" in url:
            return json.dumps({"results": [{"title": "Rule", "html_url": "https://fr.gov/1",
                "type": "Rule", "publication_date": "2026-10-01", "agencies": [{"name": "SEC"}],
                 "abstract": "Rules for stablecoin issuers."},
                {"title": "Medicare payment rule", "html_url": "https://fr.gov/3", "type": "Rule",
                 "publication_date": "2026-10-02", "agencies": [{"name": "CMS"}], "abstract": "Hospital payments."},
                {"title": "Bad", "html_url": "http://fr.gov/2"}]}).encode()
        return json.dumps([{"name": "A", "category": "RWA", "tvl": 5e9, "change_1d": 1, "change_7d": 2, "slug": "a"},
                           {"name": "B", "category": "DEX", "tvl": 9e9}]).encode()

    def test_all_sections(self):
        fg = load("fetch_gov"); fg.fetch = self.fake
        os.environ["CONGRESS_API_KEY"] = "k"
        p = tempfile.mktemp(suffix=".json")
        self.assertEqual(fg.main(p), 0)
        d = json.load(open(p))
        self.assertEqual(d["bills"][0]["stage"], "PASSED HOUSE")
        self.assertEqual(d["bills"][0]["ball"], "SENATE")           # House passed it: Senate's turn
        self.assertEqual(d["bills"][0]["house_passed"], "2025-07-17")
        self.assertEqual(len(d["rules"]), 1)                      # http link + off-topic rule dropped
        self.assertEqual(d["rwa"]["total"], 5_000_000_000)        # only RWA category counted

    def test_status_branches(self):
        fg = load("fetch_gov")
        s = lambda o, a, law=False: fg.status(o, a, law)[:2]
        self.assertEqual(s("House", []), ("IN HOUSE", "HOUSE"))
        self.assertEqual(s("Senate", []), ("IN SENATE", "SENATE"))
        self.assertEqual(s("Senate", [{"actionDate": "1", "text": "Passed Senate with an amendment"}]), ("PASSED SENATE", "HOUSE"))
        self.assertEqual(s("House", [{"actionDate": "1", "text": "Presented to President."}]), ("AT PRESIDENT", "PRESIDENT"))
        self.assertEqual(s("House", [{"actionDate": "1", "text": "Vetoed by President."}]), ("VETOED", "CONGRESS"))
        self.assertEqual(s("House", [{"actionDate": "1", "text": "Became Public Law No: 1."}]), ("LAW", "DONE"))
        self.assertEqual(s("House", None), ("ACTIVE", ""))          # unknown, so no guessing
        both = [{"actionDate": "1", "text": "Passed/agreed to in House: x"}, {"actionDate": "2", "text": "Passed/agreed to in Senate: y"}]
        self.assertEqual(s("House", both), ("PASSED BOTH", "CONGRESS"))

    def test_no_key_skips_bills_but_runs_rest(self):
        fg = load("fetch_gov"); fg.fetch = self.fake
        os.environ.pop("CONGRESS_API_KEY", None)
        p = tempfile.mktemp(suffix=".json")
        self.assertEqual(fg.main(p), 0)
        self.assertEqual(json.load(open(p))["bills"], [])

    def test_all_down_keeps_old(self):
        fg = load("fetch_gov")
        def boom(url, headers=None): raise OSError("down")
        fg.fetch = boom
        os.environ["CONGRESS_API_KEY"] = "k"
        self.assertEqual(fg.main(tempfile.mktemp(suffix=".json")), 1)


if __name__ == "__main__":
    unittest.main()
