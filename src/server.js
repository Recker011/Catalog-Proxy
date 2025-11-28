const express = require('express');
const cors = require('cors');
const { LRUCache } = require('lru-cache');
const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const path = require('path');
 
const PORT = Number(process.env.PORT) || 4000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ---------- Utility: Chrome executable path detection ----------

function getChromeExecutableCandidates() {
  const candidates = [];

  // Environment variables first
  if (process.env.CHROME_EXECUTABLE) {
    candidates.push(process.env.CHROME_EXECUTABLE);
  }
  if (process.env.CHROME_PATH) {
    candidates.push(process.env.CHROME_PATH);
  }

  const platform = os.platform();

  if (platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    );
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    );
  } else {
    // Common Linux locations
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    );
  }

  // Filter out empties and non-existing
  return candidates.filter(p => p && fs.existsSync(p));
}

function resolveChromeExecutablePath() {
  const candidates = getChromeExecutableCandidates();
  if (candidates.length === 0) {
    throw new Error(
      'No Chrome executable found. Set CHROME_EXECUTABLE or CHROME_PATH environment variable to a valid Chrome/Chromium binary.'
    );
  }
  return candidates[0];
}

// ---------- LRU Cache for resolved streams ----------

const cache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 7 // 7 minutes
});

function buildCacheKey(params) {
  const { type } = params;
  if (type === 'movie') {
    return `movie:${params.tmdbId}`;
  }
  if (type === 'tv') {
    return `tv:${params.tmdbId}:${params.season}:${params.episode}`;
  }
  if (type === 'anime') {
    return `anime:${params.malId}:${params.number}:${params.subOrDub}`;
  }
  return null;
}

// ---------- VidLink URL builder ----------

function buildVidLinkUrl(params) {
  const { type } = params;

  if (type === 'movie') {
    return `https://vidlink.pro/movie/${encodeURIComponent(params.tmdbId)}?player=jw`;
  }

  if (type === 'tv') {
    return `https://vidlink.pro/tv/${encodeURIComponent(params.tmdbId)}/${encodeURIComponent(
      params.season
    )}/${encodeURIComponent(params.episode)}?player=jw`;
  }

  if (type === 'anime') {
    return `https://vidlink.pro/anime/${encodeURIComponent(params.malId)}/${encodeURIComponent(
      params.number
    )}/${encodeURIComponent(params.subOrDub)}?player=jw`;
  }

  throw new Error(`Unsupported type: ${type}`);
}

// ---------- Puppeteer-based stream resolver ----------

async function resolveStreamUrl(vidlinkUrl) {
  const executablePath = resolveChromeExecutablePath();

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  let page;
  let streamUrl = null;

  try {
    page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      Referer: 'https://vidlink.pro/',
      Origin: 'https://vidlink.pro'
    });

    await page.setRequestInterception(true);

    page.on('request', (req) => {
      const resourceType = req.resourceType();
      // Block unnecessary resources to speed things up
      if (['image', 'stylesheet', 'font', 'other'].includes(resourceType)) {
        return req.abort();
      }
      return req.continue();
    });

    page.on('response', async (res) => {
      try {
        if (streamUrl) return;

        const url = res.url();
        const status = res.status();
        const headers = res.headers();
        const contentType = (headers['content-type'] || '').toLowerCase();

        if (status !== 200) return;

        const looksLikeHls =
          url.includes('.m3u8') ||
          contentType.includes('application/x-mpegurl') ||
          (url.includes('/hls/') && url.toLowerCase().includes('master'));

        if (!looksLikeHls) return;

        const contentLength = headers['content-length']
          ? parseInt(headers['content-length'], 10)
          : null;

        // Filter out tiny/placeholder manifests if content-length is known
        if (contentLength !== null && contentLength < 1024) {
          return;
        }

        streamUrl = url;
      } catch (e) {
        // Ignore response inspection errors
      }
    });

    await page.goto(vidlinkUrl, {
      waitUntil: 'networkidle2',
      timeout: 12000
    });

    // Wait up to ~10 seconds for network interception to find a stream URL
    const start = Date.now();
    while (!streamUrl && Date.now() - start < 10000) {
      await new Promise((r) => setTimeout(r, 500));
    }

    // Fallback: try to read from JWPlayer config in the page
    if (!streamUrl) {
      streamUrl = await page.evaluate(() => {
        try {
          if (window.jwplayer) {
            const player = window.jwplayer();
            if (!player || !player.getPlaylist) return null;

            const playlist = player.getPlaylist();
            if (!playlist || !playlist.length) return null;

            const sources = playlist[0].sources || [];
            const src =
              sources.find((s) => s.file && s.file.endsWith('.m3u8')) ||
              sources.find((s) => s.file && s.file.includes('.m3u8')) ||
              sources[0];

            return src && src.file ? src.file : null;
          }
        } catch (err) {
          // ignore
        }
        return null;
      });
    }

    if (!streamUrl) {
      throw new Error('stream_not_found: no .m3u8 URL detected via network or JWPlayer config');
    }

    const format = streamUrl.includes('.m3u8') ? 'hls' : 'mp4';
    const expiresAt = Date.now() + 10 * 60 * 1000; // assume 10-minute validity

    return { url: streamUrl, format, expiresAt };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (_) {
        // ignore
      }
    }
    await browser.close();
  }
}

// ---------- Express app & routing ----------

const app = express();
app.use(cors());
app.use(express.json());

// Serve static test frontend (e.g. /test-player.html)
app.use(express.static(PUBLIC_DIR));

