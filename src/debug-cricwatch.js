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

async function debugCricwatch() {
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

  console.log('Navigating to cricwatch.io...');
  await page.goto('https://cricwatch.io', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Wait a bit for any dynamic content
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Analyzing page structure...');
  
  // Get page title and basic info
  const title = await page.title();
  console.log('Page title:', title);

  // Get all links that might be relevant
  const allLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links.map(link => ({
      text: link.textContent?.trim(),
      href: link.href,
      className: link.className,
      id: link.id
    })).filter(link => link.text && link.href && link.href.includes('cricwatch.io'));
  });

  console.log('\n=== ALL RELEVANT LINKS ===');
  allLinks.forEach((link, index) => {
    console.log(`${index + 1}. Text: "${link.text}" | Href: ${link.href} | Class: ${link.className}`);
  });

  // Look for any elements that might contain cricket content
  const potentialContent = await page.evaluate(() => {
    const selectors = [
      'div[class*="match"]',
      'div[class*="game"]', 
      'div[class*="cricket"]',
      'div[class*="stream"]',
      'div[class*="live"]',
      'article',
      'section',
      'main',
      '[class*="container"]',
      '[class*="content"]',
      '[class*="list"]',
      '[class*="grid"]'
    ];

    const results = [];
    
    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach((el, index) => {
            const text = el.textContent?.trim().substring(0, 200);
            if (text && text.length > 20) {
              results.push({
                selector,
                index,
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                text: text,
                innerHTML: el.innerHTML.substring(0, 500)
              });
            }
          });
        }
      } catch (e) {
        // Ignore errors
      }
    });

    return results;
  });

  console.log('\n=== POTENTIAL CONTENT ELEMENTS ===');
  potentialContent.forEach((item, index) => {
    console.log(`${index + 1}. ${item.selector}[${item.index}] - ${item.tagName}.${item.className}`);
    console.log(`   Text: ${item.text}`);
    console.log(`   HTML: ${item.innerHTML.substring(0, 200)}...`);
    console.log('');
  });

  // Check for any scripts that might contain data
  const scripts = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    return scripts.map((script, index) => {
      const content = script.textContent;
      if (content && (content.includes('match') || content.includes('cricket') || content.includes('stream'))) {
        return {
          index,
          content: content.substring(0, 1000)
        };
      }
      return null;
    }).filter(Boolean);
  });

  console.log('\n=== RELEVANT SCRIPTS ===');
  scripts.forEach((script, index) => {
    console.log(`${index + 1}. Script[${script.index}]:`);
    console.log(script.content);
    console.log('');
  });

  // Take a screenshot for visual reference
  await page.screenshot({ path: 'cricwatch-debug.png', fullPage: true });
  console.log('\nScreenshot saved as cricwatch-debug.png');

  // Save the HTML for inspection
  const html = await page.content();
  fs.writeFileSync('cricwatch-debug.html', html);
  console.log('HTML saved as cricwatch-debug.html');

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

debugCricwatch().catch(console.error);