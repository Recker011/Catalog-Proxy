const express = require('express');
const cors = require('cors');
const { LRUCache } = require('lru-cache');
const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { CricwatchScraper } = require('./cricwatch-scraper');
 
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

// Export for use in other modules
module.exports.getChromeExecutablePath = resolveChromeExecutablePath;

// ---------- LRU Cache for resolved streams ----------

const cache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 7 // 7 minutes
});

// Separate cache for cricket data (longer TTL since cricket matches change less frequently)
const cricketCache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 15 // 15 minutes
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

 // ---------- Stream URL builder ----------
 
 function buildStreamUrl(params) {
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
 
 // ---------- Multi-provider configuration (v2) ----------
 
 const DEFAULT_PROVIDER = 'vidlink';
 const SUPPORTED_PROVIDERS = ['vidlink', 'filmex'];
 
 const VIDLINK_BASE_URL = 'https://vidlink.pro';
 const FILMEX_BASE_URL = (process.env.FILMEX_BASE_URL || 'https://fmovies4u.com').replace(
   /\/+$/,
   ''
 );
 
 function buildFilmexUrl(params) {
   const { type } = params;
 
   if (type === 'anime') {
     throw new Error('Provider "filmex" does not currently support type "anime" in this proxy.');
   }
 
   if (type === 'movie') {
     if (!params.tmdbId) {
       throw new Error('For type "movie" you must provide the "tmdbId" query parameter.');
     }
     return `${FILMEX_BASE_URL}/embed/tmdb-movie-${encodeURIComponent(params.tmdbId)}`;
   }
 
   if (type === 'tv') {
     const missing = [];
     if (!params.tmdbId) missing.push('tmdbId');
     if (!params.season) missing.push('season');
     if (!params.episode) missing.push('episode');
 
     if (missing.length) {
       throw new Error(
         'For type "tv" you must provide the "tmdbId", "season" and "episode" query parameters.'
       );
     }
 
     return `${FILMEX_BASE_URL}/embed/tmdb-tv-${encodeURIComponent(
       params.tmdbId
     )}/${encodeURIComponent(params.season)}/${encodeURIComponent(params.episode)}`;
   }
 
   throw new Error(`Unsupported type for filmex provider: ${type}`);
 }
 
 const PROVIDERS = {
   vidlink: {
     id: 'vidlink',
     buildUrl(params) {
       return buildVidLinkUrl(params);
     },
     getResolveOptions() {
       return {
         referer: `${VIDLINK_BASE_URL}/`,
         origin: VIDLINK_BASE_URL
       };
     }
   },
   filmex: {
     id: 'filmex',
     buildUrl(params) {
       return buildFilmexUrl(params);
     },
     getResolveOptions() {
       return {
         referer: `${FILMEX_BASE_URL}/`,
         origin: FILMEX_BASE_URL
       };
     }
   }
 };
 
 function buildCacheKeyV2(params) {
   const provider = (params.provider || DEFAULT_PROVIDER).toLowerCase();
   const { type } = params;
 
   if (type === 'movie') {
     return `v2:${provider}:movie:${params.tmdbId}`;
   }
   if (type === 'tv') {
     return `v2:${provider}:tv:${params.tmdbId}:${params.season}:${params.episode}`;
   }
   if (type === 'anime') {
     return `v2:${provider}:anime:${params.malId}:${params.number}:${params.subOrDub}`;
   }
   return null;
 }

// ---------- Puppeteer-based stream resolver ----------

async function resolveStreamUrl(pageUrl, options = {}) {
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

  const referer = options.referer || `${VIDLINK_BASE_URL}/`;
  const origin = options.origin || VIDLINK_BASE_URL;

  try {
    page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      Referer: referer,
      Origin: origin
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

        streamUrl = url;
      } catch (e) {
        // Ignore response inspection errors
      }
    });

    await page.goto(pageUrl, {
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
 
 // Simple request logging middleware
 app.use((req, res, next) => {
   const start = Date.now();
 
   res.on('finish', () => {
     const durationMs = Date.now() - start;
     console.log(
       `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`
     );
   });
 
   next();
 });
 
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

  let streamUrl;
  try {
    streamUrl = buildStreamUrl(params);
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
    const result = await resolveStreamUrl(streamUrl);

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
        'No playable stream could be found for this title. The upstream provider did not expose a usable .m3u8 URL.';
    } else if (rawMessage.includes('No Chrome executable found')) {
      errorCode = 'browser_not_found';
      status = 500;
      message =
        'Chrome/Chromium browser could not be found on this machine. Install Chrome or set the CHROME_EXECUTABLE or CHROME_PATH environment variable to a valid browser binary.';
    } else if (rawMessage.toLowerCase().includes('timeout')) {
      errorCode = 'upstream_timeout';
      status = 504;
      message =
        'Timed out while waiting for the upstream provider to respond. The upstream site may be slow or temporarily unavailable.';
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

app.get('/v2/stream', async (req, res) => {
  const validation = validateQuery(req.query);
  if (!validation.ok) {
    return res.status(400).json(validation);
  }

  const type = req.query.type.toLowerCase();
  const provider = (req.query.provider || DEFAULT_PROVIDER).toLowerCase();

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    const message = `Query parameter "provider" must be one of: ${SUPPORTED_PROVIDERS.join(', ')}.`;
    return res.status(400).json({
      ok: false,
      error: 'validation_error',
      message,
      debug: message,
      details: {
        allowedProviders: SUPPORTED_PROVIDERS,
        receivedProvider: req.query.provider
      }
    });
  }

  const providerImpl = PROVIDERS[provider];

  const params = {
    type,
    provider,
    tmdbId: req.query.tmdbId,
    season: req.query.season,
    episode: req.query.episode,
    malId: req.query.malId,
    number: req.query.number,
    subOrDub: req.query.subOrDub ? String(req.query.subOrDub).toLowerCase() : undefined
  };

  const cacheKey = buildCacheKeyV2(params);
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
      return res.json({
        ok: true,
        url: cached.url,
        expiresAt: cached.expiresAt,
        format: cached.format,
        fromCache: true,
        provider
      });
    }
  }

  let upstreamPageUrl;
  try {
    upstreamPageUrl = providerImpl.buildUrl(params);
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
    const resolveOptions = providerImpl.getResolveOptions
      ? providerImpl.getResolveOptions(params)
      : undefined;

    const result = await resolveStreamUrl(upstreamPageUrl, resolveOptions || {});

    if (cacheKey) {
      cache.set(cacheKey, result);
    }

    return res.json({
      ok: true,
      url: result.url,
      expiresAt: result.expiresAt,
      format: result.format,
      fromCache: false,
      provider
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
        'No playable stream could be found for this title. The upstream provider did not expose a usable .m3u8 URL.';
    } else if (rawMessage.includes('No Chrome executable found')) {
      errorCode = 'browser_not_found';
      status = 500;
      message =
        'Chrome/Chromium browser could not be found on this machine. Install Chrome or set the CHROME_EXECUTABLE or CHROME_PATH environment variable to a valid browser binary.';
    } else if (rawMessage.toLowerCase().includes('timeout')) {
      errorCode = 'upstream_timeout';
      status = 504;
      message =
        'Timed out while waiting for the upstream site to respond. The upstream site may be slow or temporarily unavailable.';
    }

    return res.status(status).json({
      ok: false,
      error: errorCode,
      message,
      details: {
        internalMessage: rawMessage,
        provider
      }
    });
  }
});

// ---------- V3 Cricket API Endpoints ----------

app.get('/v3/cricket/categories', async (req, res) => {
  const cacheKey = 'v3:cricket:categories';
  const cached = cricketCache.get(cacheKey);
  
  if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
    return res.json({
      ok: true,
      data: cached.categories,
      fromCache: true,
      cachedAt: cached.cachedAt
    });
  }

  const scraper = new CricwatchScraper();
  
  try {
    const categories = await scraper.getCategories();
    const cacheData = {
      categories,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      cachedAt: Date.now()
    };
    
    cricketCache.set(cacheKey, cacheData);
    
    return res.json({
      ok: true,
      data: categories,
      fromCache: false
    });
  } catch (err) {
    const rawMessage = err && err.message ? String(err.message) : 'Unknown error';
    
    return res.status(500).json({
      ok: false,
      error: 'scraping_error',
      message: 'Failed to scrape cricket categories from cricwatch.io',
      details: {
        internalMessage: rawMessage
      }
    });
  } finally {
    await scraper.close();
  }
});

