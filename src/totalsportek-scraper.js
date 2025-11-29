const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Chrome executable path detection (copied from server.js)
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

function getChromeExecutablePath() {
  const candidates = getChromeExecutableCandidates();
  if (candidates.length === 0) {
    throw new Error(
      'No Chrome executable found. Set CHROME_EXECUTABLE or CHROME_PATH environment variable to a valid Chrome/Chromium binary.'
    );
  }
  return candidates[0];
}

/**
 * Sports scraper for totalsportek.es
 * This module handles scraping sports categories, events, and stream URLs
 */

const TOTALSPORTEK_BASE_URL = 'https://totalsportek.es';

class TotalsportekScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    if (this.browser) return;

    const executablePath = getChromeExecutablePath();
    
    this.browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();
    
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await this.page.setExtraHTTPHeaders({
      'Referer': TOTALSPORTEK_BASE_URL + '/',
      'Origin': TOTALSPORTEK_BASE_URL
    });
  }

  async close() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Get available sports categories from the main page
   */
  async getCategories() {
    await this.initialize();
    
    try {
      await this.page.goto(TOTALSPORTEK_BASE_URL, {
        waitUntil: 'networkidle2',
        timeout: 15000
      });

      const categories = await this.page.evaluate(() => {
        const categories = [];
        
        // Look for navigation menu items, links, or buttons that represent sports categories
        const categorySelectors = [
          'nav a[href*="/"]',
          '.menu a[href*="/"]',
          '.navbar a[href*="/"]',
          '.navigation a[href*="/"]',
          'a[href*="football"]',
          'a[href*="basketball"]',
          'a[href*="nba"]',
          'a[href*="cricket"]',
          'a[href*="tennis"]',
          'a[href*="boxing"]',
          'a[href*="mma"]',
          'a[href*="ufc"]',
          '.sport-category a',
          '.category-item a',
          '[class*="sport"] a',
          '[class*="category"] a'
        ];

        categorySelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
              const text = element.textContent?.trim();
              const href = element.href;
              
              if (text && href && href.includes('totalsportek.es') &&
                  !text.includes('Home') && !text.includes('⇊') &&
                  !text.includes('Menu') && !text.includes('Login') &&
                  !text.includes('Register') && !text.includes('Contact') &&
                  text.length > 1 && text.length < 50) {
                
                // Extract category name and URL
                const categoryName = text.replace(/\s+/g, ' ');
                const categoryUrl = href;
                
                // Extract slug from URL
                const urlParts = href.split('/').filter(part => part);
                const slug = urlParts[urlParts.length - 1] || 'general';
                
                // Avoid duplicates and only include sports-related categories
                const sportsKeywords = ['football', 'basketball', 'nba', 'cricket', 'tennis', 'boxing', 'mma', 'ufc', 'soccer', 'baseball', 'hockey', 'golf', 'racing', 'motorsport'];
                const isSportsCategory = sportsKeywords.some(keyword => 
                  categoryName.toLowerCase().includes(keyword) || 
                  slug.toLowerCase().includes(keyword)
                );
                
                if (isSportsCategory && !categories.find(cat => cat.url === categoryUrl)) {
                  categories.push({
                    name: categoryName,
                    slug: slug,
                    url: categoryUrl
                  });
                }
              }
            });
          } catch (e) {
            // Ignore selector errors
          }
        });

        // If no categories found, try to extract from page content
        if (categories.length === 0) {
          const allLinks = document.querySelectorAll('a[href]');
          allLinks.forEach(element => {
            const text = element.textContent?.trim();
            const href = element.href;
            
            if (text && href && href.includes('totalsportek.es') &&
                !text.includes('Home') && !text.includes('Menu') &&
                !text.includes('Login') && !text.includes('Register') &&
                text.length > 2 && text.length < 50) {
              
              const sportsKeywords = ['football', 'basketball', 'nba', 'cricket', 'tennis', 'boxing', 'mma', 'ufc', 'soccer', 'baseball', 'hockey', 'golf', 'racing', 'motorsport'];
              const isSportsCategory = sportsKeywords.some(keyword => 
                text.toLowerCase().includes(keyword)
              );
              
              if (isSportsCategory && !categories.find(cat => cat.url === href)) {
                const urlParts = href.split('/').filter(part => part);
                const slug = urlParts[urlParts.length - 1] || 'general';
                
                categories.push({
                  name: text,
                  slug: slug,
                  url: href
                });
              }
            }
          });
        }

        return categories;
      });

      return categories;
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }
  }

  /**
   * Get events/matches from a specific category page
   */
  async getEventsFromCategory(categoryUrl) {
    await this.initialize();
    
    try {
      await this.page.goto(categoryUrl, {
        waitUntil: 'networkidle2',
        timeout: 15000
      });

      const events = await this.page.evaluate(() => {
        const events = [];
        
        // Try multiple selector strategies for events/matches
        const selectors = [
          '.event-item',
          '.match-item',
          '.game-item',
          '.video-item',
          'a[href*="/watch/"]',
          'a[href*="/play/"]',
          'a[href*="/live/"]',
          'a[href*="/stream/"]',
          '[class*="event"] a',
          '[class*="match"] a',
          '[class*="game"] a',
          '[class*="video"] a',
          'a[href*="vs"]', // Common in match titles
          'a[href*="v-"]',  // Common pattern
          '.stream-link',
          '.watch-link',
          '.live-link'
        ];

        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
              const title = element.querySelector('.title, .event-title, .match-title, h3, h4, .name')?.textContent?.trim() ||
                           element.textContent?.trim() ||
                           element.title?.trim();
              const href = element.href;
              
              if (title && href && href.includes('totalsportek.es') &&
                  title.length > 5 && title.length < 200 &&
                  !title.includes('Home') && !title.includes('Menu')) {
                
                // Extract stream links (Link 1, Link 2, Link 3, etc.)
                const streamLinks = [];
                const linkSelectors = [
                  'a[href*="/link/"]',
                  'a[href*="/stream/"]',
                  '.link-btn',
                  '[class*="link"] a',
                  'button[onclick*="link"]',
                  '.stream-option',
                  '.watch-option'
                ];
                
                linkSelectors.forEach(linkSelector => {
                  try {
                    const linkElements = element.querySelectorAll(linkSelector);
                    linkElements.forEach((linkEl, index) => {
                      const linkText = linkEl.textContent?.trim() || `Link ${index + 1}`;
                      const linkUrl = linkEl.href || linkEl.getAttribute('data-url');
                      
                      if (linkUrl && linkUrl.includes('totalsportek.es')) {
                        streamLinks.push({
                          name: linkText,
                          url: linkUrl
                        });
                      }
                    });
                  } catch (e) {
                    // Ignore link selector errors
                  }
                });

                // Avoid duplicates
                if (!events.find(event => event.url === href)) {
                  events.push({
                    title: title,
                    url: href,
                    streamLinks: streamLinks
                  });
                }
              }
            });
          } catch (e) {
            // Ignore selector errors
          }
        });

        // If still no events, look for any links that might be event-related
        if (events.length === 0) {
          const allLinks = document.querySelectorAll('a[href]');
          allLinks.forEach(element => {
            const text = element.textContent?.trim();
            const href = element.href;
            
            if (text && href && href.includes('totalsportek.es') &&
                (text.toLowerCase().includes('vs') ||
                 text.toLowerCase().includes('v ') ||
                 text.toLowerCase().includes('live') ||
                 text.toLowerCase().includes('watch') ||
                 text.toLowerCase().includes('stream')) &&
                text.length > 10 && text.length < 100) {
              
              if (!events.find(event => event.url === href)) {
                events.push({
                  title: text,
                  url: href,
                  streamLinks: []
                });
              }
            }
          });
        }

        return events;
      });

      return events;
    } catch (error) {
      console.error('Error fetching events from category:', error);
      throw new Error(`Failed to fetch events: ${error.message}`);
    }
  }

  /**
   * Extract actual stream URLs from an event page using network interception
   */
  async extractStreamUrls(eventUrl) {
    await this.initialize();
    
    return new Promise(async (resolve, reject) => {
      let streamUrls = [];
      let resolved = false;

      try {
        await this.page.setRequestInterception(true);

        // Intercept network requests to find stream URLs
        this.page.on('request', (req) => {
          const resourceType = req.resourceType();
          // Block unnecessary resources to speed things up
          if (['image', 'stylesheet', 'font'].includes(resourceType)) {
            return req.abort();
          }
          return req.continue();
        });

        this.page.on('response', async (res) => {
          try {
            if (resolved) return;

            const url = res.url();
            const status = res.status();
            const headers = res.headers();
            const contentType = (headers['content-type'] || '').toLowerCase();

            if (status !== 200) return;

            // Look for HLS streams and other video formats
            const looksLikeStream =
              url.includes('.m3u8') ||
              url.includes('.mp4') ||
              contentType.includes('application/x-mpegurl') ||
              contentType.includes('video/mp4') ||
              (url.includes('/hls/') && url.toLowerCase().includes('master')) ||
              url.includes('/live/') ||
              url.includes('/stream/');

            if (looksLikeStream && !streamUrls.find(s => s.url === url)) {
              const format = url.includes('.m3u8') ? 'hls' :
                           url.includes('.mp4') ? 'mp4' : 'unknown';

              streamUrls.push({
                url: url,
                format: format,
                quality: 'unknown' // Could be enhanced with quality detection
              });

              console.log(`Found stream URL: ${url}`);
            }
          } catch (e) {
            // Ignore response inspection errors
          }
        });

        await this.page.goto(eventUrl, {
          waitUntil: 'networkidle2',
          timeout: 15000
        });

        // Wait a bit for network requests to complete
        await new Promise(resolve => setTimeout(resolve, 5000));

        // NEW: Follow hitlinks.online redirects to find actual streams
        const redirectUrls = await this.page.evaluate(() => {
          const urls = [];
          
          // Look for hitlinks.online watch links
          const watchLinks = document.querySelectorAll('a[href*="hitlinks.online"]');
          watchLinks.forEach(link => {
            const href = link.href;
            const text = link.textContent?.trim() || 'Watch';
            
            if (href && href.includes('hitlinks.online')) {
              urls.push({
                url: href,
                name: text,
                type: 'hitlinks_redirect'
              });

              // Try to extract src parameter directly
              try {
                const urlObj = new URL(href);
                const srcParam = urlObj.searchParams.get('src');
                if (srcParam && srcParam.startsWith('http')) {
                  urls.push({
                    url: srcParam,
                    name: text + ' (Direct)',
                    type: 'extracted_src'
                  });
                }
              } catch (e) {
                // Ignore URL parsing errors
              }
            }
          });

          // Also look for other external stream providers
          const externalLinks = document.querySelectorAll('a[href*="yeahstreams.com"], a[href*="totwatch.php"], a[href*="totview.php"]');
          externalLinks.forEach(link => {
            const href = link.href;
            const text = link.textContent?.trim() || 'Stream';
            
            if (href && (href.includes('yeahstreams.com') || href.includes('totwatch.php') || href.includes('totview.php'))) {
              urls.push({
                url: href,
                name: text,
                type: 'external_stream'
              });

              // Try to extract src parameter directly
              try {
                const urlObj = new URL(href);
                const srcParam = urlObj.searchParams.get('src');
                if (srcParam && srcParam.startsWith('http')) {
                  urls.push({
                    url: srcParam,
                    name: text + ' (Direct)',
                    type: 'extracted_src'
                  });
                }
              } catch (e) {
                // Ignore URL parsing errors
              }
            }
          });

          return urls;
        });

        // Follow each redirect URL to find the actual stream
        for (const redirectInfo of redirectUrls) {
          // If we have an extracted source URL, add it to the results immediately
          // This ensures we at least have the player URL if deep probing fails
          if (redirectInfo.type === 'extracted_src' || redirectInfo.url.includes('yeahstreams.com')) {
             if (!streamUrls.find(s => s.url === redirectInfo.url)) {
                streamUrls.push({
                    url: redirectInfo.url,
                    format: 'iframe',
                    quality: 'unknown',
                    type: 'extracted_player',
                    name: redirectInfo.name
                });
             }
          }

          try {
            console.log(`Following redirect: ${redirectInfo.url}`);
            
            // Create a new page for following redirects to avoid interference
            const redirectPage = await this.browser.newPage();
            
            // Capture console logs from the page
            redirectPage.on('console', msg => console.log('Redirect Page Console:', msg.text()));

            await redirectPage.setUserAgent(
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );

            // Set referer to the event page
            await redirectPage.setExtraHTTPHeaders({
              'Referer': eventUrl,
              'Origin': new URL(eventUrl).origin
            });

            await redirectPage.setRequestInterception(true);
            redirectPage.on('request', (req) => {
              const resourceType = req.resourceType();
              if (['image', 'stylesheet', 'font'].includes(resourceType)) {
                return req.abort();
              }
              return req.continue();
            });

            let foundStreams = [];
            redirectPage.on('response', async (res) => {
              try {
                const url = res.url();
                const status = res.status();
                const headers = res.headers();
                const contentType = (headers['content-type'] || '').toLowerCase();

                if (status !== 200) return;

                // Look for HLS streams and other video formats
                const looksLikeStream =
                  url.includes('.m3u8') ||
                  url.includes('.mp4') ||
                  contentType.includes('application/x-mpegurl') ||
                  contentType.includes('video/mp4') ||
                  (url.includes('/hls/') && url.toLowerCase().includes('master')) ||
                  url.includes('/live/') ||
                  url.includes('/stream/');

                if (looksLikeStream && !foundStreams.find(s => s.url === url)) {
                  const format = url.includes('.m3u8') ? 'hls' :
                               url.includes('.mp4') ? 'mp4' : 'unknown';

                  foundStreams.push({
                    url: url,
                    format: format,
                    quality: 'unknown',
                    name: redirectInfo.name
                  });

                  console.log(`Found stream via redirect: ${url}`);
                }
              } catch (e) {
                // Ignore response inspection errors
              }
            });

            await redirectPage.goto(redirectInfo.url, {
              waitUntil: 'networkidle2',
              timeout: 20000
            });

            // Wait for network requests
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Also check page content for stream URLs
            const pageStreams = await redirectPage.evaluate(() => {
              const urls = [];
              
              // 1. Check for global player instances (JWPlayer, Clappr, Bitmovin)
              try {
                if (window.jwplayer) {
                  // Iterate over all jwplayer instances
                  for (let i = 0; i < 10; i++) {
                    try {
                      const player = window.jwplayer(i);
                      if (player && player.getPlaylist) {
                        const playlist = player.getPlaylist();
                        if (playlist && playlist.length > 0) {
                          playlist.forEach(item => {
                            if (item.file && (item.file.includes('.m3u8') || item.file.includes('.mp4'))) {
                              urls.push({
                                url: item.file,
                                format: item.file.includes('.m3u8') ? 'hls' : 'mp4',
                                quality: 'unknown',
                                type: 'jwplayer_instance'
                              });
                            }
                            // Check sources array
                            if (item.sources) {
                              item.sources.forEach(source => {
                                if (source.file) {
                                  urls.push({
                                    url: source.file,
                                    format: source.file.includes('.m3u8') ? 'hls' : 'mp4',
                                    quality: source.label || 'unknown',
                                    type: 'jwplayer_instance'
                                  });
                                }
                              });
                            }
                          });
                        }
                      }
                    } catch (e) {}
                  }
                }
              } catch (e) {}

              // 2. Brute force search in full HTML content
              const htmlContent = document.documentElement.innerHTML;
              const m3u8GlobalMatches = htmlContent.match(/https?:\\?\/\\?\/[^\s"']+\.m3u8[^\s"']*/g);
              const mp4GlobalMatches = htmlContent.match(/https?:\\?\/\\?\/[^\s"']+\.mp4[^\s"']*/g);
              
              [...(m3u8GlobalMatches || []), ...(mp4GlobalMatches || [])].forEach(url => {
                 const cleanUrl = url.replace(/\\\//g, '/');
                 if (!urls.find(u => u.url === cleanUrl)) {
                    urls.push({
                      url: cleanUrl,
                      format: cleanUrl.includes('.m3u8') ? 'hls' : 'mp4',
                      quality: 'unknown',
                      type: 'global_regex'
                    });
                 }
              });

              // 3. Look for URLs in script tags with enhanced regex
              const scripts = document.querySelectorAll('script');
              scripts.forEach(script => {
                const content = script.textContent;
                if (content) {
                  // Look for Clappr source
                  const clapprSource = content.match(/source\s*:\s*["']([^"']+)["']/);
                  // Look for player source/file
                  const sourceMatches = content.match(/source\s*:\s*["']([^"']+)["']/g);
                  const fileMatches = content.match(/file\s*:\s*["']([^"']+)["']/g);
                  
                  // Look for atob encoded strings which might be URLs
                  const atobMatches = content.match(/atob\s*\(\s*["']([^"']+)["']\s*\)/g);

                  if (clapprSource && clapprSource[1]) {
                     const url = clapprSource[1].replace(/\\\//g, '/');
                     if (url.startsWith('http') || url.includes('.m3u8') || url.includes('.mp4')) {
                        if (!urls.find(u => u.url === url)) {
                           urls.push({
                              url: url,
                              format: url.includes('.m3u8') ? 'hls' : 'mp4',
                              quality: 'unknown',
                              type: 'clappr_source'
                           });
                        }
                     }
                  }

                  if (atobMatches) {
                    atobMatches.forEach(match => {
                      try {
                        const encoded = match.match(/["']([^"']+)["']/)[1];
                        const decoded = atob(encoded);
                        if (decoded && (decoded.startsWith('http') || decoded.includes('.m3u8'))) {
                           if (!urls.find(u => u.url === decoded)) {
                              urls.push({
                                url: decoded,
                                format: decoded.includes('.m3u8') ? 'hls' : 'mp4',
                                quality: 'unknown',
                                type: 'atob_decoded'
                              });
                           }
                        }
                      } catch (e) {}
                    });
                  }

                  if (sourceMatches) {
                    sourceMatches.forEach(match => {
                      const matchVal = match.match(/["']([^"']+)["']/);
                      if (matchVal && matchVal[1]) {
                        const url = matchVal[1].replace(/\\\//g, '/');
                        if (url && (url.includes('.m3u8') || url.includes('.mp4') || url.startsWith('http'))) {
                           if (!urls.find(u => u.url === url)) {
                              urls.push({
                                url: url,
                                format: url.includes('.m3u8') ? 'hls' : 'mp4',
                                quality: 'unknown',
                                type: 'source_regex'
                              });
                           }
                        }
                      }
                    });
                  }
                  if (fileMatches) {
                    fileMatches.forEach(match => {
                      const matchVal = match.match(/["']([^"']+)["']/);
                      if (matchVal && matchVal[1]) {
                        const url = matchVal[1].replace(/\\\//g, '/');
                        if (url && (url.includes('.m3u8') || url.includes('.mp4') || url.startsWith('http'))) {
                           if (!urls.find(u => u.url === url)) {
                              urls.push({
                                url: url,
                                format: url.includes('.m3u8') ? 'hls' : 'mp4',
                                quality: 'unknown',
                                type: 'file_regex'
                              });
                           }
                        }
                      }
                    });
                  }
                }
              });

              // Check iframes
              const iframes = document.querySelectorAll('iframe[src]');
              iframes.forEach(iframe => {
                const src = iframe.src;
                const allow = iframe.getAttribute('allow') || '';
                
                // Explicitly check for yeahstreams and other known providers
                if (src && (src.includes('yeahstreams.com') || src.includes('hitlinks.online'))) {
                   if (!urls.find(u => u.url === src)) {
                    urls.push({
                      url: src,
                      format: 'iframe',
                      quality: 'unknown',
                      type: 'player_iframe',
                      shouldProbe: true
                    });
                  }
                }

                const isPlayerCandidate =
                  allow.includes('autoplay') ||
                  allow.includes('fullscreen') ||
                  allow.includes('encrypted-media') ||
                  src.includes('stream') ||
                  src.includes('player') ||
                  src.includes('yeahstreams') ||
                  src.includes('wigistream') ||
                  src.includes('m3u8') ||
                  src.includes('getlink') ||
                  src.includes('live');

                if (src && isPlayerCandidate) {
                  if (!urls.find(u => u.url === src)) {
                    urls.push({
                      url: src,
                      format: 'iframe',
                      quality: 'unknown',
                      type: 'player_iframe',
                      shouldProbe: true
                    });
                  }
                } else if (src && !src.includes('google') && !src.includes('facebook') && !src.includes('twitter') && !src.includes('ads') && !src.includes('analytics')) {
                   // Capture other potential player iframes
                   if (!urls.find(u => u.url === src)) {
                    urls.push({
                      url: src,
                      format: 'iframe',
                      quality: 'unknown',
                      type: 'potential_iframe',
                      shouldProbe: true
                    });
                  }
                }
              });

              // Look for video elements with src attributes
              const videos = document.querySelectorAll('video[src]');
              videos.forEach(video => {
                const src = video.src;
                if (src && (src.includes('.m3u8') || src.includes('.mp4'))) {
                  if (!urls.find(u => u.url === src)) {
                    urls.push({
                      url: src,
                      format: src.includes('.m3u8') ? 'hls' : 'mp4',
                      quality: 'unknown',
                      type: 'video_element'
                    });
                  }
                }
              });

              // Look for source elements within video tags
              const sources = document.querySelectorAll('video source[src]');
              sources.forEach(source => {
                const src = source.src;
                if (src && (src.includes('.m3u8') || src.includes('.mp4'))) {
                  if (!urls.find(u => u.url === src)) {
                    urls.push({
                      url: src,
                      format: src.includes('.m3u8') ? 'hls' : 'mp4',
                      quality: 'unknown',
                      type: 'video_source'
                    });
                  }
                }
              });

              // Look for data attributes that might contain stream URLs
              const dataElements = document.querySelectorAll('[data-src], [data-url], [data-stream], [data-video]');
              dataElements.forEach(element => {
                const dataSrc = element.getAttribute('data-src') ||
                               element.getAttribute('data-url') ||
                               element.getAttribute('data-stream') ||
                               element.getAttribute('data-video');
                if (dataSrc && dataSrc.startsWith('http') && (dataSrc.includes('.m3u8') || dataSrc.includes('.mp4'))) {
                  if (!urls.find(u => u.url === dataSrc)) {
                    urls.push({
                      url: dataSrc,
                      format: dataSrc.includes('.m3u8') ? 'hls' : 'mp4',
                      quality: 'unknown',
                      type: 'data_attribute'
                    });
                  }
                }
              });

              return urls;
            });

            // DEEPER PROBE: If we found yeahstreams.com or similar streaming pages, go one level deeper
            const deeperStreams = [];
            for (const stream of pageStreams) {
              if (stream.shouldProbe ||
                  stream.url.includes('yeahstreams.com') ||
                  stream.url.includes('hitlinks.online') ||
                  stream.url.includes('stream-') ||
                  stream.url.includes('tv/stream') ||
                  stream.type === 'player_iframe' ||
                  stream.type === 'potential_iframe') {
                try {
                  console.log(`Going deeper into stream page: ${stream.url}`);
                  
                  const deepPage = await this.browser.newPage();
                  await deepPage.setUserAgent(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                  );

                  // Set referer to the page where we found this stream
                  await deepPage.setExtraHTTPHeaders({
                    'Referer': redirectInfo.url
                  });

                  await deepPage.setRequestInterception(true);
                  deepPage.on('request', (req) => {
                    const resourceType = req.resourceType();
                    if (['image', 'stylesheet', 'font'].includes(resourceType)) {
                      return req.abort();
                    }
                    return req.continue();
                  });

                  let deepFoundStreams = [];
                  deepPage.on('response', async (res) => {
                    try {
                      const url = res.url();
                      const status = res.status();
                      const headers = res.headers();
                      const contentType = (headers['content-type'] || '').toLowerCase();

                      if (status !== 200) return;

                      // Look for HLS streams and other video formats
                      const looksLikeStream =
                        url.includes('.m3u8') ||
                        url.includes('.mp4') ||
                        contentType.includes('application/x-mpegurl') ||
                        contentType.includes('video/mp4') ||
                        (url.includes('/hls/') && url.toLowerCase().includes('master')) ||
                        url.includes('/live/') ||
                        url.includes('/stream/');

                      if (looksLikeStream && !deepFoundStreams.find(s => s.url === url)) {
                        const format = url.includes('.m3u8') ? 'hls' :
                                     url.includes('.mp4') ? 'mp4' : 'unknown';

                        deepFoundStreams.push({
                          url: url,
                          format: format,
                          quality: 'unknown',
                          name: stream.name + ' (Deep)',
                          type: 'deep_stream'
                        });

                        console.log(`Found deep stream: ${url}`);
                      }
                    } catch (e) {
                      // Ignore response inspection errors
                    }
                  });

                  await deepPage.goto(stream.url, {
                    waitUntil: 'networkidle2',
                    timeout: 10000
                  });

                  // Wait for network requests
                  await new Promise(resolve => setTimeout(resolve, 5000));

                  // Also scan the deep page content
                  const deepPageStreams = await deepPage.evaluate(() => {
                    const urls = [];

                    // 1. Check for global player instances (JWPlayer)
                    try {
                      if (window.jwplayer) {
                        for (let i = 0; i < 10; i++) {
                          try {
                            const player = window.jwplayer(i);
                            if (player && player.getPlaylist) {
                              const playlist = player.getPlaylist();
                              if (playlist && playlist.length > 0) {
                                playlist.forEach(item => {
                                  if (item.file) {
                                    urls.push({
                                      url: item.file,
                                      format: item.file.includes('.m3u8') ? 'hls' : 'mp4',
                                      quality: 'unknown',
                                      type: 'jwplayer_instance'
                                    });
                                  }
                                });
                              }
                            }
                          } catch (e) {}
                        }
                      }
                    } catch (e) {}
                    
                    // Brute force search in full HTML content
                    const htmlContent = document.documentElement.innerHTML;
                    const m3u8GlobalMatches = htmlContent.match(/https?:\\?\/\\?\/[^\s"']+\.m3u8[^\s"']*/g);
                    const mp4GlobalMatches = htmlContent.match(/https?:\\?\/\\?\/[^\s"']+\.mp4[^\s"']*/g);
                    
                    [...(m3u8GlobalMatches || []), ...(mp4GlobalMatches || [])].forEach(url => {
                       const cleanUrl = url.replace(/\\\//g, '/');
                       if (!urls.find(u => u.url === cleanUrl)) {
                          urls.push({
                            url: cleanUrl,
                            format: cleanUrl.includes('.m3u8') ? 'hls' : 'mp4',
                            quality: 'unknown',
                            type: 'deep_global_regex'
                          });
                       }
                    });

                    // Look for URLs in script tags with more comprehensive patterns
                    const scripts = document.querySelectorAll('script');
                    scripts.forEach(script => {
                      const content = script.textContent;
                      if (content) {
                        // Look for Clappr source
                        const clapprSource = content.match(/source\s*:\s*["']([^"']+)["']/);
                        // Look for atob encoded strings
                        const atobMatches = content.match(/atob\s*\(\s*["']([^"']+)["']\s*\)/g);
                        
                        if (clapprSource && clapprSource[1]) {
                           const url = clapprSource[1].replace(/\\\//g, '/');
                           if (url.startsWith('http') || url.includes('.m3u8') || url.includes('.mp4')) {
                              if (!urls.find(u => u.url === url)) {
                                 urls.push({
                                    url: url,
                                    format: url.includes('.m3u8') ? 'hls' : 'mp4',
                                    quality: 'unknown',
                                    type: 'deep_clappr_source'
                                 });
                              }
                           }
                        }

                        if (atobMatches) {
                          atobMatches.forEach(match => {
                            try {
                              const encoded = match.match(/["']([^"']+)["']/)[1];
                              const decoded = atob(encoded);
                              if (decoded && (decoded.startsWith('http') || decoded.includes('.m3u8'))) {
                                 if (!urls.find(u => u.url === decoded)) {
                                    urls.push({
                                      url: decoded,
                                      format: decoded.includes('.m3u8') ? 'hls' : 'mp4',
                                      quality: 'unknown',
                                      type: 'deep_atob_decoded'
                                    });
                                 }
                              }
                            } catch (e) {}
                          });
                        }
                      }
                    });

                    // Check video elements and sources
                    const videos = document.querySelectorAll('video[src], video source[src]');
                    videos.forEach(element => {
                      const src = element.src || element.getAttribute('src');
                      if (src && (src.includes('.m3u8') || src.includes('.mp4'))) {
                        if (!urls.find(u => u.url === src)) {
                          urls.push({
                            url: src,
                            format: src.includes('.m3u8') ? 'hls' : 'mp4',
                            quality: 'unknown',
                            type: 'deep_video'
                          });
                        }
                      }
                    });

                    // Look for iframe players
                    const iframes = document.querySelectorAll('iframe[src]');
                    iframes.forEach(iframe => {
                      const src = iframe.src;
                      if (src && (src.includes('player') || src.includes('stream'))) {
                        if (!urls.find(u => u.url === src)) {
                          urls.push({
                            url: src,
                            format: 'iframe',
                            quality: 'unknown',
                            type: 'deep_iframe'
                          });
                        }
                      }
                    });

                    return urls;
                  });

                  deepFoundStreams = [...deepFoundStreams, ...deepPageStreams];
                  deeperStreams.push(...deepFoundStreams);
                  
                  await deepPage.close();
                } catch (error) {
                  console.error(`Error going deeper into ${stream.url}:`, error);
                }
              }
            }

            foundStreams = [...foundStreams, ...pageStreams, ...deeperStreams];
            
            // Add found streams to main list
            foundStreams.forEach(stream => {
              if (!streamUrls.find(s => s.url === stream.url)) {
                streamUrls.push(stream);
              }
            });

            await redirectPage.close();
          } catch (error) {
            console.error(`Error following redirect ${redirectInfo.url}:`, error);
          }
        }

        // Fallback: try to extract URLs from page content
        if (streamUrls.length === 0) {
          const pageUrls = await this.page.evaluate(() => {
            const urls = [];
            
            // Look for hitlinks.online watch links - these are the key stream providers
            const watchLinks = document.querySelectorAll('a[href*="hitlinks.online"]');
            watchLinks.forEach(link => {
              const href = link.href;
              const text = link.textContent?.trim() || 'Watch';
              
              if (href && href.includes('hitlinks.online')) {
                if (!urls.find(u => u.url === href)) {
                  urls.push({
                    url: href,
                    format: 'redirect',
                    quality: 'unknown',
                    type: 'hitlinks_redirect',
                    name: text
                  });

                  // Try to extract src parameter directly
                  try {
                    const urlObj = new URL(href);
                    const srcParam = urlObj.searchParams.get('src');
                    if (srcParam && srcParam.startsWith('http')) {
                      if (!urls.find(u => u.url === srcParam)) {
                        urls.push({
                          url: srcParam,
                          format: 'redirect',
                          quality: 'unknown',
                          type: 'extracted_src',
                          name: text + ' (Direct)'
                        });
                      }
                    }
                  } catch (e) {
                    // Ignore URL parsing errors
                  }
                }
              }
            });

            // Also look for any external links that might be stream providers
            const externalLinks = document.querySelectorAll('a[href*="yeahstreams.com"], a[href*="totwatch.php"], a[href*="totview.php"]');
            externalLinks.forEach(link => {
              const href = link.href;
              const text = link.textContent?.trim() || 'Stream';
              
              if (href && (href.includes('yeahstreams.com') || href.includes('totwatch.php') || href.includes('totview.php'))) {
                if (!urls.find(u => u.url === href)) {
                  urls.push({
                    url: href,
                    format: 'redirect',
                    quality: 'unknown',
                    type: 'external_stream',
                    name: text
                  });
                }
              }
            });

            // Brute force search in full HTML content
            const htmlContent = document.documentElement.innerHTML;
            const m3u8GlobalMatches = htmlContent.match(/https?:\\?\/\\?\/[^\s"']+\.m3u8[^\s"']*/g);
            const mp4GlobalMatches = htmlContent.match(/https?:\\?\/\\?\/[^\s"']+\.mp4[^\s"']*/g);
            
            [...(m3u8GlobalMatches || []), ...(mp4GlobalMatches || [])].forEach(url => {
               const cleanUrl = url.replace(/\\\//g, '/');
               if (!urls.find(u => u.url === cleanUrl)) {
                  urls.push({
                    url: cleanUrl,
                    format: cleanUrl.includes('.m3u8') ? 'hls' : 'mp4',
                    quality: 'unknown',
                    type: 'global_regex'
                  });
               }
            });

            // Look for URLs in script tags
            const scripts = document.querySelectorAll('script');
            scripts.forEach(script => {
              const content = script.textContent;
              if (content) {
                // Look for Clappr source
                const clapprSource = content.match(/source\s*:\s*["']([^"']+)["']/);
                // Look for atob encoded strings
                const atobMatches = content.match(/atob\s*\(\s*["']([^"']+)["']\s*\)/g);

                if (clapprSource && clapprSource[1]) {
                   const url = clapprSource[1].replace(/\\\//g, '/');
                   if (url.startsWith('http') || url.includes('.m3u8') || url.includes('.mp4')) {
                      if (!urls.find(u => u.url === url)) {
                         urls.push({
                            url: url,
                            format: url.includes('.m3u8') ? 'hls' : 'mp4',
                            quality: 'unknown',
                            type: 'clappr_source'
                         });
                      }
                   }
                }

                if (atobMatches) {
                  atobMatches.forEach(match => {
                    try {
                      const encoded = match.match(/["']([^"']+)["']/)[1];
                      const decoded = atob(encoded);
                      if (decoded && (decoded.startsWith('http') || decoded.includes('.m3u8'))) {
                         if (!urls.find(u => u.url === decoded)) {
                            urls.push({
                              url: decoded,
                              format: decoded.includes('.m3u8') ? 'hls' : 'mp4',
                              quality: 'unknown',
                              type: 'atob_decoded'
                            });
                         }
                      }
                    } catch (e) {}
                  });
                }
              }
            });

            // Check iframes
            const iframes = document.querySelectorAll('iframe[src]');
            iframes.forEach(iframe => {
              const src = iframe.src;
              const allow = iframe.getAttribute('allow') || '';
              const isPlayerCandidate =
                allow.includes('autoplay') ||
                allow.includes('fullscreen') ||
                allow.includes('encrypted-media') ||
                src.includes('stream') ||
                src.includes('player') ||
                src.includes('yeahstreams') ||
                src.includes('wigistream') ||
                src.includes('m3u8') ||
                src.includes('getlink') ||
                src.includes('live');

              if (src && isPlayerCandidate) {
                if (!urls.find(u => u.url === src)) {
                  urls.push({
                    url: src,
                    format: 'iframe',
                    quality: 'unknown',
                    type: 'player_iframe',
                    shouldProbe: true
                  });
                }
              } else if (src && !src.includes('google') && !src.includes('facebook') && !src.includes('twitter') && !src.includes('ads') && !src.includes('analytics')) {
                 // Capture other potential player iframes
                 if (!urls.find(u => u.url === src)) {
                  urls.push({
                    url: src,
                    format: 'iframe',
                    quality: 'unknown',
                    type: 'potential_iframe',
                    shouldProbe: true
                  });
                }
              }
            });

            // Look for any elements that might contain stream URLs in attributes
            const streamElements = document.querySelectorAll('[data-stream-url], [data-url], [data-src]');
            streamElements.forEach(element => {
              const streamUrl = element.getAttribute('data-stream-url') ||
                               element.getAttribute('data-url') ||
                               element.getAttribute('data-src');
              if (streamUrl && streamUrl.startsWith('http')) {
                if (!urls.find(u => u.url === streamUrl)) {
                  urls.push({
                    url: streamUrl,
                    format: streamUrl.includes('.m3u8') ? 'hls' :
                           streamUrl.includes('.mp4') ? 'mp4' : 'unknown',
                    quality: 'unknown',
                    type: 'data_attribute'
                  });
                }
              }
            });

            return urls;
          });

          streamUrls = [...streamUrls, ...pageUrls];
        }

        resolved = true;
        resolve(streamUrls);

      } catch (error) {
        resolved = true;
        reject(new Error(`Failed to extract stream URLs: ${error.message}`));
      }
    });
  }

  /**
   * Get complete sports data - categories, events, and stream URLs
   */
  async getAllSportsData() {
    try {
      const categories = await this.getCategories();
      const results = [];

      for (const category of categories) {
        try {
          const events = await this.getEventsFromCategory(category.url);
          
          const categoryWithEvents = {
            ...category,
            events: []
          };

          for (const event of events) {
            try {
              const streamUrls = await this.extractStreamUrls(event.url);
              
              categoryWithEvents.events.push({
                ...event,
                streams: streamUrls
              });
            } catch (error) {
              console.error(`Error extracting streams for event ${event.url}:`, error);
              categoryWithEvents.events.push({
                ...event,
                streams: [],
                error: error.message
              });
            }
          }

          results.push(categoryWithEvents);
        } catch (error) {
          console.error(`Error processing category ${category.url}:`, error);
          results.push({
            ...category,
            events: [],
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error getting all sports data:', error);
      throw error;
    }
  }
}

module.exports = { TotalsportekScraper, TOTALSPORTEK_BASE_URL };