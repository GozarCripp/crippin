#!/usr/bin/env python3
"""Daily government + tokenization data for CRIPPIN -> data/gov.json

Three sections, each independent (one failing never blocks the others; old data is kept):
  bills  Congress.gov API: real status, sponsor and last action for the bills you list below.
         Needs a free key in the CONGRESS_API_KEY secret. No key = this section is skipped.
  rules  Federal Register API (no key): newest crypto-related rules and notices.
  rwa    DefiLlama API (no key): real-world-asset ("tokenization") value locked.
Standard library only. The key goes in a request header and is never printed or saved.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "gov.json"
UA = "Mozilla/5.0 (compatible; crippin-data/1.0)"
NOW = datetime.now(timezone.utc)

# ---- edit these to change what the site tracks ---------------------------------------
CONGRESS = 119                       # 119th Congress (2025-2026)
BILLS = [("hr", "3633"), ("s", "1582")]   # (type, number). The page shows the real title the API
                                          # returns, so a wrong number is easy to spot.
FR_TERMS = ["cryptocurrency", '"digital asset"', "stablecoin", "blockchain"]
FR_KEEP = re.compile(r"crypto|digital asset|stablecoin|blockchain|virtual currenc|tokeniz", re.I)
FR_DAYS, FR_MAX = 120, 8
RWA_TOP = 8
# ---------------------------------------------------------------------------------------


def fetch(url, headers=None):
    h = {"User-Agent": UA}
    h.update(headers or {})
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
        return r.read()


def clean(text, limit=160):
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def stage(action, law):
    a = (action or "").lower()
    if law or "became public law" in a:
        return "LAW"
    if "passed" in a or "agreed to" in a:
        return "PASSED"
    if "referred" in a or "committee" in a:
        return "COMMITTEE"
    return "ACTIVE"


def bills(key):
    out = []
    for typ, num in BILLS:
        try:
            raw = fetch(f"https://api.congress.gov/v3/bill/{CONGRESS}/{typ}/{num}?format=json",
                        {"X-Api-Key": key})
            b = json.loads(raw)["bill"]
        except Exception as exc:                  # never include the URL/headers in logs
            code = getattr(exc, "code", "")      # e.g. 403 = bad key, 404 = wrong bill number
            print(f"bill {typ} {num} failed: {type(exc).__name__} {code}".strip(), file=sys.stderr)
            continue
        latest = b.get("latestAction") or {}
        spon = (b.get("sponsors") or [{}])[0]
        label = ("H.R. " if typ == "hr" else "S. ") + num
        slug = "house-bill" if typ == "hr" else "senate-bill"
        out.append({
            "id": label,
            "title": clean(b.get("title"), 110),
            "sponsor": clean(spon.get("fullName"), 60),
            "introduced": b.get("introducedDate"),
            "action": clean(latest.get("text"), 180),
            "action_date": latest.get("actionDate"),
            "stage": stage(latest.get("text"), b.get("laws")),
            "url": f"https://www.congress.gov/bill/{CONGRESS}th-congress/{slug}/{num}",
        })
    return out


def rules():
    since = (NOW - timedelta(days=FR_DAYS)).strftime("%Y-%m-%d")
    seen, items = set(), []
    for term in FR_TERMS:
        q = urllib.parse.urlencode([
            ("conditions[term]", term), ("conditions[publication_date][gte]", since),
            ("order", "newest"), ("per_page", "8"),
            ("fields[]", "title"), ("fields[]", "html_url"), ("fields[]", "type"),
            ("fields[]", "publication_date"), ("fields[]", "agencies"), ("fields[]", "abstract")])
        try:
            res = json.loads(fetch("https://www.federalregister.gov/api/v1/documents.json?" + q))
        except Exception as exc:
            print(f"federal register '{term}' failed: {type(exc).__name__}", file=sys.stderr)
            continue
        for d in res.get("results", []):
            url = d.get("html_url") or ""
            if not url.startswith("https://") or url in seen:
                continue
            # the API matches full text, so keep only rules that are actually about crypto
            if not FR_KEEP.search((d.get("title") or "") + " " + (d.get("abstract") or "")):
                continue
            seen.add(url)
            ag = (d.get("agencies") or [{}])[0].get("name") or "Federal Register"
            items.append({"title": clean(d.get("title"), 150), "agency": clean(ag, 50),
                          "type": clean(d.get("type"), 20), "date": d.get("publication_date"),
                          "url": url})
    items.sort(key=lambda x: x["date"] or "", reverse=True)
    return items[:FR_MAX]


def rwa():
    data = json.loads(fetch("https://api.llama.fi/protocols"))
    rows = [p for p in data if p.get("category") == "RWA" and isinstance(p.get("tvl"), (int, float))]
    rows.sort(key=lambda p: p["tvl"], reverse=True)
    top = []
    for p in rows[:RWA_TOP]:
        slug = p.get("slug")
        top.append({"name": clean(p.get("name"), 40), "tvl": round(p["tvl"]),
                    "d1": p.get("change_1d"), "d7": p.get("change_7d"),
                    "url": f"https://defillama.com/protocol/{slug}" if slug else None})
    return {"total": round(sum(p["tvl"] for p in rows)), "count": len(rows), "top": top}


def main(out=OUT):
    out = Path(out)
    try:
        old = json.loads(out.read_text(encoding="utf-8"))
    except Exception:
        old = {"bills": [], "rules": [], "rwa": {"total": None, "count": 0, "top": []}}
    data, ok = dict(old), 0

    key = os.environ.get("CONGRESS_API_KEY", "").strip()
    if key:
        got = bills(key)
        if not got:
            print("CONGRESS_API_KEY is set but no bills came back (see errors above)", file=sys.stderr)
        if got:
            data["bills"], ok = got, ok + 1
    else:
        print("no CONGRESS_API_KEY set: skipping bills", file=sys.stderr)
    try:
        got = rules()
        if got:
            data["rules"], ok = got, ok + 1
    except Exception as exc:
        print(f"rules failed: {type(exc).__name__}", file=sys.stderr)
    try:
        got = rwa()
        if got["top"]:
            data["rwa"], ok = got, ok + 1
    except Exception as exc:
        print(f"rwa failed: {type(exc).__name__}", file=sys.stderr)

    if ok == 0:
        print("nothing updated; keeping the old file", file=sys.stderr)
        return 1
    data["updated"] = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote: {len(data['bills'])} bills, {len(data['rules'])} rules, "
          f"{len(data['rwa'].get('top', []))} RWA protocols")
    return 0


if __name__ == "__main__":
    sys.exit(main())
