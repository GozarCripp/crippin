#!/usr/bin/env python3
"""Daily news builder for CRIPPIN.

Pulls HEADLINES ONLY (title, source name, link, time) from public RSS feeds and writes
data/news.json, which the site reads. No article text is copied; every story links out.
Standard library only, so the GitHub Action needs no installs.

Guarantee: at least 3 stories. If fewer than 3 are found, the script exits with an error
and leaves yesterday's file untouched, so the site is never left empty.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "news.json"
UA = "Mozilla/5.0 (compatible; crippin-news/1.0)"
NOW = datetime.now(timezone.utc)


def gnews(query, days):
    """Google News RSS search URL (no API key needed)."""
    q = urllib.parse.urlencode(
        {"q": f"{query} when:{days}d", "hl": "en-US", "gl": "US", "ceid": "US:en"})
    return "https://news.google.com/rss/search?" + q


# ---- edit these to change what the site tracks -------------------------------------
COINS = {"XRP": "XRP Ripple", "HBAR": "HBAR Hedera", "XLM": "Stellar XLM", "QNT": "Quant QNT crypto",
         "ALGO": "Algorand ALGO", "XDC": "XDC Network", "IOTA": "IOTA crypto", "ADA": "Cardano ADA"}
GENERAL = gnews("cryptocurrency", 2)
FALLBACK_FEEDS = ["https://www.coindesk.com/arc/outboundfeeds/rss/",
                  "https://cointelegraph.com/rss"]
# (display name, short tag, search query). Washington D.C. + tokenization world.
TOPICS = [
    ("CLARITY ACT",  "CLARITY",  "CLARITY Act crypto market structure"),
    ("GENIUS ACT",   "GENIUS",   "GENIUS Act stablecoin"),
    ("SEC + CRYPTO", "SEC",      "SEC crypto rules"),
    ("CONGRESS",     "CONGRESS", "Congress crypto bill Senate"),
    ("TOKENIZATION", "TOKEN",    "tokenization real-world assets"),
]
TOPIC_DAYS = 3
MAX_STORIES, MAX_LEGIS = 16, 8
# -------------------------------------------------------------------------------------


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()


def clean(text, limit=160):
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def parse(xml_bytes):
    """RSS -> list of {title, source, url, published}. Skips anything without an https link."""
    items = []
    root = ET.fromstring(xml_bytes)
    for it in root.iter("item"):
        title = clean(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        if not title or not link.startswith("https://"):
            continue
        src = it.find("source")
        source = clean(src.text, 40) if src is not None and src.text else ""
        # Google News titles look like "Headline - Source": split the source off
        if " - " in title:
            head, _, tail = title.rpartition(" - ")
            if head and (not source or tail.lower() == source.lower()):
                title, source = head, source or tail
        if not source:
            source = urllib.parse.urlparse(link).hostname or "source"
        try:
            published = parsedate_to_datetime(it.findtext("pubDate"))
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
        except Exception:
            published = NOW
        items.append({"title": title, "source": source, "url": link,
                      "published": published.astimezone(timezone.utc)})
    items.sort(key=lambda x: x["published"], reverse=True)
    return items


def safe(url):
    try:
        return parse(fetch(url))
    except Exception as exc:  # one dead feed must not kill the whole run
        print(f"feed failed: {url} ({exc})", file=sys.stderr)
        return []


def key(title):
    return re.sub(r"[^a-z0-9]+", "", title.lower())[:60]


def out_item(item, tag):
    return {"title": item["title"], "source": item["source"], "url": item["url"],
            "published": item["published"].strftime("%Y-%m-%dT%H:%M:%SZ"), "tag": tag}


def build():
    seen, stories, coin_counts = set(), [], {}

    def take(items, tag, n):
        got = 0
        for item in items:
            k = key(item["title"])
            if k in seen:
                continue
            seen.add(k)
            stories.append((item["published"], out_item(item, tag)))
            got += 1
            if got >= n:
                break

    # 1) the latest stories for each tracked coin (guarantees coin coverage)
    for sym, query in COINS.items():
        items = safe(gnews(query, 2))
        coin_counts[sym] = len(items)
        take(items, sym, 1)
    # 2) general crypto headlines
    take(safe(GENERAL), "CRYPTO", 4)
    # 3) only if still thin, fall back to direct crypto-news feeds
    if len(stories) < 3:
        for url in FALLBACK_FEEDS:
            take(safe(url), "CRYPTO", 3)
    stories.sort(key=lambda x: x[0], reverse=True)
    stories = [s for _, s in stories][:MAX_STORIES]

    # legislation + tokenization: headlines and "buzz" (how many stories in the last days)
    topics, legis, cutoff = [], [], NOW - timedelta(days=TOPIC_DAYS)
    legis_seen = set()
    for name, short, query in TOPICS:
        items = [i for i in safe(gnews(query, TOPIC_DAYS)) if i["published"] >= cutoff]
        count = len(items)
        topics.append({"name": name, "tag": short, "count": count,
                       "buzz": min(100, count * 5)})   # 20+ stories in 3 days = 100
        for item in items[:2]:
            k = key(item["title"])
            if k not in legis_seen:
                legis_seen.add(k)
                legis.append((item["published"], out_item(item, short)))
    legis.sort(key=lambda x: x[0], reverse=True)
    topics.sort(key=lambda t: t["buzz"], reverse=True)

    return {
        "updated": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stories": stories,
        "legislation": [l for _, l in legis][:MAX_LEGIS],
        "buzz": {"coins": coin_counts, "topics": topics},
    }


def main(out=OUT):
    data = build()
    if len(data["stories"]) < 3:
        print(f"only {len(data['stories'])} stories found; keeping the old file", file=sys.stderr)
        return 1
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(data['stories'])} stories, {len(data['legislation'])} legislation items")
    return 0


if __name__ == "__main__":
    sys.exit(main())
