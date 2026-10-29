# CRIPPIN

A retro console for learning about crypto tokens. Static site: no backend, no logins, no database.

- `index.html` markup · `style.css` theme · `app.js` live token engine
- Prices come from the public CoinGecko API, refreshed every 60s
- Add a token: add one line to `TOKENS` in `app.js`
- Ranking stats (SIZE / VOLUME / AGE / LIQUIDITY / BUZZ) are subjective and documented in `scoreOf()`

Not financial advice.

## Daily news
`.github/workflows/news.yml` runs `scripts/fetch_news.py` every day and writes `data/news.json`
(headlines only, each linking to its source). Edit `COINS` and `TOPICS` at the top of the script to change
what is tracked. To run it by hand: Actions tab, daily-news, Run workflow.

## Daily bill status
`.github/workflows/bills.yml` runs `scripts/fetch_bills.py` every day and writes `data/bills.json`: each tracked
bill's real stage, sponsor, cosponsor count and latest action, straight from the free Congress.gov API. The
LEGISLATION panel shows them above the news buzz. Edit `BILLS` at the top of the script to track more.

To switch it on: get a free key at https://api.data.gov/signup/, then in the repo go to Settings, Secrets and
variables, Actions, New repository secret, name it `CONGRESS_API_KEY`. The key lives only there; it is never
in the page or the repo. Without it the job does nothing and the site keeps showing the buzz view.
Tests (offline, no key): `python -m unittest discover -s tests`.
