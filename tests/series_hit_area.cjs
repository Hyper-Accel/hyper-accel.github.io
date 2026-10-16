// Install Playwright outside the repo and set NODE_PATH to its node_modules.
// NODE_PATH=/path/to/node_modules node tests/series_hit_area.cjs [baseURL]
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const baseURL = process.argv[2] || 'http://localhost:1394/';

(async () => {
  const browser = await chromium.launch();
  try {
    for (const route of ['', 'en/']) {
      for (const width of [1440, 375]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.goto(new URL(route, baseURL).href);
        const results = await page.locator('.tr-feat').evaluateAll(cards => cards.map(card => {
          const title = card.querySelector('h3 a');
          const footer = card.querySelector('.tr-feat-links');
          const hit = (x, y) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href');
          card.scrollIntoView({ block: 'center' });
          const bounds = card.getBoundingClientRect();
          const footerBounds = footer.getBoundingClientRect();
          const linksPreserved = selector => [...card.querySelectorAll(selector)].every(link => {
            const rect = link.getBoundingClientRect();
            return hit(rect.x + rect.width / 2, rect.y + rect.height / 2) === link.getAttribute('href');
          });
          return {
            href: title.getAttribute('href'),
            top: hit(bounds.x + 8, bounds.y + 8),
            aboveFooter: hit(bounds.right - 8, footerBounds.top - 8),
            episodes: linksPreserved('.tr-dots a'),
            footer: linksPreserved('.tr-feat-links a'),
            insideViewport: bounds.x >= 0 && bounds.right <= innerWidth,
          };
        }));
        assert.ok(results.length > 3, `every series is listed, got ${results.length}`);
        for (const card of results) {
          assert.equal(card.top, card.href, 'Card top should link to the series');
          assert.equal(card.aboveFooter, card.href, 'Upper area above footer should link to the series');
          assert.ok(card.episodes, 'Episode links retain their destinations');
          assert.ok(card.footer, 'Footer links retain their destinations');
          assert.ok(card.insideViewport, 'Series cards stay inside the viewport');
        }
        console.log(`PASS: ${route || 'ko'} @${width}: expanded series area and independent episode/footer links`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
