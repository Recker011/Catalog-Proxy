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
 * Cricket scraper for cricwatch.io
 * This module handles scraping cricket categories, matches, and stream URLs
 */

const CRICWATCH_BASE_URL = 'https://cricwatch.io';

class CricwatchScraper {
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
      'Referer': CRICWATCH_BASE_URL + '/',
      'Origin': CRICWATCH_BASE_URL
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
   * Get available cricket categories from the main page
   */
  async getCategories() {
    await this.initialize();
    
    try {
      await this.page.goto(CRICWATCH_BASE_URL, {
        waitUntil: 'networkidle2',
        timeout: 15000
      });

      const categories = await this.page.evaluate(() => {
        const categories = [];
        
        // Based on debug output, categories are buttons with specific URLs
        const categorySelectors = [
          'a[href*="world-cup-streams"]',
          'a[href*="the-ashes-streams"]',
          'a[href*="test-streams"]',
          'a[href*="odi-streams"]',
          'a[href*="t20-streams"]'
        ];

        categorySelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
              const text = element.textContent?.trim();
              const href = element.href;
              
              if (text && href && href.includes('cricwatch.io') &&
                  !text.includes('Home') && !text.includes('⇊') &&
                  text.length > 1 && text.length < 50) {
                
                // Extract category name and URL
                const categoryName = text.replace(/\s+/g, ' ');
                const categoryUrl = href;
                
                // Extract slug from URL
                const urlParts = href.split('/').filter(part => part);
                const slug = urlParts[urlParts.length - 1] || 'general';
                
                // Avoid duplicates
                if (!categories.find(cat => cat.url === categoryUrl)) {
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

        return categories;
      });

      return categories;
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }
  }

  /**
   * Get matches from a specific category page
   */
  async getMatchesFromCategory(categoryUrl) {
    await this.initialize();
    
    try {
      await this.page.goto(categoryUrl, {
        waitUntil: 'networkidle2',
        timeout: 15000
      });

      const matches = await this.page.evaluate(() => {
        const matches = [];
        
        // Try multiple selector strategies for matches
        const selectors = [
          '.match-item',
          '.game-item',
          '.video-item',
          'a[href*="/watch/"]',
          'a[href*="/play/"]',
          'a[href*="/live/"]',
          'a[href*="/stream/"]',
          '[class*="match"] a',
          '[class*="game"] a',
          '[class*="video"] a',
          'a[href*="vs"]', // Common in match titles
          'a[href*="v-"]'  // Common pattern
        ];

        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
              const title = element.querySelector('.title, .match-title, h3, h4, .name')?.textContent?.trim() ||
                           element.textContent?.trim() ||
                           element.title?.trim();
              const href = element.href;
              
              if (title && href && href.includes('cricwatch.io') &&
                  title.length > 5 && title.length < 200 &&
                  !title.includes('Home') && !title.includes('Menu')) {
                
                // Extract stream links (Link 1, Link 2, Link 3, etc.)
                const streamLinks = [];
                const linkSelectors = [
                  'a[href*="/link/"]',
                  'a[href*="/stream/"]',
                  '.link-btn',
                  '[class*="link"] a',
                  'button[onclick*="link"]'
                ];
                
                linkSelectors.forEach(linkSelector => {
                  try {
                    const linkElements = element.querySelectorAll(linkSelector);
                    linkElements.forEach((linkEl, index) => {
                      const linkText = linkEl.textContent?.trim() || `Link ${index + 1}`;
                      const linkUrl = linkEl.href || linkEl.getAttribute('data-url');
                      
                      if (linkUrl && linkUrl.includes('cricwatch.io')) {
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
                if (!matches.find(match => match.url === href)) {
                  matches.push({
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

        // If still no matches, look for any links that might be match-related
        if (matches.length === 0) {
          const allLinks = document.querySelectorAll('a[href]');
          allLinks.forEach(element => {
            const text = element.textContent?.trim();
            const href = element.href;
            
            if (text && href && href.includes('cricwatch.io') &&
                (text.toLowerCase().includes('vs') ||
                 text.toLowerCase().includes('v ') ||
                 text.toLowerCase().includes('live') ||
                 text.toLowerCase().includes('watch') ||
                 text.toLowerCase().includes('stream')) &&
                text.length > 10 && text.length < 100) {
              
              if (!matches.find(match => match.url === href)) {
                matches.push({
                  title: text,
                  url: href,
                  streamLinks: []
                });
              }
            }
          });
        }

        return matches;
      });

      return matches;
    } catch (error) {
      console.error('Error fetching matches from category:', error);
      throw new Error(`Failed to fetch matches: ${error.message}`);
    }
  }

  /**
   * Extract actual stream URLs from a match page using network interception
   */
  async extractStreamUrls(matchUrl) {
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
          if (['image', 'stylesheet', 'font', 'other'].includes(resourceType)) {
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

        await this.page.goto(matchUrl, {
          waitUntil: 'networkidle2',
          timeout: 15000
        });

        // Wait a bit for network requests to complete
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Fallback: try to extract URLs from page content
        if (streamUrls.length === 0) {
          const pageUrls = await this.page.evaluate(() => {
            const urls = [];
            
            // Look for URLs in script tags, iframes, etc.
            const scripts = document.querySelectorAll('script');
            scripts.forEach(script => {
              const content = script.textContent;
              if (content) {
                const m3u8Matches = content.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
                const mp4Matches = content.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/g);
                
                [...(m3u8Matches || []), ...(mp4Matches || [])].forEach(url => {
                  if (!urls.find(u => u.url === url)) {
                    urls.push({
                      url: url.trim(),
                      format: url.includes('.m3u8') ? 'hls' : 'mp4',
                      quality: 'unknown'
                    });
                  }
                });
              }
            });

            // Check iframes - this is key for cricwatch.io
            const iframes = document.querySelectorAll('iframe[src]');
            iframes.forEach(iframe => {
              const src = iframe.src;
              if (src && src.includes('cricwatch.io')) {
                // Extract the actual stream URL from iframe parameters
                // Example: https://cricwatch.io/partytown/partytown-sandbox-sw.html?1764371281615
                if (!urls.find(u => u.url === src)) {
                  urls.push({
                    url: src,
                    format: 'iframe',
                    quality: 'unknown',
                    type: 'player_iframe'
                  });
                }
              }
            });

            // Look for partytown sandbox iframes specifically
            const partytownIframes = document.querySelectorAll('iframe[src*="partytown"]');
            partytownIframes.forEach(iframe => {
              const src = iframe.src;
              if (src) {
                if (!urls.find(u => u.url === src)) {
                  urls.push({
                    url: src,
                    format: 'iframe',
                    quality: 'unknown',
                    type: 'partytown_iframe'
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
   * Get complete cricket data - categories, matches, and stream URLs
   */
  async getAllCricketData() {
    try {
      const categories = await this.getCategories();
      const results = [];

      for (const category of categories) {
        try {
          const matches = await this.getMatchesFromCategory(category.url);
          
          const categoryWithMatches = {
            ...category,
            matches: []
          };

          for (const match of matches) {
            try {
              const streamUrls = await this.extractStreamUrls(match.url);
              
              categoryWithMatches.matches.push({
                ...match,
                streams: streamUrls
              });
            } catch (error) {
              console.error(`Error extracting streams for match ${match.url}:`, error);
              categoryWithMatches.matches.push({
                ...match,
                streams: [],
                error: error.message
              });
            }
          }

          results.push(categoryWithMatches);
        } catch (error) {
          console.error(`Error processing category ${category.url}:`, error);
          results.push({
            ...category,
            matches: [],
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error getting all cricket data:', error);
      throw error;
    }
  }
}

module.exports = { CricwatchScraper, CRICWATCH_BASE_URL };