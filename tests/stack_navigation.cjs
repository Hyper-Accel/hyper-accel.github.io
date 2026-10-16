// Browser regression checks for the full-stack menu.
// Install Playwright outside the repo, then:
// NODE_PATH=/path/to/node_modules node tests/stack_navigation.cjs [baseURL]
// Set CHROME_PATH to use an installed Chrome instead of a Playwright-managed browser.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const baseURL = process.argv[2] || 'http://localhost:1394/';

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const area = page.locator('.tr-stack-area');
    const drawer = page.locator('.tr-drawer');
    const layers = page.locator('.tr-layer');
    const isOpen = () => drawer.evaluate((el) => el.classList.contains('is-open'));
    assert.equal(await layers.count(), 5);
    assert.equal(await page.locator('.tr-panel').count(), 0, 'the side preview box is gone');

    for (let i = 0; i < 5; i++) {
      await area.hover({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(600);
      await layers.nth(i).locator('.tr-hit').hover();
      const slug = await layers.nth(i).getAttribute('data-layer');
      await page.waitForFunction((s) => document.querySelector('.tr-layer.on')?.dataset.layer === s, slug);
      assert.equal(await layers.nth(i).locator('.tr-layer-label').isVisible(), true);
      assert.equal(await isOpen(), false, 'hovering alone must not unfold posts');
      await page.mouse.move(0, 0);
      await page.waitForTimeout(350);
      assert.equal(await page.locator('.tr-layer.on').count(), 0);
    }
    console.log('PASS: hover highlights each layer and its label without unfolding');

    const url = page.url();
    await area.hover({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(600);
    const first = layers.nth(1);
    const firstSlug = await first.getAttribute('data-layer');
    await first.locator('.tr-hit').click();
    await page.waitForTimeout(600);
    assert.equal(page.url(), url, 'clicking a layer must not navigate');
    assert.equal(await isOpen(), true);
    assert.equal(await page.locator(`[data-drawer="${firstSlug}"]`).isVisible(), true);
    const cards = await page.locator(`[data-drawer="${firstSlug}"] .tr-card`).count();
    assert.ok(cards >= 1, 'the layer shows its posts');
    const rows = await page.locator(`[data-drawer="${firstSlug}"] .tr-card`).evaluateAll((els) => new Set(els.map((e) => e.offsetTop)).size);
    assert.equal(rows, 1, 'cards sit in a single row');
    assert.equal(await first.getAttribute('aria-expanded'), 'true');
    console.log(`PASS: clicking ${firstSlug} unfolds ${cards} posts in one row without navigating`);

    await area.hover({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(600);
    const second = layers.nth(3);
    const secondSlug = await second.getAttribute('data-layer');
    await second.locator('.tr-hit').click();
    await page.waitForTimeout(80);
    assert.equal(await isOpen(), false, 'switching folds the open box first');
    await page.waitForTimeout(1000);
    assert.equal(await isOpen(), true, 'then unfolds it again');
    assert.equal(await page.locator(`[data-drawer="${secondSlug}"]`).isVisible(), true);
    assert.equal(await page.locator(`[data-drawer="${firstSlug}"]`).isVisible(), false);
    await area.hover({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(600);
    await second.locator('.tr-hit').click();
    await page.waitForTimeout(600);
    assert.equal(await isOpen(), false, 'clicking the open layer again collapses it');
    console.log('PASS: another layer folds and reopens the box with new content; the same layer collapses it');

    await area.hover({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(600);
    await layers.nth(2).locator('.tr-hit').click();
    await page.waitForTimeout(600);
    await page.locator('.tr-drawer-panel:not([hidden]) .tr-drawer-close').click();
    await page.waitForTimeout(600);
    assert.equal(await isOpen(), false);
    assert.equal(await layers.nth(2).evaluate((el) => el === document.activeElement), true, 'focus returns to the layer');
    console.log('PASS: the close button collapses and returns focus to its layer');

    await layers.nth(0).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    assert.equal(await isOpen(), true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    assert.equal(await isOpen(), false);
    await page.locator('.tr-search input').focus();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.tr-layer.on').count(), 0);
    console.log('PASS: Enter unfolds, Escape collapses, and leaving by keyboard resets the stack');

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await phone.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const phoneUrl = phone.url();
    await phone.locator('.tr-layer').nth(4).locator('.tr-hit').tap();
    await phone.waitForTimeout(800);
    assert.equal(phone.url(), phoneUrl);
    assert.equal(await phone.locator('.tr-drawer').evaluate((el) => el.classList.contains('is-open')), true);
    const phoneRows = await phone.locator('.tr-drawer-panel:not([hidden]) .tr-card').evaluateAll((els) => new Set(els.map((e) => e.offsetTop)).size);
    assert.equal(phoneRows, 1, 'phones keep a single scrollable row');
    console.log('PASS: a tap unfolds the layer on phones as a single row');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
