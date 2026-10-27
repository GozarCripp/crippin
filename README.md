# CRIPPIN

A retro console for learning about crypto tokens. Static site: no backend, no logins, no database.

- `index.html` markup · `style.css` theme · `app.js` live token engine
- Prices come from the public CoinGecko API, refreshed every 60s. If CoinGecko fails or rate-limits,
  the page switches to Kraken's public ticker (price only) for 5 minutes, and the last good prices are
  kept in the visitor's own browser so the list never goes blank. Old prices show their age.
- Fonts (Press Start 2P, IBM Plex Mono) are self-hosted in `fonts/` under the SIL Open Font License,
  so the page makes no Google Fonts request. Only CoinGecko and Kraken are allowed as outside connections.
- Add a token: add one line to `TOKENS` in `app.js`
- Ranking stats (SIZE / VOLUME / AGE / LIQUIDITY / BUZZ) are subjective and documented in `scoreOf()`

Not financial advice.

## Daily news
`.github/workflows/news.yml` runs `scripts/fetch_news.py` every day and writes `data/news.json`
(headlines only, each linking to its source). Edit `COINS` and `TOPICS` at the top of the script to change
what is tracked. To run it by hand: Actions tab, daily-news, Run workflow.
