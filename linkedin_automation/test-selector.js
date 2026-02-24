const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const fs = require('fs');
const path = require('path');

const AUTH_FILE = 'linkedin-auth.json';

async function debugContext() {
    const filePath = path.resolve('debug-profile.html');
    // Reuse the saved HTML to avoid hitting LinkedIn again extensively
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const content = fs.readFileSync(filePath, 'utf8');
    await page.setContent(content);

    const result = await page.evaluate(() => {
        // 1. Find Experience Section
        const allSections = Array.from(document.querySelectorAll('section'));
        const experienceSection = allSections.find(section => {
            // Check heading
            const heading = section.querySelector('h2');
            if (heading && heading.textContent.trim().toLowerCase().includes('experience')) return true;

            // Check component key
            const key = section.getAttribute('componentkey');
            if (key && key.includes('ExperienceTopLevelSection')) return true;

            return false;
        });

        if (!experienceSection) return { error: 'Experience section not found' };

        // 2. Try to find items using componentkey
        const items = Array.from(experienceSection.querySelectorAll('[componentkey*="entity-collection-item"]'));

        // 3. Extract data from items to see if it works
        const extractedItems = items.map(item => {
            const text = item.innerText.split('\n').filter(t => t.trim()).slice(0, 3);
            return {
                key: item.getAttribute('componentkey'),
                preview: text
            };
        });

        return {
            sectionFound: true,
            itemsFound: items.length,
            items: extractedItems
        };
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
}

debugContext();
