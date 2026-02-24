const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const UserAgent = require('user-agents');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = 'linkedin-auth.json';

// Helper for random delays
function getRandomDelay(min = 2000, max = 5000) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

async function debugProfile(profileUrl) {
    if (!fs.existsSync(AUTH_FILE)) {
        console.log('❌ No saved authentication found.');
        return;
    }

    console.log(`🔍 Debugging profile: ${profileUrl}\n`);

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
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(getRandomDelay(3000, 6000));

        // Scroll to load content
        console.log('📜 Scrolling...');
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await page.waitForTimeout(2000);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(2000);

        // Analyze sections
        const debugData = await page.evaluate(() => {
            const sections = Array.from(document.querySelectorAll('section'));
            return sections.map((s, index) => {
                const heading = s.querySelector('h2, .pvs-header__title');
                const headingText = heading ? heading.textContent.trim() : 'No Heading';
                const id = s.id || 'No ID';
                const classNames = s.className;
                const htmlSnippet = s.outerHTML.substring(0, 500); // First 500 chars

                // If it looks like Experience, grab more detail
                let itemsCount = 0;
                let itemsHtml = '';
                if (headingText.toLowerCase().includes('experience')) {
                    const items = s.querySelectorAll('ul > li');
                    itemsCount = items.length;
                    if (items.length > 0) {
                        itemsHtml = items[0].outerHTML.substring(0, 500); // Sample item
                    }
                }

                return {
                    index,
                    id,
                    classNames,
                    headingText,
                    htmlSnippet,
                    isExperience: headingText.toLowerCase().includes('experience'),
                    itemsCount,
                    sampleItemHtml: itemsHtml
                };
            });
        });

        console.log('📊 Section Analysis:');
        debugData.forEach(s => {
            if (s.isExperience) {
                console.log(`\n🎯 FOUND EXPERIENCE SECTION (Index ${s.index}):`);
                console.log(`   ID: ${s.id}`);
                console.log(`   Classes: ${s.classNames}`);
                console.log(`   Items Found: ${s.itemsCount}`);
                console.log(`   Sample Item HTML: ${s.sampleItemHtml}\n`);
            } else {
                console.log(`- Section ${s.index}: ${s.headingText} (ID: ${s.id})`);
            }
        });

        // Save full HTML for offline inspection if needed
        const html = await page.content();
        fs.writeFileSync('debug-profile.html', html);
        console.log('\n💾 Saved full page HTML to debug-profile.html');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await browser.close();
    }
}

const profileUrl = process.argv[2];
if (!profileUrl) {
    console.log('Usage: node debug-profile.js <profile_url>');
} else {
    debugProfile(profileUrl);
}