function validateQuery(query) {
  const type = (query.type || '').toLowerCase();

  if (!type || !['movie', 'tv', 'anime'].includes(type)) {
    const message =
      'Query parameter "type" is required and must be one of: movie, tv, anime.';
    return {
      ok: false,
      error: 'validation_error',
      message,
      debug: message,
      details: {
        missing: ['type'],
        receivedType: query.type
      }
    };
  }

  if (type === 'movie') {
    if (!query.tmdbId) {
      const message =
        'For type "movie" you must provide the "tmdbId" query parameter.';
      return {
        ok: false,
        error: 'validation_error',
        message,
        debug: message,
        details: {
          missing: ['tmdbId']
        }
      };
    }
  }

  if (type === 'tv') {
    const missing = [];
    if (!query.tmdbId) missing.push('tmdbId');
    if (!query.season) missing.push('season');
    if (!query.episode) missing.push('episode');

    if (missing.length) {
      const message =
        'For type "tv" you must provide the "tmdbId", "season" and "episode" query parameters.';
      return {
        ok: false,
        error: 'validation_error',
        message,
        debug: message,
        details: {
          missing
        }
      };
    }
  }

  if (type === 'anime') {
    const missing = [];
    if (!query.malId) missing.push('malId');
    if (!query.number) missing.push('number');
    if (!query.subOrDub) missing.push('subOrDub');

    if (missing.length) {
      const message =
        'For type "anime" you must provide the "malId", "number" and "subOrDub" query parameters.';
      return {
        ok: false,
        error: 'validation_error',
        message,
        debug: message,
        details: {
          missing
        }
      };
    }

    const subOrDub = String(query.subOrDub).toLowerCase();
    if (!['sub', 'dub'].includes(subOrDub)) {
      const message = 'Query parameter "subOrDub" must be either "sub" or "dub".';
      return {
        ok: false,
        error: 'validation_error',
        message,
        debug: message,
        details: {
          allowed: ['sub', 'dub'],
          received: query.subOrDub
        }
      };
    }
  }

  return { ok: true };
}

app.get('/stream', async (req, res) => {
  const validation = validateQuery(req.query);
  if (!validation.ok) {
    return res.status(400).json(validation);
  }

  const type = req.query.type.toLowerCase();

  const params = {
    type,
    tmdbId: req.query.tmdbId,
    season: req.query.season,
    episode: req.query.episode,
    malId: req.query.malId,
    number: req.query.number,
    subOrDub: req.query.subOrDub ? String(req.query.subOrDub).toLowerCase() : undefined
  };

  const cacheKey = buildCacheKey(params);
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
      return res.json({
        ok: true,
        url: cached.url,
        expiresAt: cached.expiresAt,
        format: cached.format,
        fromCache: true
      });
    }
  }

  let vidlinkUrl;
  try {
    vidlinkUrl = buildVidLinkUrl(params);
  } catch (err) {
    const message = err && err.message ? String(err.message) : 'Invalid request';
    return res.status(400).json({
      ok: false,
      error: 'validation_error',
      message,
      debug: message
    });
  }

  try {
    const result = await resolveStreamUrl(vidlinkUrl);

    if (cacheKey) {
      cache.set(cacheKey, result);
    }

    return res.json({
      ok: true,
      url: result.url,
      expiresAt: result.expiresAt,
      format: result.format,
      fromCache: false
    });
  } catch (err) {
    const rawMessage = err && err.message ? String(err.message) : 'Unknown error';

    let errorCode = 'internal_error';
    let status = 500;
    let message =
      'Unexpected error while trying to resolve the stream. See "details.internalMessage" for more information.';

    if (rawMessage.startsWith('stream_not_found')) {
      errorCode = 'stream_not_found';
      status = 404;
      message =
        'No playable stream could be found for this title. The upstream VidLink provider did not expose a usable .m3u8 URL.';
    } else if (rawMessage.includes('No Chrome executable found')) {
      errorCode = 'browser_not_found';
      status = 500;
      message =
        'Chrome/Chromium browser could not be found on this machine. Install Chrome or set the CHROME_EXECUTABLE or CHROME_PATH environment variable to a valid browser binary.';
    } else if (rawMessage.toLowerCase().includes('timeout')) {
      errorCode = 'upstream_timeout';
      status = 504;
      message =
        'Timed out while waiting for VidLink to respond. The upstream site may be slow or temporarily unavailable.';
    }

    return res.status(status).json({
      ok: false,
      error: errorCode,
      message,
      details: {
        internalMessage: rawMessage
      }
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'up' });
});

// Fallback 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'not_found',
    message:
      'Route not found. Available endpoints are: GET /stream, GET /health, and static files under /public (e.g. /test-player.html).',
    details: {
      method: req.method,
      path: req.originalUrl
    }
  });
});

// Generic error-handling middleware to ensure human-readable errors
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled error in request', err);

  if (res.headersSent) {
    return;
  }

  const responseBody = {
    ok: false,
    error: 'internal_error',
    message: 'An unexpected error occurred while processing your request.'
  };

  if (process.env.NODE_ENV === 'development') {
    responseBody.details = {
      message: err && err.message ? String(err.message) : undefined,
      stack: err && err.stack ? String(err.stack) : undefined
    };
  }

  res.status(500).json(responseBody);
});

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`VidLink proxy server listening on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error(
    'Failed to start VidLink proxy server. Check if port 4000 is already in use or if you lack permission to bind to this port.',
    err
  );
});