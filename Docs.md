# VidLink Proxy – API & Frontend Integration Guide

This document describes how to integrate your frontend with the VidLink proxy server implemented in [`src/server.js`](src/server.js) and tested with [`public/test-player.html`](public/test-player.html).

## 1. Overview

The VidLink proxy is a small Node/Express service that:

- Accepts movie / TV / anime identifiers from your frontend.
- Uses headless Chrome (via [`resolveStreamUrl()`](src/server.js:108)) to resolve a playable `.m3u8` stream from `vidlink.pro`.
- Returns a short‑lived, direct HLS URL that you can feed into your own video player.

All responses are JSON. The primary endpoint is `GET /stream`.

Default listen port is **4000** (configurable via the `PORT` environment variable).

Base URL examples:

- Local development: `http://localhost:4000`
- Deployed: `https://your-domain.example.com`

## 2. Starting the server

1. Install dependencies:

```bash
npm install
```

2. Ensure a Chrome/Chromium browser is installed on the host. The proxy auto‑detects a binary path using [`resolveChromeExecutablePath()`](src/server.js:51). If detection fails, set one of:

- `CHROME_EXECUTABLE`
- `CHROME_PATH`

3. Start the server (examples):

```bash
node src/server.js
# or, if you have an npm script:
npm start
```

By default the test UI will be available at `http://localhost:4000/test-player.html`.

## 3. Authentication & security

The proxy as shipped does **not** enforce authentication, rate limiting, or origin restrictions. CORS is enabled globally via [`app.use(cors())`](src/server.js:241), which means any frontend can call the API.

In production you should typically:

- Put this service behind your own API gateway, or
- Add your own auth / API key middleware around the `/stream` route, and/or
- Restrict CORS to known origins.

## 4. Endpoint: `GET /stream`

Resolve a short‑lived video stream URL based on a movie / TV / anime identifier.

### 4.1. Query parameters

Common parameter:

- `type` **(required)** – one of: `movie`, `tv`, `anime`.

For **movies** (`type=movie`):

- `tmdbId` **(required)** – TMDB movie ID (string or number).

For **TV episodes** (`type=tv`):

- `tmdbId` **(required)** – TMDB TV show ID.
- `season` **(required)** – season number (e.g. `1`).
- `episode` **(required)** – episode number (e.g. `1`).

For **anime episodes** (`type=anime`):

- `malId` **(required)** – MyAnimeList ID.
- `number` **(required)** – episode number.
- `subOrDub` **(required)** – must be exactly `sub` or `dub` (case‑insensitive in the request; normalized server‑side).

Requests are validated by [`validateQuery()`](src/server.js:248). Invalid or missing parameters result in a `400` response with `error: "validation_error"`.

### 4.2. Example requests

**Movie**

```http
GET /stream?type=movie&tmdbId=786892 HTTP/1.1
Host: localhost:4000
```

```bash
curl "http://localhost:4000/stream?type=movie&tmdbId=786892"
```

**TV episode**

```bash
curl "http://localhost:4000/stream?type=tv&tmdbId=1399&season=1&episode=1"
```

**Anime episode**

```bash
curl "http://localhost:4000/stream?type=anime&malId=5114&number=1&subOrDub=sub"
```

### 4.3. Successful response shape

On success the handler at [`app.get('/stream', …)`](src/server.js:342) returns:

```json
{
  "ok": true,
  "url": "https://example.cdn.com/path/to/master.m3u8",
  "expiresAt": 1732780800000,
  "format": "hls",
  "fromCache": false
}
```

Field meanings:

- `ok` – always `true` on success.
- `url` – direct HLS `.m3u8` URL to feed into your player.
- `expiresAt` – Unix epoch milliseconds when this stream URL is expected to become invalid. The resolver currently assumes a 10‑minute validity window based on when the URL was captured.
- `format` – currently `"hls"` for `.m3u8` URLs, reserved for future formats.
- `fromCache` – `true` if this exact stream was served from the in‑memory LRU cache, `false` if it was freshly resolved via Puppeteer.

### 4.4. Caching behaviour

Resolved streams are cached in an in‑memory LRU cache configured in [`cache`](src/server.js:63) with:

- Maximum entries: `500`
- TTL: `7` minutes per entry

Cache keys:

- Movies: `movie:<tmdbId>`
- TV: `tv:<tmdbId>:<season>:<episode>`
- Anime: `anime:<malId>:<number>:<subOrDub>`

When a cached entry is valid (`expiresAt > Date.now()`), `/stream` responds directly with the cached data and sets `"fromCache": true`.

### 4.5. Error responses

Errors are normalized into a consistent JSON shape by the `/stream` route and the global error handler.

#### 4.5.1. Validation errors – `400`

Example (missing `tmdbId` for `type=movie`):

```json
{
  "ok": false,
  "error": "validation_error",
  "message": "For type \"movie\" you must provide the \"tmdbId\" query parameter.",
  "debug": "For type \"movie\" you must provide the \"tmdbId\" query parameter.",
  "details": {
    "missing": ["tmdbId"]
  }
}
```

Other validation cases include:

- `type` missing or not one of `movie`, `tv`, `anime`.
- Missing `tmdbId`, `season`, `episode` for TV.
- Missing `malId`, `number`, `subOrDub` for anime.
- `subOrDub` not equal to `sub` or `dub`.

#### 4.5.2. Stream not found – `404`

If VidLink does not expose a usable `.m3u8` URL for the requested title, [`resolveStreamUrl()`](src/server.js:108) throws a `stream_not_found` error, which `/stream` maps to:

