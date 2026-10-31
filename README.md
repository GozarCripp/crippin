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

## Bills, rules, tokenization
`scripts/fetch_gov.py` writes `data/gov.json` daily: bill status from the Congress.gov API (needs the free
`CONGRESS_API_KEY` repo secret; skipped without it), new crypto rules from the Federal Register, and real-world-asset
totals from DefiLlama. Edit `BILLS` at the top of the script to track other bills.

## Checks
`tests/` and `.github/workflows/checks.yml` run on every push. CodeQL and Dependabot are set up in `.github/`.

The token list is the group the crypto community most often links to the ISO 20022 messaging standard. That is community talk, not an official certification.
