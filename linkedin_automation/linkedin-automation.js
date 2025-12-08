const { chromium } = require('playwright');
const fs = require('fs');

const AUTH_FILE = 'linkedin-auth.json';

// Step 1: Initial setup - login manually once
async function setupAuthentication() {
  console.log('🔐 Setting up LinkedIn authentication...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100 // Slow down for human-like speed
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // Go to LinkedIn
    await page.goto('https://www.linkedin.com');
    
    console.log('📌 INSTRUCTIONS:');
    console.log('1. Log in to LinkedIn in the browser window');
    console.log('2. Complete any CAPTCHA or security checks');
    console.log('3. Make sure you\'re on your feed (linkedin.com/feed)');
    console.log('4. Press ENTER in this terminal when ready\n');
    
    // Wait for user confirmation
    await new Promise(resolve => {
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      stdin.once('data', () => {
        stdin.setRawMode(false);
        stdin.pause();
        resolve();
      });
    });
    
    // Verify we're logged in by checking cookies via Playwright API
    const cookies = await context.cookies();
    const isLoggedIn = cookies.some(cookie => cookie.name === 'li_at');
    
    if (isLoggedIn) {
      await context.storageState({ path: AUTH_FILE });
      console.log('\n✅ Authentication saved successfully!');
      console.log(`📁 Session saved to: ${AUTH_FILE}`);
      console.log('\n🎉 Setup complete! You can now run the automation.');
    } else {
      console.log('\n❌ Login verification failed.');
      console.log('Make sure you\'re logged in and try again.');
    }
  } catch (error) {
    console.error('\n❌ Error during setup:', error.message);
  } finally {
    await browser.close();
  }
}

// Step 2: Use saved authentication
async function automateWithSavedAuth(scrollDelay = 5000, outputFile = 'linkedin-connections.jsonl', maxDepth = null) {
  if (!fs.existsSync(AUTH_FILE)) {
    console.log('❌ No saved authentication found.');
    console.log('Please run: node linkedin-automation.js setup');
    return;
  }

  console.log('🚀 Starting automation with saved session...');
  console.log(`⏱️  Scroll delay: ${scrollDelay}ms`);
  console.log(`📁 Output file: ${outputFile}`);
  if (maxDepth) {
    console.log(`📏 Max scroll depth: ${maxDepth}`);
  }
  console.log('');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 50
  });
  
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate to connections
    console.log('📍 Navigating to LinkedIn connections...');
    await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Check if session is still valid
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
      console.log('\n⚠️ Session expired or security check required.');
      console.log('Please run: node linkedin-automation.js setup');
      await browser.close();
      return;
    }
    
    console.log('✅ Successfully accessed LinkedIn with saved session\n');

    // Wait for page to load
    console.log('⏳ Waiting for initial page load...');
    await page.waitForTimeout(3000);

    // Scroll and collect all connections
    console.log('📜 Starting to scroll and collect connections...\n');

    const allConnections = new Map(); // Use Map to avoid duplicates (keyed by URL)
    let noNewConnectionsCount = 0;
    const maxNoNewConnections = 3; // Stop after 3 scrolls with no new connections
    let previousConnectionCount = 0;
    let scrollCount = 0;

    while (noNewConnectionsCount < maxNoNewConnections && (!maxDepth || scrollCount < maxDepth)) {
      scrollCount++;
      // Extract connections from current view
      const extractionResult = await page.evaluate(() => {
        const results = [];
        const connectionContainers = Array.from(document.querySelectorAll('[data-view-name="connections-list"]'));

        for (const container of connectionContainers) {
          const profileLink = container.querySelector('a[href*="/in/"]');
          if (!profileLink) continue;

          const textContent = container.innerText;
          const lines = textContent.split('\n').filter(line => line.trim());

          let name = '';
          let headline = '';

          const nameElement = container.querySelector('span[aria-hidden="true"]') ||
                             profileLink.querySelector('span') ||
                             profileLink;
          name = nameElement?.textContent?.trim() || '';

          if (!name && lines.length > 0) {
            name = lines[0];
          }

          if (lines.length > 1) {
            headline = lines.find(line =>
              !line.includes('Message') &&
              !line.includes('Connected on') &&
              line !== name
            ) || '';
          }

          if (name && profileLink.href) {
            results.push({
              name: name,
              headline: headline || '',
              profileUrl: profileLink.href
            });
          }
        }

        // Find scrollable container - try multiple possible selectors
        const scrollableSelectors = [
          '.scaffold-finite-scroll',
          '.scaffold-finite-scroll__content',
          '[data-view-name="connections-list"]',
          'main',
          '.application-outlet'
        ];

        let scrollContainer = null;
        for (const selector of scrollableSelectors) {
          const element = document.querySelector(selector);
          if (element && element.scrollHeight > element.clientHeight) {
            scrollContainer = selector;
            break;
          }
        }

        return {
          connections: results,
          scrollContainer: scrollContainer
        };
      });

      const newConnections = extractionResult.connections;

      // Add new connections to the map (duplicates will be overwritten)
      let newCount = 0;
      newConnections.forEach(conn => {
        if (!allConnections.has(conn.profileUrl)) {
          allConnections.set(conn.profileUrl, conn);
          newCount++;
        }
      });

      console.log(`📊 Current view: ${newConnections.length} connections | Total unique: ${allConnections.size} | New: ${newCount}`);

      // Check if we found new connections
      if (allConnections.size === previousConnectionCount) {
        noNewConnectionsCount++;
        console.log(`⚠️  No new connections found (attempt ${noNewConnectionsCount}/${maxNoNewConnections})`);
      } else {
        noNewConnectionsCount = 0; // Reset if new connections found
        previousConnectionCount = allConnections.size;
      }

      // Scroll down using the correct container
      if (extractionResult.scrollContainer) {
        console.log(`📜 Scrolling container: ${extractionResult.scrollContainer}`);
        await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          if (element) {
            element.scrollTo(0, element.scrollHeight);
          }
        }, extractionResult.scrollContainer);
      } else {
        // Fallback to window scroll
        console.log(`📜 Scrolling window (fallback)`);
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
      }

      // Wait for the specified delay
      console.log(`⏳ Waiting ${scrollDelay}ms for new content to load...`);
      await page.waitForTimeout(scrollDelay);
    }

    console.log(`\n✅ Reached end of page`);
    console.log(`📇 Total connections collected: ${allConnections.size}\n`);

    // Convert Map to array
    const connections = Array.from(allConnections.values());

    if (connections.length > 0) {
      console.log(`📇 Found ${connections.length} connections:\n`);
      connections.forEach((conn, i) => {
        console.log(`${i + 1}. ${conn.name}`);
        console.log(`   ${conn.headline || 'No headline'}`);
        console.log(`   ${conn.profileUrl || 'No URL'}\n`);
      });

      // Save to JSONL file
      const jsonlData = connections.map(conn => JSON.stringify({
        name: conn.name,
        description: conn.headline || '',
        url: conn.profileUrl
      })).join('\n');

      // Ensure data directory exists
      const outputDir = require('path').dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`📁 Created directory: ${outputDir}`);
      }

      fs.writeFileSync(outputFile, jsonlData, 'utf8');
      console.log(`\n💾 Connections saved to: ${outputFile}`);
      console.log(`📊 Total connections saved: ${connections.length}`);
    } else {
      console.log('⚠️ No connections found with current selectors.');
      console.log('💡 Taking a screenshot for debugging...');
      await page.screenshot({ path: 'linkedin-debug.png', fullPage: true });
      console.log('📸 Screenshot saved to: linkedin-debug.png');
    }
    
    console.log('\n✅ Automation completed successfully!');
    
    // Keep browser open for 5 seconds so you can see the result
    console.log('⏱️ Browser will close in 5 seconds...');
    await page.waitForTimeout(5000);
    
  } catch (error) {
    console.error('\n❌ Error during automation:', error.message);
    console.log('\nPossible issues:');
    console.log('- LinkedIn page structure changed');
    console.log('- Session expired');
    console.log('- Network issues');
  } finally {
    await browser.close();
  }
}

