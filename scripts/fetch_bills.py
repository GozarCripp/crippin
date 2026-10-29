#!/usr/bin/env python3
"""Daily bill tracker for CRIPPIN.

Pulls the real status of each tracked bill from the free Congress.gov API (title, sponsors,
latest action, how far it has made it) and writes data/bills.json, which the site reads.
Standard library only, so the GitHub Action needs no installs.

The API key comes ONLY from the CONGRESS_API_KEY environment variable (a GitHub Actions
secret). It is sent in a request header, never in a URL, and never written to the output.

Guarantee: the site is never left blank. With no key, or if Congress.gov is down, the old
file is kept. If one bill fails, its last good entry is kept and marked stale.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "bills.json"
API = "https://api.congress.gov/v3"
UA = "crippin-bills/1.0"
NOW = datetime.now(timezone.utc)

# ---- edit this to change which bills are tracked -------------------------------------
# (congress, bill type, number, display name, short tag). The tag matches the news topics
# in fetch_news.py, so each bill sits next to its news buzz on the page.
# Bill types: hr, s, hjres, sjres, hconres, sconres, hres, sres
BILLS = [
    (119, "hr", 3633, "CLARITY ACT", "CLARITY"),
    (119, "s", 1582, "GENIUS ACT", "GENIUS"),
]
# ---------------------------------------------------------------------------------------

PREFIX = {"hr": "H.R.", "s": "S.", "hjres": "H.J.Res.", "sjres": "S.J.Res.",
          "hconres": "H.Con.Res.", "sconres": "S.Con.Res.", "hres": "H.Res.", "sres": "S.Res."}
SLUG = {"hr": "house-bill", "s": "senate-bill", "hjres": "house-joint-resolution",
        "sjres": "senate-joint-resolution", "hconres": "house-concurrent-resolution",
        "sconres": "senate-concurrent-resolution", "hres": "house-resolution",
        "sres": "senate-resolution"}
# stage -> how far along (percent) for the progress bars
PROGRESS = {"INTRODUCED": 5, "COMMITTEE": 15, "REPORTED": 30, "PASSED HOUSE": 50,
            "PASSED SENATE": 50, "PASSED BOTH": 70, "TO PRESIDENT": 85, "VETOED": 85, "LAW": 100}


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def fetch(path, key):
    sep = "&" if "?" in path else "?"
    req = urllib.request.Request(f"{API}{path}{sep}format=json",
                                 headers={"User-Agent": UA, "X-Api-Key": key})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)


def clean(text, limit=220):
    text = re.sub(r"<[^>]+>", "", text or "")       # some action texts carry HTML
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def stage_of(bill, actions):
    """Work out how far a bill has made it, from its full action list."""
    if bill.get("laws"):
        return "LAW"
    texts = [(a.get("type") or "", a.get("text") or "") for a in actions]

    def has(pattern, types=None):
        return any(re.search(pattern, t, re.I) and (types is None or ty in types)
                   for ty, t in texts)

    if has(r"became public law|signed by president") or any(ty == "BecameLaw" for ty, _ in texts):
        return "LAW"
    if has(r"vetoed by president") or any(ty == "Veto" for ty, _ in texts):
        return "VETOED"
    if has(r"presented to president"):
        return "TO PRESIDENT"
    house = has(r"passed/agreed to in house|passed house|received in the senate")
    senate = has(r"passed/agreed to in senate|passed senate|received in the house")
    if house and senate:
        return "PASSED BOTH"
    if house:
        return "PASSED HOUSE"
    if senate:
        return "PASSED SENATE"
    if has(r"reported by|ordered to be reported|placed on .*calendar"):
        return "REPORTED"
    if has(r"referred to"):
        return "COMMITTEE"
    return "INTRODUCED"


def one(congress, btype, number, name, tag, key):
    base = f"/bill/{congress}/{btype}/{number}"
    bill = fetch(base, key)["bill"]
    actions = fetch(base + "/actions?limit=250", key).get("actions", [])
    stage = stage_of(bill, actions)
    latest = bill.get("latestAction") or {}
    laws = bill.get("laws") or []
    return {
        "id": f"{PREFIX.get(btype, btype.upper())}{number}",
        "congress": congress,
        "name": name,
        "tag": tag,
        "title": clean(bill.get("title"), 200),
        "stage": stage,
        "progress": PROGRESS[stage],
        "introduced": bill.get("introducedDate") or "",
        "sponsors": [{"name": clean(s.get("fullName"), 80), "party": s.get("party") or "",
                      "state": s.get("state") or ""} for s in bill.get("sponsors") or []],
        "cosponsors": (bill.get("cosponsors") or {}).get("count", 0),
        "latest": {"date": latest.get("actionDate") or "", "text": clean(latest.get("text"))},
        "law": f"Public Law {laws[0].get('number')}" if laws else "",
        "url": f"https://www.congress.gov/bill/{ordinal(congress)}-congress/{SLUG.get(btype, btype)}/{number}",
        "stale": False,
    }


def load_old(out):
    try:
        return {b["id"]: b for b in json.loads(Path(out).read_text(encoding="utf-8"))["bills"]}
    except Exception:
        return {}


def main(out=OUT):
    key = os.environ.get("CONGRESS_API_KEY", "").strip()
    if not key:
        print("CONGRESS_API_KEY is not set; keeping the old file", file=sys.stderr)
        return 0   # not an error: the workflow stays green until the secret is added
    old, bills, fresh = load_old(out), [], 0
    for congress, btype, number, name, tag in BILLS:
        bid = f"{PREFIX.get(btype, btype.upper())}{number}"
        try:
            bills.append(one(congress, btype, number, name, tag, key))
            fresh += 1
        except Exception as exc:   # one bad bill must not kill the run; never print the key
            print(f"bill failed: {bid} ({type(exc).__name__}: {exc})", file=sys.stderr)
            if bid in old:
                bills.append(dict(old[bid], stale=True))
    if not fresh:
        print("no bill could be fetched; keeping the old file", file=sys.stderr)
        return 1
    data = {"updated": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "Congress.gov API",
            "bills": bills}
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {fresh} fresh bills ({len(bills) - fresh} stale)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