app.get('/v3/cricket/category/:slug/matches', async (req, res) => {
  const { slug } = req.params;
  const cacheKey = `v3:cricket:category:${slug}:matches`;
  const cached = cricketCache.get(cacheKey);
  
  if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
    return res.json({
      ok: true,
      data: cached.matches,
      fromCache: true,
      cachedAt: cached.cachedAt
    });
  }

  const scraper = new CricwatchScraper();
  
  try {
    // First get categories to find the URL for this slug
    const categories = await scraper.getCategories();
    const category = categories.find(cat => cat.slug === slug);
    
    if (!category) {
      return res.status(404).json({
        ok: false,
        error: 'category_not_found',
        message: `Category with slug "${slug}" not found`,
        details: {
          availableSlugs: categories.map(cat => cat.slug)
        }
      });
    }

    const matches = await scraper.getMatchesFromCategory(category.url);
    const cacheData = {
      matches,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      cachedAt: Date.now()
    };
    
    cricketCache.set(cacheKey, cacheData);
    
    return res.json({
      ok: true,
      data: matches,
      fromCache: false
    });
  } catch (err) {
    const rawMessage = err && err.message ? String(err.message) : 'Unknown error';
    
    return res.status(500).json({
      ok: false,
      error: 'scraping_error',
      message: 'Failed to scrape cricket matches from category',
      details: {
        internalMessage: rawMessage,
        categorySlug: slug
      }
    });
  } finally {
    await scraper.close();
  }
});

