const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const UserAgent = require('user-agents');
const fs = require('fs');

const AUTH_FILE = 'linkedin-auth.json';

// Helper for random delays to mimic human behavior
function getRandomDelay(min = 2000, max = 12000) {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  console.log(`⏳ Waiting for ${delay}ms...`);
  return delay;
}

// Step 1: Initial setup - login manually once
async function setupAuthentication() {
  console.log('🔐 Setting up LinkedIn authentication...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100 + getRandomDelay(0, 50) // Variable slowMo
  });

  const userAgent = new UserAgent({ deviceCategory: 'desktop' });
  const userAgentString = userAgent.toString();
  const viewport = {
    width: 1920 + Math.floor(Math.random() * 100),
    height: 1080 + Math.floor(Math.random() * 100)
  };

  const context = await browser.newContext({
    viewport: viewport,
    userAgent: userAgentString,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { longitude: -74.006, latitude: 40.7128 },
    permissions: ['geolocation']
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
      // Save storage state
      await context.storageState({ path: AUTH_FILE });
      // Save user agent alongside storage state
      let authData = {};
      try {
        authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
      } catch (e) {
        authData = {};
      }
      authData.userAgent = userAgentString;
      fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), 'utf8');
      console.log('\n✅ Authentication saved successfully!');
      console.log(`📁 Session saved to: ${AUTH_FILE}`);
      console.log(`📝 User agent saved: ${userAgentString}`);
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

