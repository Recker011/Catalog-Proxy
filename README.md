# CAT-alog Proxy

CAT-alog Proxy is a Node.js service and browser dashboard that resolves media and sports streaming sources into direct, playable URLs.

It is composed of:
- A Node.js HTTP server (see [`src/server.js`](src/server.js))
- A sports scraping module (see [`src/totalsportek-scraper.js`](src/totalsportek-scraper.js))
- A rich single-page dashboard UI (see [`public/dashboard.html`](public/dashboard.html) and [`public/dashboard.js`](public/dashboard.js))

## Features

### Media streaming
- Multi-provider support: VidLink and Filmex (fmovies4u-style embeds)
- Content types: Movies, TV Series, Anime
- Integrated HLS player via dashboard
- Smart validation of TMDB / MAL identifiers

### Sports streaming (NEW - totalsportek.es)
- Multiple sports: Football, NBA, UFC, Boxing, MMA, Tennis, and more
- Category browsing from totalsportek.es
- Event discovery per category
- Stream URL extraction per event
- Higher quality streams and more reliable links
- Optional "all-in-one" aggregation endpoint

### Status & observability
- Health endpoint and status dashboard
- Memory and uptime reporting
- Cache statistics for media and sports caches

### Cache & API tooling
- Separate in-memory caches for media and sports data
- Dashboard controls to inspect and clear caches
- Simple API explorer from dashboard

For low-level server and API details, see [`SERVER_DOCUMENTATION.md`](SERVER_DOCUMENTATION.md).

## Repository layout

```text
public/
  dashboard.html        # Main dashboard UI
  dashboard.js          # Dashboard logic and API client
  cricket-test.html     # Legacy cricket test interface
  test-player.html      # Legacy media player interface

src/
  server.js             # Express server and API definitions
  totalsportek-scraper.js  # Totalsportek.es scraping logic
  cricwatch-scraper.js  # Legacy Cricwatch.io scraping logic (deprecated)

logs/
  combined.log          # Example combined log output
  error.log             # Example error log output

SERVER_DOCUMENTATION.md # Full server & API reference
README.md               # This file
```

## Getting started

### Prerequisites

- Node.js 14+
- A locally installed Chrome or Chromium build
- Internet connectivity to upstream providers (VidLink, Filmex/fmovies4u, totalsportek.es, etc.)

### Installation

From the repository root:

```bash
npm install
```

### Running the server

```bash
# Production-style run
npm start

# Development with automatic reload
npm run dev
```

The server listens on port `4000` by default. You can override this by setting the `PORT` environment variable.

Once running, visit:

- Dashboard: `http://localhost:4000/dashboard.html`
- Legacy media test player: `http://localhost:4000/test-player.html`
- Legacy cricket test UI: `http://localhost:4000/cricket-test.html`
- Health check: `http://localhost:4000/health`

## Configuration

The most important configuration is where Chrome / Chromium is installed. The server uses [`puppeteer-core`](package.json) and **does not** download its own browser binary.

### Browser location

Chrome detection order:

1. Environment variables:
   - `CHROME_EXECUTABLE`
   - `CHROME_PATH`
2. OS-specific default install locations (see [`src/server.js`](src/server.js) and [`src/totalsportek-scraper.js`](src/totalsportek-scraper.js))

If no executable is found, media stream resolution and sports scraping endpoints will fail with `browser_not_found` errors.

You can test detection from the dashboard via **Test Chrome Path** action, which calls the `/dashboard/test/chrome` endpoint.

### Other environment variables

- `PORT` – HTTP port for Express server (default `4000`).
- `FILMEX_BASE_URL` – Base URL for Filmex/fmovies4u-style provider used by `/v2/stream` (default `https://fmovies4u.com`).

## API overview

This section lists the main HTTP endpoints exposed by the server. For full request/response schemas and error codes, see [`SERVER_DOCUMENTATION.md`](SERVER_DOCUMENTATION.md).

### Media streaming

- `GET /stream` – Legacy VidLink-only stream resolver (movie / TV / anime).
- `GET /v2/stream` – Multi-provider resolver (VidLink, Filmex) with additional validation.

### Sports streaming (v3) - NEW

- `GET /v3/sports/categories` – List available sports categories (Football, NBA, UFC, etc.).
- `GET /v3/sports/category/:slug/events` – List events for a sports category.
- `GET /v3/sports/event/streams` – Extract streams for a specific sports event.
- `GET /v3/sports/all` – Fetch categories, events, and streams in a single call.

### Cricket streaming (v3) - Legacy

- `GET /v3/cricket/categories` – Redirects to sports categories.
- `GET /v3/cricket/category/:slug/matches` – Redirects to sports events.
- `GET /v3/cricket/match/streams` – Redirects to sports event streams.
- `GET /v3/cricket/all` – Redirects to all sports data.

### Health & dashboard

- `GET /health` – Basic liveness and version information.
- `GET /dashboard/status` – Aggregated server and cache status.
- `DELETE /dashboard/cache` – Clear media and/or sports caches.
- `GET /dashboard/cache/entries` – List cache entries for inspection.
- `POST /dashboard/test/chrome` – Test Chrome auto-detection or a user-specified path.

## Migration from cricwatch.io to totalsportek.es

The system has been migrated from cricwatch.io to totalsportek.es for better streaming quality and broader sports coverage:

### Benefits of the migration:
- **More Sports**: Football, NBA, UFC, Boxing, MMA, Tennis, and more
- **Better Quality**: Higher quality streams and more reliable links
- **Simpler Structure**: Easier to scrape and more consistent data
- **Legacy Support**: Old cricket endpoints redirect to new sports endpoints

### API changes:
- Old cricket endpoints (`/v3/cricket/*`) now redirect to new sports endpoints (`/v3/sports/*`)
- Frontend has been updated to show "Sports Streaming" instead of "Cricket Streaming"
- Data structure changed from "matches" to "events" to reflect broader sports coverage
- All existing functionality preserved with enhanced capabilities

### Backward compatibility:
- Legacy cricket endpoints continue to work via HTTP redirects
- Existing integrations will continue to function
- Dashboard automatically uses new endpoints while maintaining familiar interface

## Development notes

- The core HTTP server is implemented in [`src/server.js`](src/server.js).
- Sports scraping logic is isolated in [`src/totalsportek-scraper.js`](src/totalsportek-scraper.js).
- Legacy cricket scraping logic remains in [`src/cricwatch-scraper.js`](src/cricwatch-scraper.js) for backward compatibility.
- The dashboard UI lives in [`public/dashboard.html`](public/dashboard.html) and [`public/dashboard.js`](public/dashboard.js).
- All detailed API semantics, including error codes and caching behavior, are documented in [`SERVER_DOCUMENTATION.md`](SERVER_DOCUMENTATION.md).

## License

This project is licensed under the MIT License. See the `license` field in [`package.json`](package.json) for details.

## Contributing

Typical contribution workflow:

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and add tests or manual verification steps as appropriate.
4. Run the server locally and verify the dashboard and APIs.
5. Open a pull request with a clear description of changes.

## Support

If you run into issues:

1. Check [`SERVER_DOCUMENTATION.md`](SERVER_DOCUMENTATION.md) for API-level details.
2. Open the browser console on `dashboard.html` to inspect client-side errors.
3. Check the Node.js process logs or any configured log files under `logs/`.
4. Verify that Chrome / Chromium is installed and correctly detected.
5. For sports streaming issues, verify connectivity to totalsportek.es.