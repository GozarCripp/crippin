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
        if "congress.gov" in url:
            self.assertEqual(headers.get("X-Api-Key"), "k")      # key goes in a header...
            self.assertNotIn("api_key", url)                      # ...never in the URL
            return json.dumps({"bill": {"title": "A Bill", "introducedDate": "2025-01-01",
                "sponsors": [{"fullName": "Rep. Test"}], "laws": [],
                "latestAction": {"actionDate": "2025-02-02", "text": "Referred to the Committee."}}}).encode()
        if "federalregister" in url:
            return json.dumps({"results": [{"title": "Rule", "html_url": "https://fr.gov/1",
                "type": "Rule", "publication_date": "2026-10-01", "agencies": [{"name": "SEC"}]},
                {"title": "Bad", "html_url": "http://fr.gov/2"}]}).encode()
        return json.dumps([{"name": "A", "category": "RWA", "tvl": 5e9, "change_1d": 1, "change_7d": 2, "slug": "a"},
                           {"name": "B", "category": "DEX", "tvl": 9e9}]).encode()

    def test_all_sections(self):
        fg = load("fetch_gov"); fg.fetch = self.fake
        os.environ["CONGRESS_API_KEY"] = "k"
        p = tempfile.mktemp(suffix=".json")
        self.assertEqual(fg.main(p), 0)
        d = json.load(open(p))
        self.assertEqual(d["bills"][0]["stage"], "COMMITTEE")
        self.assertEqual(len(d["rules"]), 1)                      # http link dropped
        self.assertEqual(d["rwa"]["total"], 5_000_000_000)        # only RWA category counted

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
