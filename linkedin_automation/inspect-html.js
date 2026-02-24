const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-extra');

async function inspectLocal() {
    const filePath = path.resolve('debug-profile.html');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const content = fs.readFileSync(filePath, 'utf8');
    await page.setContent(content);

    const result = await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('section'));
        const experienceSection = sections.find(s => s.innerText.includes('Experience') && s.innerText.includes('Senior Machine Learning Engineer'));

        if (!experienceSection) return 'Experience Section not found';

        // Find the text node
        const walker = document.createTreeWalker(experienceSection, NodeFilter.SHOW_TEXT, null, false);
        let targetNode;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('Senior Machine Learning Engineer')) {
                targetNode = node;
                break;
            }
        }

        if (!targetNode) return 'Text node not found';

        // Trace path with attributes
        const path = [];
        let current = targetNode.parentElement;
        while (current && current !== experienceSection.parentElement) {
            path.push({
                tag: current.tagName,
                class: current.className,
                attributes: Array.from(current.attributes).map(a => `${a.name}="${a.value}"`),
                dataViewName: current.getAttribute('data-view-name')
            });
            current = current.parentElement;
        }

        return path;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
}

inspectLocal();
