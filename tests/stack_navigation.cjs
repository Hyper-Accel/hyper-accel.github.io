// Browser regression checks for the full-stack menu.
// Install Playwright outside the repo, then:
// NODE_PATH=/path/to/node_modules node tests/stack_navigation.cjs [baseURL]
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const baseURL = process.argv[2] || 'http://localhost:1394/';

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const area = page.locator('.tr-stack-area');
    const defaultPanel = page.locator('.tr-panel[data-panel=""]');
    const layers = page.locator('.tr-layer');
    assert.equal(await layers.count(), 5);
    for (let i = 0; i < 5; i++) {
      // Open first and let the plates settle before targeting a hit band.
      await area.hover({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(650);
      await layers.nth(i).locator('.tr-hit').hover();
      const slug = await layers.nth(i).getAttribute('data-layer');
      await page.waitForFunction(slug => document.querySelector('.tr-layer.on')?.dataset.layer === slug, slug);
      assert.equal(await page.locator(`.tr-panel[data-panel="${slug}"]`).isVisible(), true);
      // Moving from the diagram into its preview must preserve the selection.
      await page.locator(`.tr-panel[data-panel="${slug}"]`).hover();
      assert.equal(await page.locator('.tr-layer.on').getAttribute('data-layer'), slug);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(350);
      assert.equal(await defaultPanel.isVisible(), true, `L${5-i}: leaving must restore FULL-STACK AI`);
      assert.equal(await page.locator('.tr-layer.on').count(), 0);
      assert.equal(await area.evaluate(el => el.classList.contains('open')), false);
    }
    console.log('PASS: all five layers reset after exit; preview remains usable');

    await layers.first().locator('.tr-hit').hover();
    const selected = await layers.first().getAttribute('data-layer');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(80);
    // Re-enter the panel, not a layer, so the test cannot reselect it.
    await page.locator(`.tr-panel[data-panel="${selected}"]`).hover();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.tr-layer.on').getAttribute('data-layer'), selected);
    console.log('PASS: brief exit and re-entry cancel the pending reset');

    await layers.last().focus();
    await page.locator('.tr-search input').focus();
    await page.waitForTimeout(350);
    assert.equal(await defaultPanel.isVisible(), true);
    assert.equal(await page.locator('.tr-layer.on').count(), 0);
    console.log('PASS: keyboard focus leaving the menu resets the panel');

  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