// Parse command line arguments
function parseArgs(argv) {
  const args = {
    command: argv[2],
    scrollDelay: 5000,
    outputFile: 'data/linkedin-connections.jsonl',
    maxDepth: null
  };

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--output' && argv[i + 1]) {
      // Prepend 'data/' if not already included
      const filename = argv[i + 1];
      args.outputFile = filename.startsWith('data/') ? filename : `data/${filename}`;
      i++;
    } else if (arg === '--depth' && argv[i + 1]) {
      args.maxDepth = parseInt(argv[i + 1], 10);
      i++;
    } else if (!arg.startsWith('--')) {
      // First non-flag argument is scroll delay
      const delay = parseInt(arg, 10);
      if (!isNaN(delay) && delay > 0) {
        args.scrollDelay = delay;
      }
    }
  }

  return args;
}

// Main function to handle command line arguments
async function main() {
  const args = parseArgs(process.argv);

  console.log('═══════════════════════════════════════');
  console.log('   LinkedIn Automation Script');
  console.log('═══════════════════════════════════════\n');

  if (args.command === 'setup') {
    await setupAuthentication();
  } else if (args.command === 'run') {
    if (isNaN(args.scrollDelay) || args.scrollDelay < 0) {
      console.log('❌ Invalid scroll delay. Must be a positive number in milliseconds.');
      return;
    }
    if (args.maxDepth !== null && (isNaN(args.maxDepth) || args.maxDepth < 1)) {
      console.log('❌ Invalid depth. Must be a positive number.');
      return;
    }
    await automateWithSavedAuth(args.scrollDelay, args.outputFile, args.maxDepth);
  } else {
    console.log('Usage:');
    console.log('  node linkedin-automation.js setup                           - First time setup');
    console.log('  node linkedin-automation.js run [scrollDelay] [options]     - Run automation\n');
    console.log('Options:');
    console.log('  --output <filename>  Output file name (default: data/linkedin-connections.jsonl)');
    console.log('  --depth <number>     Maximum number of scrolls (default: unlimited)\n');
    console.log('Parameters:');
    console.log('  scrollDelay - Time in milliseconds between scrolls (default: 5000)\n');
    console.log('Note: All files are saved in the "data" directory (created automatically)\n');
    console.log('Examples:');
    console.log('  1. First run: node linkedin-automation.js setup');
    console.log('  2. Basic run:  node linkedin-automation.js run');
    console.log('  3. Custom delay: node linkedin-automation.js run 3000');
    console.log('  4. Custom output: node linkedin-automation.js run --output my-connections.jsonl');
    console.log('  5. Limit depth: node linkedin-automation.js run --depth 5');
    console.log('  6. Combined: node linkedin-automation.js run 3000 --output results.jsonl --depth 10\n');
  }
}

main().catch(console.error);

