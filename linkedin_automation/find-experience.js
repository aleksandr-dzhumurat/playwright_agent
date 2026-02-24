const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-extra');

async function findExperienceContent() {
    const filePath = path.resolve('debug-profile.html');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const content = fs.readFileSync(filePath, 'utf8');
    await page.setContent(content);

    const result = await page.evaluate(() => {
        // text to look for from the About section which might be unique enough or Experience
        // "NLP Researcher" was in the About section according to the cat output earlier?
        // Wait, the cat output showed "NLP Researcher" in the "About" section as well?
        // "about": "- 5+ years in Data Science... NLP Researcher..."
        // Let's look for "Scientific Researches" which was in the about section too.
        // The user said experience is empty.
        // Let's look for "Experience" heading again and trace its siblings/children better.

        // Better approach: Find all elements with text "Experience" and see which one looks like a section header
        const candidates = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('Experience')) {
                candidates.push(node.parentElement);
            }
        }

        return candidates.map(c => {
            let parent = c;
            const path = [];
            for (let i = 0; i < 5; i++) {
                if (!parent) break;
                path.push({
                    tag: parent.tagName,
                    class: parent.className,
                    id: parent.id,
                    hasList: !!parent.querySelector('ul'),
                    textVars: parent.innerText ? parent.innerText.substring(0, 50) : ''
                });
                parent = parent.parentElement;
            }
            return path;
        });
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
}

findExperienceContent();