```json
{
  "ok": false,
  "error": "stream_not_found",
  "message": "No playable stream could be found for this title. The upstream VidLink provider did not expose a usable .m3u8 URL.",
  "details": {
    "internalMessage": "stream_not_found: no .m3u8 URL detected via network or JWPlayer config"
  }
}
```

#### 4.5.3. Browser not found – `500`

When no Chrome/Chromium binary can be detected, [`resolveChromeExecutablePath()`](src/server.js:51) throws an error that `/stream` converts to:

```json
{
  "ok": false,
  "error": "browser_not_found",
  "message": "Chrome/Chromium browser could not be found on this machine. Install Chrome or set the CHROME_EXECUTABLE or CHROME_PATH environment variable to a valid Chrome/Chromium binary.",
  "details": {
    "internalMessage": "No Chrome executable found. Set CHROME_EXECUTABLE or CHROME_PATH environment variable to a valid Chrome/Chromium binary."
  }
}
```

#### 4.5.4. Upstream timeout – `504`

If VidLink is slow or unresponsive, a timeout error will be reported as:

```json
{
  "ok": false,
  "error": "upstream_timeout",
  "message": "Timed out while waiting for VidLink to respond. The upstream site may be slow or temporarily unavailable.",
  "details": {
    "internalMessage": "TimeoutError: Navigation timeout of 12000 ms exceeded"
  }
}
```

#### 4.5.5. Generic internal errors – `500`

Any other unexpected error becomes:

```json
{
  "ok": false,
  "error": "internal_error",
  "message": "An unexpected error occurred while processing your request."
}
```

In `NODE_ENV=development` the generic error handler in [`app.use((err, req, res, next) => …)`](src/server.js:457) also includes a `details` object with `message` and `stack`.

## 5. Endpoint: `GET /health`

A lightweight readiness probe implemented in [`app.get('/health', …)`](src/server.js:437).

```http
GET /health HTTP/1.1
Host: localhost:4000
```

Example response:

```json
{
  "ok": true,
  "status": "up"
}
```

## 6. Using the stream URL in a frontend

The `/stream` endpoint returns a direct `.m3u8` URL that you can play using:

- [`Hls.js`](https://github.com/video-dev/hls.js/) in most modern browsers.
- Native HLS support (`<video>` with `application/vnd.apple.mpegurl`) in Safari and some TV devices.

### 6.1. Basic Hls.js integration

```html
<video id="video" controls playsinline></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js"></script>
<script>
  async function playWithProxy() {
    const params = new URLSearchParams({ type: 'movie', tmdbId: '786892' });
    const res = await fetch('/stream?' + params.toString());
    const data = await res.json();

    if (!data.ok || !data.url) {
      console.error('Proxy error', data);
      return;
    }

    const video = document.getElementById('video');
    const streamUrl = data.url;

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().catch(() => {});
    } else {
      console.error('HLS not supported in this browser');
    }
  }

  playWithProxy();
</script>
```

In a single‑page app, you would typically:

- Call `/stream` when the user hits “Play”.
- Store `expiresAt` and refresh the stream if playback is attempted significantly after that time.

### 6.2. Cross‑origin considerations

Because the server enables CORS globally via [`app.use(cors())`](src/server.js:241), a frontend running on a different origin (e.g. `http://localhost:5173`) can call `http://localhost:4000/stream` directly.

If you deploy behind a different domain, update your frontend’s base URL for the proxy accordingly.

## 7. Example: using the proxy from a React component

```tsx
import { useEffect, useRef, useState } from 'react';

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let hls: any;

    async function load() {
      try {
        const params = new URLSearchParams({ type: 'movie', tmdbId: '786892' });
        const res = await fetch('http://localhost:4000/stream?' + params.toString());
        const data = await res.json();

        if (!data.ok || !data.url) {
          setError(data.message || 'Failed to resolve stream');
          return;
        }

        const video = videoRef.current;
        if (!video) return;

        if (window.Hls && window.Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(data.url);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = data.url;
        } else {
          setError('HLS not supported in this browser');
        }
      } catch (err: any) {
        setError(err?.message ?? String(err));
      }
    }

    load();

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, []);

  return (
    <div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <video ref={videoRef} controls playsInline />
    </div>
  );
}
```

## 8. Using the built‑in test player

The repository ships with a ready‑made test page at [`public/test-player.html`](public/test-player.html), served by Express via [`app.use(express.static(PUBLIC_DIR))`](src/server.js:245).

Once the server is running:

1. Open `http://localhost:4000/test-player.html` in your browser.
2. Choose a `type` (movie / tv / anime).
3. Fill in the appropriate IDs (e.g. TMDB ID, season, episode, MAL ID).
4. Click **Resolve & Play**.

The test page:

- Sends a request to `/stream` using `fetch`.
- Displays the raw JSON response in the “Last /stream response” panel.
- Uses Hls.js to play the resolved `url` inside a `<video>` element, falling back to native HLS when applicable.

Use this page as a reference implementation for your own frontend player.

## 9. Operational notes

- **Headless browser usage**: Each `/stream` miss in the cache launches a headless Chrome instance via Puppeteer (`puppeteer-core`). For heavy traffic you should:
  - Ensure sufficient CPU/memory.
  - Consider re‑using a browser instance or running multiple proxy instances behind a load balancer (customization required).
- **Port configuration**: override the default port 4000 by setting the `PORT` environment variable before starting the server.
- **Logging**: unhandled errors are logged to stdout/stderr. Integrate your preferred logging solution if you need structured logs or external aggregation.