// Helper function to scrape a profile using an existing page (reusable)
async function scrapeProfileWithPage(page, linkedinProfile) {
  // Extract username from URL
  const usernameMatch = linkedinProfile.match(/\/in\/([^\/]+)/);
  const username = usernameMatch ? decodeURIComponent(usernameMatch[1].replace(/\/$/, '')) : 'profile';

  console.log(`🔗 Profile URL: ${linkedinProfile}`);

  // Navigate to profile
  await page.goto(linkedinProfile, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  // Wait for initial content to load
  await page.waitForTimeout(getRandomDelay(3000, 6000));

  // Scroll down the page to trigger lazy loading
  console.log('📜 Scrolling to load all content...');

  // Scroll down in steps - LinkedIn uses main#workspace as the scrollable container
  for (let i = 0; i < 5; i++) {
    const scrolled = await page.evaluate((step) => {
      const scrollTargets = [
        document.querySelector('main#workspace'),
        document.querySelector('main'),
        document.documentElement,
        document.body
      ];

      let scrollElement = null;
      for (const target of scrollTargets) {
        if (target && target.scrollHeight > target.clientHeight) {
          scrollElement = target;
          break;
        }
      }

      if (!scrollElement) {
        scrollElement = document.documentElement;
      }

      const scrollAmount = window.innerHeight * 0.8;
      const beforeScroll = scrollElement.scrollTop;
      scrollElement.scrollTop += scrollAmount;
      const afterScroll = scrollElement.scrollTop;
      return {
        before: beforeScroll,
        after: afterScroll,
        step: step + 1,
        element: scrollElement.tagName + (scrollElement.id ? '#' + scrollElement.id : '')
      };
    }, i);
    await page.waitForTimeout(getRandomDelay(20000, 30000));
  }

  // Scroll back to top
  await page.evaluate(() => {
    const scrollElement = document.querySelector('main#workspace') ||
      document.querySelector('main') ||
      document.documentElement;
    scrollElement.scrollTop = 0;
  });

  // Wait for content to fully load after scrolling
  await page.waitForTimeout(3000);

  // Try to expand "see more" in About section
  try {
    await page.waitForSelector('#about', { timeout: 5000 }).catch(() => { });

    const seeMoreSelectors = [
      '#about ~ div button:has-text("see more")',
      '#about + div button:has-text("see more")',
      'section:has(#about) button:has-text("see more")',
      'button[aria-expanded="false"]:has-text("see more")',
      'button.inline-show-more-text__button'
    ];

    for (const selector of seeMoreSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          await page.waitForTimeout(getRandomDelay(2000, 5000));
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
  } catch (e) {
    // Ignore errors
  }

  // Take debug screenshot
  const path = require('path');
  const configDir = process.env.CONFIG_DIR || path.join(__dirname, 'data');
  const debugDir = path.join(configDir, 'profiles');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  const screenshotPath = path.join(debugDir, `${username}-debug.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Save full rendered HTML
  const htmlPath = path.join(debugDir, `${username}.html`);
  const htmlContent = await page.content();
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  // Wait for Experience section to be present
  try {
    await page.waitForSelector('section[componentkey*="ExperienceTopLevelSection"]', { timeout: 5000 });
  } catch (e) {
    try {
      await page.waitForFunction(() => {
        const sections = document.querySelectorAll('section');
        return Array.from(sections).some(s => {
          const h2 = s.querySelector('h2');
          return h2 && h2.textContent.toLowerCase().includes('experience');
        });
      }, { timeout: 5000 });
    } catch (e2) {
      // Continue anyway
    }
  }

  // Extract profile data
  const profileData = await page.evaluate(() => {
    const data = {
      about: {
        name: '',
        title: '',
        summary: ''
      },
      experience: []
    };

    const findSection = (componentKeyPart, headingText) => {
      let section = document.querySelector(`section[componentkey*="${componentKeyPart}"]`);
      if (section) return section;

      const allSections = Array.from(document.querySelectorAll('section'));
      return allSections.find(s => {
        const heading = s.querySelector('h2');
        return heading && heading.textContent.trim().toLowerCase().includes(headingText.toLowerCase());
      });
    };

    // Extract name and title from profile header
    const topcardSection = document.querySelector('section[componentkey*="Topcard"]');
    if (topcardSection) {
      const nameElement = topcardSection.querySelector('h2');
      if (nameElement) {
        data.about.name = nameElement.textContent.trim();
      }

      const paragraphs = topcardSection.querySelectorAll('p');
      for (const p of paragraphs) {
        const text = p.textContent.trim();
        if (!text || text.length < 3 || text.length > 150) continue;
        if (text === data.about.name) continue;
        if (text.includes('connections')) continue;
        if (text.includes('Contact info')) continue;
        if (text.includes('followers')) continue;
        if (text.startsWith('·')) continue;
        if (/^\d+/.test(text)) continue;
        if (text.includes('Show all')) continue;

        data.about.title = text;
        break;
      }
    }

    // Extract About/Summary section text
    const aboutSection = findSection('About', 'about');
    if (aboutSection) {
      const allSpans = aboutSection.querySelectorAll('span[aria-hidden="true"]');
      let longestText = '';
      allSpans.forEach(span => {
        const text = span.textContent.trim();
        if (text.length > longestText.length && text.length > 50) {
          longestText = text;
        }
      });
      data.about.summary = longestText;
    }

    // Extract Experience section
    const experienceSection = findSection('ExperienceTopLevelSection', 'experience');

    if (experienceSection) {
      const companyLinks = experienceSection.querySelectorAll('a[href*="/company/"]');
      const roleLinks = Array.from(companyLinks)
        .map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') }))
        .filter(item => item.text && item.text.length > 5);

      const allSpans = experienceSection.querySelectorAll('span');
      const descriptions = Array.from(allSpans)
        .map(s => s.textContent.trim())
        .filter(t => t && t.length > 100 && !t.includes('Show all'));

      const companyMap = {};
      const knownCompanies = ['inDrive', 'Sweed', 'FunCorp', 'IVI', 'Yandex', 'Google', 'Meta', 'Microsoft', 'Apple', 'Amazon', 'Netflix', 'Uber', 'Lyft', 'Airbnb', 'Spotify', 'Twitter', 'LinkedIn', 'Facebook', 'Tesla', 'SpaceX', 'Stripe', 'Shopify', 'Oracle', 'IBM', 'SAP', 'Sber', 'Mail.ru', 'VK', 'Tinkoff', 'Kaspersky'];

      roleLinks.forEach(roleItem => {
        const text = roleItem.text;
        for (const company of knownCompanies) {
          if (text.includes(company)) {
            companyMap[roleItem.href] = company;
            break;
          }
        }
        const companyOnlyMatch = text.match(/^([A-Z][A-Za-z]+)(\d+\s*(?:yr|yrs|mo|mos))/);
        if (companyOnlyMatch) {
          companyMap[roleItem.href] = companyOnlyMatch[1];
        }
      });

      roleLinks.forEach((roleItem, idx) => {
        const roleText = roleItem.text;

        if (/^[A-Z][A-Za-z]+\d+\s*(?:yr|yrs|mo|mos)\s*$/.test(roleText)) {
          return;
        }

        const experience = {};

        const dateMatch = roleText.match(/([A-Z][a-z]{2,8}\s+\d{4})\s*-\s*([A-Z][a-z]{2,8}\s+\d{4}|Present)/);
        if (dateMatch) {
          experience.duration = `${dateMatch[1]} - ${dateMatch[2]}`;
        }

        const tenureMatch = roleText.match(/(\d+\s*(?:yr|yrs|mo|mos|year|years|month|months)(?:\s+\d+\s*(?:mo|mos|month|months))?)/i);
        if (tenureMatch) {
          experience.tenure = tenureMatch[1];
        }

        const workTypeMatch = roleText.match(/\b(Remote|Hybrid|On-site)\b/i);
        if (workTypeMatch) {
          experience.workType = workTypeMatch[1];
        }

        const locationMatch = roleText.match(/\d+\s*(?:mo|mos|yr|yrs)[s]?\s*([A-Z][a-zA-Z\s,]+?)(?:\s*·\s*(?:Remote|Hybrid|On-site)|$)/i);
        if (locationMatch && locationMatch[1]) {
          experience.location = locationMatch[1].trim();
        }

        if (companyMap[roleItem.href]) {
          experience.company = companyMap[roleItem.href];
        }

        let titleText = roleText;

        if (dateMatch) {
          titleText = titleText.substring(0, titleText.indexOf(dateMatch[1]));
        }

        for (const company of knownCompanies) {
          const companyIdx = titleText.indexOf(company);
          if (companyIdx > 0) {
            titleText = titleText.substring(0, companyIdx);
            break;
          }
        }

        titleText = titleText.replace(/\s*·\s*(?:Full-time|Part-time|Contract|Freelance|Internship).*$/i, '').trim();

        experience.title = titleText;

        if (descriptions[idx]) {
          experience.description = descriptions[idx].replace(/…\s*more$/, '').trim();
        }

        if (experience.title && experience.title.length > 2) {
          data.experience.push(experience);
        }
      });

      const seen = new Set();
      data.experience = data.experience.filter(exp => {
        const key = `${exp.title}|${exp.company}|${exp.duration || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return data;
  });

  // Save to JSON file
  const outputDir = path.join(configDir, 'profiles');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, `${username}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(profileData, null, 2), 'utf8');

  console.log(`✅ ${profileData.about.name || username}: ${profileData.experience.length} experiences`);

  return profileData;
}

// Step 2: Get single profile (opens browser, scrapes, closes)
async function getProfile(linkedinProfile) {
  if (!fs.existsSync(AUTH_FILE)) {
    console.log('❌ No saved authentication found.');
    console.log('Please run: node linkedin-automation.js setup');
    return;
  }

  console.log('🔍 Fetching LinkedIn profile...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50
  });

  let userAgentString = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  try {
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (authData.userAgent) {
      userAgentString = authData.userAgent;
    }
  } catch (e) { }

  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1920, height: 1080 },
    userAgent: userAgentString
  });

  const page = await context.newPage();

  try {
    await scrapeProfileWithPage(page, linkedinProfile);

    console.log('\n✅ Profile extraction completed successfully!');
    console.log('⏱️ Browser will close in 3 seconds...');
    await page.waitForTimeout(3000);

  } catch (error) {
    console.error('\n❌ Error during profile extraction:', error.message);
    console.log('\nPossible issues:');
    console.log('- LinkedIn page structure changed');
    console.log('- Profile is private or restricted');
    console.log('- Session expired');
  } finally {
    await browser.close();
  }
}

// Step 3: Scrape profiles from connections list
async function scrapeProfiles(delay = 10000, limit = null) {
  if (!fs.existsSync(AUTH_FILE)) {
    console.log('❌ No saved authentication found.');
    console.log('Please run: node linkedin-automation.js setup');
    return;
  }

  console.log('🔍 Starting batch profile scraping...\n');

  const path = require('path');
  const configDir = process.env.CONFIG_DIR || path.join(__dirname, 'data');
  const profilesDir = path.join(configDir, 'profiles');
  const connectionsFile = path.join(configDir, 'linkedin-connections.jsonl');

  // Step 1: Ensure profiles directory exists
  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
  }

  // Step 2: Read connections from JSONL
  console.log('📂 Reading connections from linkedin-connections.jsonl...');
  console.log(`📁 Using config directory: ${configDir}`);
  if (!fs.existsSync(connectionsFile)) {
    console.log(`❌ File not found: ${connectionsFile}`);
    console.log('Please run: node linkedin-automation.js run');
    return;
  }

  const connections = [];
  const fileContent = fs.readFileSync(connectionsFile, 'utf8');
  const lines = fileContent.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const connection = JSON.parse(line);
      connections.push(connection);
    } catch (e) {
      console.log(`⚠️  Skipping invalid JSON line: ${line.substring(0, 50)}...`);
    }
  }
  console.log(`✅ Found ${connections.length} connections\n`);

  // Step 3: Filter connections that need scraping
  const toScrape = [];
  for (const connection of connections) {
    if (!connection.url) {
      console.log(`⚠️  Skipping connection without URL: ${connection.name}`);
      continue;
    }

    // Extract username from URL using regex (matches /in/username pattern)
    const usernameMatch = connection.url.match(/\/in\/([^\/]+)/);
    const username = usernameMatch ? decodeURIComponent(usernameMatch[1]) : null;

    if (!username) {
      console.log(`⚠️  Could not extract username from URL: ${connection.url}`);
      continue;
    }

    // Add to process list (we check existence later)
    toScrape.push({
      name: connection.name,
      url: connection.url,
      username: username
    });
  }

  console.log(`📊 Total profiles to process: ${toScrape.length}\n`);

  if (toScrape.length === 0) {
    console.log('⚠️ No profiles found to scrape!');
    return;
  }

  // Apply limit if specified
  const profilesToScrape = limit ? toScrape.slice(0, limit) : toScrape;
  if (limit && limit < toScrape.length) {
    console.log(`📏 Limiting to first ${limit} profiles\n`);
  }

  // Step 4: Open browser once and reuse for all profiles
  console.log(`⏱️  Delay between profiles: ${delay}ms`);
  console.log('🚀 Opening browser (will reuse same window for all profiles)...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50
  });

  let userAgentString = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  try {
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (authData.userAgent) {
      userAgentString = authData.userAgent;
    }
  } catch (e) { }

  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1920, height: 1080 },
    userAgent: userAgentString
  });

  const page = await context.newPage();
  let successCount = 0;
  let errorCount = 0;

  try {
    for (let i = 0; i < profilesToScrape.length; i++) {
      const profile = profilesToScrape[i];

      // Check if profile already exists
      const profilePath = path.join(profilesDir, `${profile.username}.json`);
      if (fs.existsSync(profilePath)) {
        console.log(`[${i + 1}/${profilesToScrape.length}] ⏭️  Skipping: ${profile.name} (already exists)`);
        continue;
      }

      console.log(`\n[${i + 1}/${profilesToScrape.length}] 📥 Scraping: ${profile.name}`);

      try {
        await scrapeProfileWithPage(page, profile.url);
        successCount++;
      } catch (error) {
        console.log(`❌ Error scraping ${profile.username}: ${error.message}`);
        errorCount++;
      }

      // Wait before next profile (except for last one)
      if (i < profilesToScrape.length - 1) {
        const randomExtra = getRandomDelay(0, 3000);
        const totalDelay = delay + randomExtra;
        console.log(`⏳ Waiting ${Math.round(totalDelay / 1000)}s before next profile...`);
        await page.waitForTimeout(totalDelay);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n\n✅ Batch scraping completed!`);
  console.log(`📊 Success: ${successCount} | Errors: ${errorCount}`);
  console.log(`📊 Total processed: ${profilesToScrape.length} profiles`);
}

// Step 4: Use saved authentication
async function automateWithSavedAuth(scrollDelay = 5000, outputFile = 'linkedin-connections.jsonl', maxDepth = null) {
  if (!fs.existsSync(AUTH_FILE)) {
    console.log('❌ No saved authentication found.');
    console.log('Please run: node linkedin-automation.js setup');
    return;
  }

  console.log('🚀 Starting automation with saved session...');
  console.log(`⏱️  Scroll delay: ${scrollDelay}ms`);
  console.log(`📁 Output file: ${outputFile}`);
  const configDir = process.env.CONFIG_DIR || require('path').join(__dirname, 'data');
  console.log(`📁 Using config directory: ${configDir}`);
  if (maxDepth) {
    console.log(`📏 Max scroll depth: ${maxDepth}`);
  }
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50 + getRandomDelay(0, 20)
  });

  const userAgent = new UserAgent({ deviceCategory: 'desktop' });
  const viewport = {
    width: 1920 + Math.floor(Math.random() * 100),
    height: 1080 + Math.floor(Math.random() * 100)
  };

  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: viewport,
    userAgent: userAgent.toString(),
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { longitude: -74.006, latitude: 40.7128 },
    permissions: ['geolocation']
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
    await page.waitForTimeout(getRandomDelay(3000, 6000));

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
      const randomExtra = getRandomDelay(0, 3000);
      const totalDelay = scrollDelay + randomExtra;
      console.log(`⏳ Waiting ${totalDelay}ms for new content to load...`);
      // Add randomness to scroll delay
      await page.waitForTimeout(totalDelay);
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
  const path = require('path');
  const configDir = process.env.CONFIG_DIR || path.join(__dirname, 'data');

  const args = {
    command: argv[2],
    scrollDelay: 5000,
    scrapeDelay: 10000,
    scrapeLimit: null,
    outputFile: path.join(configDir, 'linkedin-connections.jsonl'),
    maxDepth: null,
    linkedinProfile: null
  };

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--output' && argv[i + 1]) {
      // If filename contains path separator, use as-is; otherwise use configDir
      const filename = argv[i + 1];
      args.outputFile = filename.includes('/') ? filename : path.join(configDir, filename);
      i++;
    } else if (arg === '--depth' && argv[i + 1]) {
      args.maxDepth = parseInt(argv[i + 1], 10);
      i++;
    } else if (arg === '--limit' && argv[i + 1]) {
      args.scrapeLimit = parseInt(argv[i + 1], 10);
      i++;
    } else if (arg === '--linkedin_profile' && argv[i + 1]) {
      args.linkedinProfile = argv[i + 1];
      i++;
    } else if (arg === '--delay' && argv[i + 1]) {
      const delay = parseInt(argv[i + 1], 10);
      if (!isNaN(delay) && delay > 0) {
        args.scrapeDelay = delay;
      }
      i++;
    } else if (!arg.startsWith('--')) {
      // First non-flag argument is scroll delay or scrape delay depending on command
      const delay = parseInt(arg, 10);
      if (!isNaN(delay) && delay > 0) {
        if (args.command === 'scrape_profiles') {
          args.scrapeDelay = delay;
        } else {
          args.scrollDelay = delay;
        }
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
  } else if (args.command === 'profile') {
    if (!args.linkedinProfile) {
      console.log('❌ LinkedIn profile URL is required.');
      console.log('Usage: node linkedin-automation.js profile --linkedin_profile <URL>');
      return;
    }
    await getProfile(args.linkedinProfile);
  } else if (args.command === 'scrape_profiles') {
    await scrapeProfiles(args.scrapeDelay, args.scrapeLimit);
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
    console.log('  node linkedin-automation.js setup                                  - First time setup');
    console.log('  node linkedin-automation.js profile --linkedin_profile <URL>       - Extract single profile');
    console.log('  node linkedin-automation.js scrape_profiles [delay]                - Batch scrape all connections');
    console.log('  node linkedin-automation.js run [scrollDelay] [options]            - Collect connections\n');
    console.log('Profile Options:');
    console.log('  --linkedin_profile <URL>  LinkedIn profile URL to extract\n');
    console.log('Scrape Profiles Options:');
    console.log('  delay                     Time in milliseconds between profiles (default: 10000)');
    console.log('  --delay <ms>              Alternative way to set delay');
    console.log('  --limit <number>          Maximum number of profiles to scrape\n');
    console.log('Run Options:');
    console.log('  --output <filename>       Output file name (default: $CONFIG_DIR/linkedin-connections.jsonl)');
    console.log('  --depth <number>          Maximum number of scrolls (default: unlimited)\n');
    console.log('Parameters:');
    console.log('  scrollDelay - Time in milliseconds between scrolls (default: 5000)\n');
    console.log('Environment Variables:');
    console.log('  CONFIG_DIR - Root directory for data files (default: ./data)\n');
    console.log('Note: All files are saved in the CONFIG_DIR directory (or "data" by default)\n');
    console.log('Examples:');
    console.log('  1. Setup:           node linkedin-automation.js setup');
    console.log('  2. Get connections: node linkedin-automation.js run');
    console.log('  3. Single profile:  node linkedin-automation.js profile --linkedin_profile https://www.linkedin.com/in/edsandovaluk/');
    console.log('  4. Batch scrape:    node linkedin-automation.js scrape_profiles');
    console.log('  5. Custom delay:    node linkedin-automation.js scrape_profiles 15000');
    console.log('  6. Limit depth:     node linkedin-automation.js run --depth 5\n');
  }
}

main().catch(console.error);

