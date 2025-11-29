# CAT-alog Proxy Server Documentation

This document describes the Node.js server that powers the CAT-alog Proxy: media stream resolution for TMDB / TV / Anime content, and cricket streaming data scraped from cricwatch.io.

The runtime entry point is [`src/server.js`](src/server.js).

## 1. High-level architecture

The project is made of three main pieces:

- **HTTP API server** (Express) – exposes media and cricket endpoints and serves static assets.
- **Cricket scraping layer** – a Puppeteer-based scraper for cricwatch.io (see [`src/cricwatch-scraper.js`](src/cricwatch-scraper.js)).
- **Browser dashboard** – a rich HTML/JS dashboard in [`public/dashboard.html`](public/dashboard.html) and [`public/dashboard.js`](public/dashboard.js) that talks to the server APIs.

The server uses:

- [`express`](package.json) for routing
- [`cors`](package.json) for cross-origin access
- [`lru-cache`](package.json) for per-request-type in-memory caching
- [`puppeteer-core`](package.json) to drive a local Chrome / Chromium instance

All HTTP traffic terminates at the Node.js process; the browser is only used headlessly to resolve upstream video or scrape cricket pages.

## 2. Running the server

### 2.1. Prerequisites

- Node.js 14+
- A locally installed Chrome or Chromium build
- Internet connectivity to the upstream providers (VidLink, Filmex/fmovies4u, cricwatch.io, etc.)

### 2.2. Install & start

From the repository root:

```bash
npm install

npm start           # production mode
# or
npm run dev        # with nodemon (requires devDependency)
```

By default the server listens on port 4000:

- Base URL: `http://localhost:4000`
- Overridable via environment variable `PORT`

### 2.3. Dashboard & test pages

Once the server is running, the following static pages are served from [`public/`](public):

- Dashboard UI: `http://localhost:4000/dashboard.html`
- Legacy media test player: `http://localhost:4000/test-player.html`
- Legacy cricket test interface: `http://localhost:4000/cricket-test.html`

These are ordinary static assets served via `express.static` from [`src/server.js`](src/server.js).

## 3. Chrome / Chromium configuration

The server never downloads its own Chromium build. Instead it uses [`puppeteer-core`](package.json) and locates an existing Chrome/Chromium executable on the host.

The resolution order is:

1. Environment variables:
   - `CHROME_EXECUTABLE`
   - `CHROME_PATH`
2. OS-specific default install locations:
   - Windows: typical `C:\Program Files` / `LOCALAPPDATA` Chrome paths
   - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
   - Linux: `/usr/bin/google-chrome`, `/usr/bin/chromium`, etc.

If no executable is found, stream resolution and cricket scraping endpoints will fail with an error code `browser_not_found`.

You can test Chrome detection from the dashboard via the `/dashboard/test/chrome` endpoint (see section 6.4).

## 4. Media streaming API

The media streaming API resolves upstream providers (VidLink, Filmex/fmovies4u) into direct, playable stream URLs. This is primarily used by the dashboard Media tab and the legacy `test-player.html` page.

Two HTTP endpoints are exposed:

- Legacy v1: `GET /stream`
- Provider-aware v2: `GET /v2/stream` (recommended)

Both endpoints perform the same high-level flow:

1. Validate the query parameters (content type, IDs, etc.).
2. Construct a provider-specific “embed page” URL.
3. Launch headless Chrome and open the page.
4. Intercept network traffic and/or inspect player configuration to find a playable `.m3u8` stream URL.
5. Return the final URL to the client and cache the result in memory.

### 4.1. Shared query parameters

All media endpoints expect a `type` query parameter:

- `type=movie` – single movie
- `type=tv` – TV series episode
- `type=anime` – anime episode

Depending on the type, additional parameters are required:

| type   | Required parameters                                       | Description                          |
|--------|-----------------------------------------------------------|--------------------------------------|
| movie | `tmdbId`                                                 | TMDB movie ID                        |
| tv    | `tmdbId`, `season`, `episode`                             | TMDB TV ID + season/episode numbers |
| anime | `malId`, `number`, `subOrDub` (`sub` or `dub`)            | MyAnimeList ID + episode + language |

Invalid or missing parameters return `400` with an error code `validation_error`.

### 4.2. GET /stream (legacy v1)

**Purpose**: Resolve a VidLink stream (movies, TV, anime) into a direct HLS stream URL.

**Endpoint**: `GET /stream`

**Required query parameters**: see section 4.1.

**Behavior**:

- The server builds a VidLink URL of the form:
  - Movie: `https://vidlink.pro/movie/{tmdbId}?player=jw`
  - TV: `https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?player=jw`
  - Anime: `https://vidlink.pro/anime/{malId}/{number}/{subOrDub}?player=jw`
- A headless Chrome session is launched to visit the page and detect an HLS playlist.
- Results are cached in an in-memory LRU cache with a default TTL of 7 minutes.

**Success response (200)**:

```json
{
  "ok": true,
  "url": "https://example.com/path/to/master.m3u8",
  "expiresAt": 1732876800000,
  "format": "hls",
  "fromCache": false
}
```

### 4.3. GET /v2/stream (multi-provider)

**Endpoint**: `GET /v2/stream`

This is the preferred media API. It supports multiple upstream providers and unified error handling.

**Query parameters**:

- All parameters from section 4.1 (`type`, IDs, etc.).
- `provider` (optional, default `vidlink`):
  - `vidlink` – resolves via `https://vidlink.pro`
  - `filmex` – resolves via Filmex/fmovies4u-style URLs

If `provider` is omitted, the server uses VidLink.

**Provider-specific behavior**:

- **VidLink (`provider=vidlink`)**
  - Uses the same URLs as `/stream` (section 4.2).
- **Filmex (`provider=filmex`)**
  - Base URL is read from environment variable `FILMEX_BASE_URL` or defaults to `https://fmovies4u.com`.
  - Movies: `/embed/tmdb-movie-{tmdbId}`
  - TV: `/embed/tmdb-tv-{tmdbId}/{season}/{episode}`
  - Anime is **not** supported for `filmex`.

Invalid providers return `400` with `validation_error` and a list of allowed providers.

**Success response (200)**:

```json
{
  "ok": true,
  "url": "https://example.com/path/to/master.m3u8",
  "expiresAt": 1732876800000,
  "format": "hls",
  "fromCache": false,
  "provider": "vidlink"
}
```

### 4.4. Media cache behavior

Both `/stream` and `/v2/stream` use an in-memory LRU cache with the following properties:

- Maximum entries: 500
- TTL: 7 minutes
- Cache key includes content type and IDs (and provider for v2).
- Cached items store `url`, `format`, and an `expiresAt` timestamp.

If a cached entry exists and has not yet expired, the API returns it immediately with `fromCache: true`.

## 5. Cricket streaming API (v3)

The v3 cricket API exposes cricwatch.io data via four endpoints:

- `GET /v3/cricket/categories`
- `GET /v3/cricket/category/:slug/matches`
- `GET /v3/cricket/match/streams`
- `GET /v3/cricket/all`

All cricket endpoints share a dedicated LRU cache separate from media caching.

### 5.1. Data model

Categories:

```json
{
  "name": "World Cup",
  "slug": "world-cup-streams",
  "url": "https://cricwatch.io/world-cup-streams"
}
```

Matches:

```json
{
  "title": "Australia vs England - World Cup Final",
  "url": "https://cricwatch.io/watch/australia-vs-england-final",
  "streamLinks": [
    { "name": "Link 1", "url": "https://cricwatch.io/link/123" }
  ]
}
```

Streams:

```json
{
  "url": "https://example.com/live/stream1.m3u8",
  "format": "hls",
  "quality": "unknown"
}
```

### 5.2. GET /v3/cricket/categories

**Purpose**: Return all discoverable cricket categories from the cricwatch.io landing page.

**Endpoint**: `GET /v3/cricket/categories`

**Response (200)**:

```json
{
  "ok": true,
  "data": [ /* array of category objects */ ],
  "fromCache": false
}
```

**Caching**:

- TTL: 15 minutes
- Cache key: `v3:cricket:categories`

### 5.3. GET /v3/cricket/category/:slug/matches

**Purpose**: Return all matches for a given cricwatch.io category.

**Endpoint**: `GET /v3/cricket/category/:slug/matches`

- `slug` is matched against the `slug` field in the categories.
- The scraper first fetches categories, then finds the matching category and uses its `url`.

**Response (200)**:

```json
{
  "ok": true,
  "data": [ /* array of match objects */ ],
  "fromCache": false
}
```

**Error responses**:

- `404` with `error: "category_not_found"` if no category matches the slug.
- `500` with `error: "scraping_error"` if scraping fails.

**Caching**:

- TTL: 10 minutes
- Cache key: `v3:cricket:category:{slug}:matches`

### 5.4. GET /v3/cricket/match/streams

**Purpose**: Extract stream URLs from a specific match page.

**Endpoint**: `GET /v3/cricket/match/streams?matchUrl={url}`

**Query parameters**:

- `matchUrl` (required): full URL of the match page on cricwatch.io.

Missing `matchUrl` returns `400` with `validation_error`.

**Response (200)**:

```json
{
  "ok": true,
  "data": [ /* array of stream objects */ ],
  "fromCache": false
}
```

**Caching**:

- TTL: 5 minutes
- Cache key: base64-encoded `matchUrl` under `v3:cricket:match:{b64}:streams`

### 5.5. GET /v3/cricket/all

**Purpose**: Convenience endpoint that returns the full hierarchy of categories → matches → streams in one call.

**Endpoint**: `GET /v3/cricket/all`

**Response (200)**:

```json
{
  "ok": true,
  "data": [
    {
      "name": "World Cup",
      "slug": "world-cup-streams",
      "url": "https://cricwatch.io/world-cup-streams",
      "matches": [
        {
          "title": "Australia vs England - World Cup Final",
          "url": "https://cricwatch.io/watch/australia-vs-england-final",
          "streams": [ /* stream objects */ ]
        }
      ]
    }
  ],
  "fromCache": false
}
```

**Caching**:

- TTL: 10 minutes
- Cache key: `v3:cricket:all`

## 6. Dashboard & management endpoints

In addition to media and cricket APIs, the server exposes a small set of operational endpoints used by the dashboard UI.

### 6.1. GET /health

**Purpose**: Basic liveness check.

**Endpoint**: `GET /health`

**Response (200)**:

```json
{
  "ok": true,
  "status": "up",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "memory": { /* Node.js process.memoryUsage() */ },
  "version": "3.0.0"
}
```

### 6.2. GET /dashboard/status

**Purpose**: Aggregated server and cache status for the dashboard Status tab.

**Endpoint**: `GET /dashboard/status`

Returns:

- Overall server uptime and memory usage.
- Cache statistics for media and cricket caches (size, max, TTL).
- A list of logical endpoint groups (media, cricket, utility).

### 6.3. DELETE /dashboard/cache

**Purpose**: Clear cache entries from one or both caches.

**Endpoint**: `DELETE /dashboard/cache`

**Query parameters**:

- `type` (optional): `media`, `cricket`, or `all` (default `all`).

**Response (200)**: JSON with `ok: true` and a human-readable message indicating which cache(s) were cleared.

### 6.4. GET /dashboard/cache/entries

**Purpose**: Introspect cache contents for debugging and monitoring.

**Endpoint**: `GET /dashboard/cache/entries`

**Query parameters**:

- `type` (optional): `media`, `cricket`, or `all`.

Returns a list of up to 100 entries with keys, approximate size, TTL, and cache type.

### 6.5. POST /dashboard/test/chrome

**Purpose**: Verify that Chrome/Chromium can be found on the host or that a user-specified path is valid.

**Endpoint**: `POST /dashboard/test/chrome`

**Request body (JSON)**:

```json
{ "chromePath": "C:/Program Files/Google/Chrome/Application/chrome.exe" }
```

If `chromePath` is provided, the endpoint checks whether the given path exists and returns a JSON payload indicating success or failure. If omitted, it runs the normal auto-detection logic and reports the detected path.

## 7. Error model

All public JSON APIs follow a consistent error model.

### 7.1. Error response shape

```json
{
  "ok": false,
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {
    "internalMessage": "Technical error details",
    "additionalInfo": "..."
  }
}
```

### 7.2. Common error codes

- `validation_error` – query string or body is invalid or incomplete.
- `stream_not_found` – upstream provider did not expose a playable `.m3u8` stream.
- `browser_not_found` – Chrome/Chromium binary not found on the host.
- `upstream_timeout` – upstream site is slow or unresponsive.
- `scraping_error` – cricket scraper failed to extract data.
- `category_not_found` – unknown cricket category slug (see 5.3).
- `cache_clear_error` – internal failure while clearing caches.
- `cache_list_error` – internal failure while enumerating cache entries.
- `chrome_test_error` – internal failure while testing Chrome paths.
- `not_found` – generic 404 for unknown routes.
- `internal_error` – generic 500 for unexpected failures.

## 8. Caching strategy

Two separate in-memory LRU caches are used:

- **Media cache** – for `/stream` and `/v2/stream` results
  - Max entries: 500
  - TTL: 7 minutes
- **Cricket cache** – for all `/v3/cricket/*` routes
  - Max entries: 100
  - TTLs by data type:
    - Categories: 15 minutes
    - Matches: 10 minutes
    - Match streams: 5 minutes
    - All data: 10 minutes

Both caches are in-memory only and are cleared when the Node.js process restarts.

## 9. Logging & diagnostics

Every incoming HTTP request is logged to stdout with method, URL, status code, and duration in milliseconds. Additional logging lives in the Node.js process and in the Chromium console (visible if you attach a debugger or run Puppeteer non-headless).

For production deployments, you may wish to redirect stdout/stderr to files or a logging system. A `logs/` directory is already present in the repository and can be used by external process managers.

## 10. Upstream services & legal notes

The server integrates with several third-party streaming and metadata providers, including but not limited to:

- `cricwatch.io`
- `https://livesport.su/`
- `https://vidsrc.cc/`
- `https://vidsrcme.ru/`
- `https://vidsrc.icu/`
- `https://autoembed.cc/`
- `https://vidsrc.to/`
- `https://vidlink.pro/`
- Filmex / `https://fmovies4u.com/` (or other base via `FILMEX_BASE_URL`)

These services may change behavior, HTML structure, or terms of use at any time. When using this project you are responsible for:

- Respecting each provider’s terms of service.
- Implementing appropriate rate limiting if you automate or expose the APIs publicly.
- Ensuring your usage of the scraped or proxied content complies with local law.

This documentation describes the technical behavior of the server only and does not constitute legal advice.