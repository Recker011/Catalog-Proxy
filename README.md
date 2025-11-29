# CAT-alog Proxy

CAT-alog Proxy is a Node.js service and browser dashboard that resolves media and cricket streaming sources into direct, playable URLs.

It is composed of:
- A Node.js HTTP server (see [`src/server.js`](src/server.js))
- A cricket scraping module (see [`src/cricwatch-scraper.js`](src/cricwatch-scraper.js))
- A rich single-page dashboard UI (see [`public/dashboard.html`](public/dashboard.html) and [`public/dashboard.js`](public/dashboard.js))

## Features

### Media streaming
- Multi-provider support: VidLink and Filmex (fmovies4u-style embeds)
- Content types: Movies, TV Series, Anime
- Integrated HLS player via dashboard
- Smart validation of TMDB / MAL identifiers

### Cricket streaming
- Category browsing from cricwatch.io
- Match discovery per category
- Stream URL extraction per match
- Optional "all-in-one" aggregation endpoint

### Status & observability
- Health endpoint and status dashboard
- Memory and uptime reporting
- Cache statistics for media and cricket caches

### Cache & API tooling
- Separate in-memory caches for media and cricket data
- Dashboard controls to inspect and clear caches
- Simple API explorer from the dashboard

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
  cricwatch-scraper.js  # Cricwatch.io scraping logic

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
- Internet connectivity to upstream providers (VidLink, Filmex/fmovies4u, cricwatch.io, etc.)

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
2. OS-specific default install locations (see [`src/server.js`](src/server.js) and [`src/cricwatch-scraper.js`](src/cricwatch-scraper.js))

If no executable is found, media stream resolution and cricket scraping endpoints will fail with `browser_not_found` errors.

You can test detection from the dashboard via the **Test Chrome Path** action, which calls the `/dashboard/test/chrome` endpoint.

### Other environment variables

- `PORT` – HTTP port for the Express server (default `4000`).
- `FILMEX_BASE_URL` – Base URL for the Filmex/fmovies4u-style provider used by `/v2/stream` (default `https://fmovies4u.com`).

## API overview

This section lists the main HTTP endpoints exposed by the server. For full request / response schemas and error codes, see [`SERVER_DOCUMENTATION.md`](SERVER_DOCUMENTATION.md).

### Media streaming

- `GET /stream` – Legacy VidLink-only stream resolver (movie / TV / anime).
- `GET /v2/stream` – Multi-provider resolver (VidLink, Filmex) with additional validation.

### Cricket streaming (v3)

- `GET /v3/cricket/categories` – List available cricket categories.
- `GET /v3/cricket/category/:slug/matches` – List matches for a category.
- `GET /v3/cricket/match/streams` – Extract streams for a specific match URL.
- `GET /v3/cricket/all` – Fetch categories, matches, and streams in a single call.

### Health & dashboard

- `GET /health` – Basic liveness and version information.
- `GET /dashboard/status` – Aggregated server and cache status.
- `DELETE /dashboard/cache` – Clear media and/or cricket caches.
- `GET /dashboard/cache/entries` – List cache entries for inspection.
- `POST /dashboard/test/chrome` – Test Chrome auto-detection or a user-specified path.

## Development notes

- The core HTTP server is implemented in [`src/server.js`](src/server.js).
- Cricket scraping logic is isolated in [`src/cricwatch-scraper.js`](src/cricwatch-scraper.js).
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
5. Open a pull request with a clear description of the changes.

## Support

If you run into issues:

1. Check [`SERVER_DOCUMENTATION.md`](SERVER_DOCUMENTATION.md) for API-level details.
2. Open the browser console on `dashboard.html` to inspect client-side errors.
3. Check the Node.js process logs or any configured log files under `logs/`.
4. Verify that Chrome / Chromium is installed and correctly detected.