app.get('/v3/cricket/match/streams', async (req, res) => {
  const { matchUrl } = req.query;
  
  if (!matchUrl) {
    return res.status(400).json({
      ok: false,
      error: 'validation_error',
      message: 'Query parameter "matchUrl" is required',
      details: {
        missing: ['matchUrl']
      }
    });
  }

  const cacheKey = `v3:cricket:match:${Buffer.from(matchUrl).toString('base64')}:streams`;
  const cached = cricketCache.get(cacheKey);
  
  if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
    return res.json({
      ok: true,
      data: cached.streams,
      fromCache: true,
      cachedAt: cached.cachedAt
    });
  }

  const scraper = new CricwatchScraper();
  
  try {
    const streams = await scraper.extractStreamUrls(matchUrl);
    const cacheData = {
      streams,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes - streams expire quickly
      cachedAt: Date.now()
    };
    
    cricketCache.set(cacheKey, cacheData);
    
    return res.json({
      ok: true,
      data: streams,
      fromCache: false
    });
  } catch (err) {
    const rawMessage = err && err.message ? String(err.message) : 'Unknown error';
    
    return res.status(500).json({
      ok: false,
      error: 'scraping_error',
      message: 'Failed to extract stream URLs from match page',
      details: {
        internalMessage: rawMessage,
        matchUrl
      }
    });
  } finally {
    await scraper.close();
  }
});

app.get('/v3/cricket/all', async (req, res) => {
  const cacheKey = 'v3:cricket:all';
  const cached = cricketCache.get(cacheKey);
  
  if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
    return res.json({
      ok: true,
      data: cached.data,
      fromCache: true,
      cachedAt: cached.cachedAt
    });
  }

  const scraper = new CricwatchScraper();
  
  try {
    const allData = await scraper.getAllCricketData();
    const cacheData = {
      data: allData,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      cachedAt: Date.now()
    };
    
    cricketCache.set(cacheKey, cacheData);
    
    return res.json({
      ok: true,
      data: allData,
      fromCache: false
    });
  } catch (err) {
    const rawMessage = err && err.message ? String(err.message) : 'Unknown error';
    
    return res.status(500).json({
      ok: false,
      error: 'scraping_error',
      message: 'Failed to scrape complete cricket data from cricwatch.io',
      details: {
        internalMessage: rawMessage
      }
    });
  } finally {
    await scraper.close();
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
      'Route not found. Available endpoints are: GET /stream, GET /v2/stream, GET /v3/cricket/categories, GET /v3/cricket/category/:slug/matches, GET /v3/cricket/match/streams, GET /v3/cricket/all, GET /health, and static files under /public (e.g. /test-player.html, /cricket-test.html).',
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
  console.log(`CAT-alog Proxy server listening on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error(
    'Failed to start CAT-alog Proxy server. Check if port 4000 is already in use or if you lack permission to bind to this port.',
    err
  );
});