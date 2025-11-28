const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Chrome executable path detection
function getChromeExecutableCandidates() {
  const candidates = [];

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
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    );
  }

  return candidates.filter(p => p && fs.existsSync(p));
}

function getChromeExecutablePath() {
  const candidates = getChromeExecutableCandidates();
  if (candidates.length === 0) {
    throw new Error('No Chrome executable found');
  }
  return candidates[0];
}

async function debugMatchPage() {
  const executablePath = getChromeExecutablePath();
  
  const browser = await puppeteer.launch({
    executablePath,
    headless: false, // Show browser for debugging
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  await page.setExtraHTTPHeaders({
    'Referer': 'https://cricwatch.io/',
    'Origin': 'https://cricwatch.io'
  });

  // Test a specific match page
  const matchUrl = 'https://cricwatch.io/big-bash-league/melbourne-renegades-w-vs-melbourne-stars-w-stream';
  console.log(`Navigating to ${matchUrl}...`);
  
  await page.goto(matchUrl, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Wait a bit for any dynamic content
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Analyzing match page structure...');
  
  // Get page title
  const title = await page.title();
  console.log('Page title:', title);

  // Look for any elements that might contain streams or links
  const potentialElements = await page.evaluate(() => {
    const results = [];
    
    // Try many different selectors that might contain streams
    const selectors = [
      'iframe[src]',
      'iframe[data-src]',
      'video source',
      'video[src]',
      'a[href*="m3u8"]',
      'a[href*="mp4"]',
      'button[onclick*="stream"]',
      'button[onclick*="play"]',
      '[class*="player"]',
      '[class*="video"]',
      '[class*="stream"]',
      '[id*="player"]',
      '[id*="video"]',
      '[id*="stream"]',
      'script[src*="player"]',
      'script[src*="stream"]',
      'div[class*="embed"]',
      'div[class*="player"]'
    ];

    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Selector "${selector}" found ${elements.length} elements`);
          
          elements.forEach((el, index) => {
            const text = el.textContent?.trim();
            const src = el.src || el.getAttribute('data-src');
            const href = el.href;
            const onclick = el.getAttribute('onclick');
            const innerHTML = el.innerHTML?.substring(0, 500);
            
            results.push({
              selector,
              index,
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              text: text,
              src: src,
              href: href,
              onclick: onclick,
              innerHTML: innerHTML
            });
          });
        }
      } catch (e) {
        console.log(`Error with selector "${selector}": ${e.message}`);
      }
    });

    return results;
  });

  console.log('\n=== POTENTIAL STREAM ELEMENTS ===');
  potentialElements.forEach((item, index) => {
    console.log(`${index + 1}. ${item.selector}[${item.index}] - ${item.tagName}.${item.className}`);
    if (item.id) console.log(`   ID: ${item.id}`);
    if (item.text) console.log(`   Text: "${item.text}"`);
    if (item.src) console.log(`   Src: ${item.src}`);
    if (item.href) console.log(`   Href: ${item.href}`);
    if (item.onclick) console.log(`   Onclick: ${item.onclick}`);
    if (item.innerHTML) console.log(`   HTML: ${item.innerHTML}`);
    console.log('');
  });

  // Check for any scripts that might contain stream URLs
  const scripts = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    return scripts.map((script, index) => {
      const content = script.textContent;
      const src = script.src;
      if (content && (content.includes('m3u8') || content.includes('mp4') || content.includes('stream') || content.includes('player'))) {
        return {
          index,
          src: src,
          content: content.substring(0, 2000)
        };
      }
      return null;
    }).filter(Boolean);
  });

  console.log('\n=== RELEVANT SCRIPTS ===');
  scripts.forEach((script, index) => {
    console.log(`${index + 1}. Script[${script.index}]:`);
    if (script.src) console.log(`   Src: ${script.src}`);
    console.log(`   Content: ${script.content.substring(0, 1000)}...`);
    console.log('');
  });

  // Set up network interception to catch stream URLs
  const streamUrls = [];
  
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const resourceType = req.resourceType();
    
    // Log all requests that might be streams
    if (url.includes('.m3u8') || url.includes('.mp4') || 
        url.includes('stream') || url.includes('player') ||
        resourceType === 'media') {
      console.log(`Network request: ${url} (${resourceType})`);
      if (!streamUrls.find(s => s.url === url)) {
        streamUrls.push({
          url: url,
          type: resourceType
        });
      }
    }
  });

  page.on('response', async (res) => {
    const url = res.url();
    const status = res.status();
    const headers = res.headers();
    const contentType = (headers['content-type'] || '').toLowerCase();

    // Look for stream responses
    if (status === 200 && (
      url.includes('.m3u8') || 
      url.includes('.mp4') ||
      contentType.includes('application/x-mpegurl') ||
      contentType.includes('video/mp4') ||
      contentType.includes('video/'))) {
      console.log(`Stream response: ${url} (${contentType})`);
      if (!streamUrls.find(s => s.url === url)) {
        streamUrls.push({
          url: url,
          contentType: contentType,
          type: 'stream'
        });
      }
    }
  });

  // Try to trigger any stream loading by clicking common elements
  console.log('\nTrying to trigger stream loading...');
  
  const clickSelectors = [
    'button',
    'a[href*="stream"]',
    'a[href*="watch"]',
    '[class*="play"]',
    '[class*="stream"]',
    '[onclick*="play"]',
    '[onclick*="stream"]'
  ];

  for (const selector of clickSelectors) {
    try {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} elements with selector "${selector}"`);
        // Try clicking the first one
        await elements[0].click();
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for any network activity
        break;
      }
    } catch (e) {
      console.log(`Error clicking ${selector}: ${e.message}`);
    }
  }

  // Wait a bit more for network activity
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n=== CAPTURED STREAM URLS ===');
  streamUrls.forEach((url, index) => {
    console.log(`${index + 1}. ${url.url} (${url.type || url.contentType})`);
  });

  // Take screenshot
  await page.screenshot({ path: 'match-debug.png', fullPage: true });
  console.log('\nScreenshot saved as match-debug.png');

  // Save HTML
  const html = await page.content();
  fs.writeFileSync('match-debug.html', html);
  console.log('HTML saved as match-debug.html');

  console.log('\nPress Ctrl+C to close browser and exit...');
  
  // Keep browser open for manual inspection
  await new Promise(resolve => {
    process.on('SIGINT', async () => {
      console.log('\nClosing browser...');
      await browser.close();
      resolve();
    });
  });
}

debugMatchPage().catch(console.error);