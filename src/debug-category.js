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

async function debugCategoryPage() {
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

  // Test World Cup page first
  const categoryUrl = 'https://cricwatch.io/world-cup-streams';
  console.log(`Navigating to ${categoryUrl}...`);
  
  await page.goto(categoryUrl, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Wait a bit for any dynamic content
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Analyzing category page structure...');
  
  // Get page title
  const title = await page.title();
  console.log('Page title:', title);

  // Look for match elements
  const matchElements = await page.evaluate(() => {
    const results = [];
    
    // Try many different selectors that might contain matches
    const selectors = [
      'a[href*="/watch/"]',
      'a[href*="/stream/"]', 
      'a[href*="/live/"]',
      'a[href*="vs"]',
      '[class*="match"] a',
      '[class*="game"] a',
      '[class*="stream"] a',
      '[class*="video"] a',
      'button[onclick*="stream"]',
      'button[onclick*="watch"]',
      '.btn[href*="/"]',
      'a.btn',
      'a[class*="btn"]'
    ];

    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        console.log(`Selector "${selector}" found ${elements.length} elements`);
        
        elements.forEach((el, index) => {
          const text = el.textContent?.trim();
          const href = el.href || el.getAttribute('data-url');
          const onclick = el.getAttribute('onclick');
          
          if (text && (href || onclick) && text.length > 5) {
            results.push({
              selector,
              index,
              text: text.substring(0, 100),
              href: href,
              onclick: onclick,
              className: el.className,
              tagName: el.tagName,
              innerHTML: el.innerHTML.substring(0, 200)
            });
          }
        });
      } catch (e) {
        console.log(`Error with selector "${selector}": ${e.message}`);
      }
    });

    return results;
  });

  console.log('\n=== POTENTIAL MATCH ELEMENTS ===');
  matchElements.forEach((item, index) => {
    console.log(`${index + 1}. ${item.selector}[${item.index}] - ${item.tagName}.${item.className}`);
    console.log(`   Text: "${item.text}"`);
    console.log(`   Href: ${item.href}`);
    console.log(`   Onclick: ${item.onclick}`);
    console.log(`   HTML: ${item.innerHTML}`);
    console.log('');
  });

  // Look for any elements that might contain stream links
  const streamElements = await page.evaluate(() => {
    const results = [];
    
    // Look for elements that might be stream links
    const selectors = [
      'a[href*="link"]',
      'a[href*="stream"]',
      '[class*="link"]',
      '[class*="stream"]',
      'button[class*="link"]',
      'button[class*="stream"]',
      '[onclick*="link"]',
      '[onclick*="stream"]'
    ];

    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        console.log(`Stream selector "${selector}" found ${elements.length} elements`);
        
        elements.forEach((el, index) => {
          const text = el.textContent?.trim();
          const href = el.href || el.getAttribute('data-url');
          const onclick = el.getAttribute('onclick');
          
          if (text && (href || onclick)) {
            results.push({
              selector,
              index,
              text: text.substring(0, 50),
              href: href,
              onclick: onclick,
              className: el.className,
              tagName: el.tagName
            });
          }
        });
      } catch (e) {
        console.log(`Error with stream selector "${selector}": ${e.message}`);
      }
    });

    return results;
  });

  console.log('\n=== POTENTIAL STREAM ELEMENTS ===');
  streamElements.forEach((item, index) => {
    console.log(`${index + 1}. ${item.selector}[${item.index}] - ${item.tagName}.${item.className}`);
    console.log(`   Text: "${item.text}"`);
    console.log(`   Href: ${item.href}`);
    console.log(`   Onclick: ${item.onclick}`);
    console.log('');
  });

  // Check for any scripts with match/stream data
  const scripts = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    return scripts.map((script, index) => {
      const content = script.textContent;
      if (content && (content.includes('match') || content.includes('stream') || content.includes('watch'))) {
        return {
          index,
          content: content.substring(0, 2000)
        };
      }
      return null;
    }).filter(Boolean);
  });

  console.log('\n=== RELEVANT SCRIPTS ===');
  scripts.forEach((script, index) => {
    console.log(`${index + 1}. Script[${script.index}]:`);
    console.log(script.content.substring(0, 500) + '...');
    console.log('');
  });

  // Take screenshot
  await page.screenshot({ path: 'category-debug.png', fullPage: true });
  console.log('\nScreenshot saved as category-debug.png');

  // Save HTML
  const html = await page.content();
  fs.writeFileSync('category-debug.html', html);
  console.log('HTML saved as category-debug.html');

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

debugCategoryPage().catch(console.error);