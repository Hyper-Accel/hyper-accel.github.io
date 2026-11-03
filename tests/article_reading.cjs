// Install Playwright outside the repo and set NODE_PATH to its node_modules.
// NODE_PATH=/path/to/node_modules node tests/article_reading.cjs [baseURL] [evidenceDir]
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const baseURL = process.argv[2] || 'http://localhost:1394/';
const evidenceDir = process.argv[3];
const routes = ['posts/how-gpu-works/', 'en/posts/how-gpu-works/', 'posts/what-is-hbf/'];

(async () => {
 const browser = await chromium.launch();
 const measurements = [];
 try {
  for (const route of routes) {
   const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
   const errors = [];
   page.on('pageerror', error => errors.push(error.message));
   await page.goto(new URL(route,baseURL).href,{waitUntil:'domcontentloaded'});
   await page.evaluate(() => document.fonts.ready);
   const content = page.locator('.post-content');
   assert.equal(await content.locator('p').first().evaluate(e=>getComputedStyle(e).fontSize),'16px','Article body uses reduced16px type');
   assert.equal(await page.locator('.post-title').evaluate(e=>getComputedStyle(e).fontSize),'36px','Desktop article title uses36px type');
   assert.equal(await content.locator('h2').first().evaluate(e=>getComputedStyle(e).fontSize),'28px','Desktop section headings use28px type');
   let rect = await content.boundingBox();
   assert.ok(rect.width <= 780, `${route}: reading column must be <=780px, got ${rect.width}`);
   assert.equal(await page.locator('.post-single > .entry-cover').count(),0,'No detail-page cover');
   assert.equal(await page.locator('.post-single > .toc').count(),0,'No inline TOC before intro');
   const firstParagraph = await content.locator('p').first().boundingBox();
   assert.ok(firstParagraph.y < 700, `${route}: intro must be in first viewport`);
   const toc = page.locator('.reading-toc');
   assert.equal(await toc.isVisible(),true);
   const tocRect = await toc.boundingBox();
   assert.ok(tocRect.x + tocRect.width + 24 <= rect.x,'TOC must sit to the left of article');
   const links = toc.locator('a[href^="#"]');
   const expectedHeadings = await content.locator('h2[id]').evaluateAll(els=>els.map(el=>el.id));
   const tocHeadings = await links.evaluateAll(els=>els.map(el=>decodeURIComponent(el.getAttribute('href').slice(1))));
   assert.deepEqual(tocHeadings,expectedHeadings,'TOC must contain only H2 major sections');
   assert.ok(await links.count() > 0);
   for (const href of await links.evaluateAll(els => els.map(e=>e.getAttribute('href')))) {
    assert.equal(await page.evaluate(href=>!!document.getElementById(decodeURIComponent(href.slice(1))),href),true,`Broken TOC anchor ${href}`);
   }
   const target = await links.nth(2).getAttribute('href');
   await links.nth(2).click();
   await page.waitForFunction(href => document.querySelector('.reading-toc a[aria-current="location"]')?.getAttribute('href')===href,target);
   const targetTop = await page.evaluate(href=>document.getElementById(decodeURIComponent(href.slice(1))).getBoundingClientRect().top,target);
   const headerHeight = await page.locator('.tr-header').evaluate(e=>e.getBoundingClientRect().height);
   assert.ok(targetTop >= headerHeight-2,'Anchor must not hide beneath sticky header');
   assert.ok((await toc.boundingBox()).y >= headerHeight,'Sticky rail must clear header');
   measurements.push({route,viewport:1440,articleWidth:rect.width,introTop:firstParagraph.y});

   // Manual scrolling, hash landing, and resizing must keep section state coherent.
   await content.locator('h2[id]').nth(1).evaluate(e=>e.scrollIntoView());
   await page.waitForFunction(() => {
    const target = document.querySelectorAll('.post-content h2[id]')[1];
    const active = document.querySelector('.reading-toc a[aria-current="location"]');
    return target && decodeURIComponent(active?.getAttribute('href') || '') === `#${target.id}`;
   });
   assert.ok(await toc.locator('a[aria-current="location"]').count()===1);
   // A reload may restore the reader's scroll position rather than the URL hash.
   // Check a fresh deep-link navigation separately from that browser behavior.
   const deepLink = await page.evaluate(()=>location.href);
   await page.goto('about:blank');
   await page.goto(deepLink,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(href=>decodeURIComponent(document.querySelector('.reading-toc a[aria-current="location"]')?.getAttribute('href') || '')===decodeURIComponent(href),await page.evaluate(()=>location.hash));

   for (const width of [1440,1280,1100,1099,768,375]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>scrollTo(0,0));
    await page.waitForFunction(expected => innerWidth === expected && scrollY === 0, width);
    rect = await content.boundingBox();
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow <= 1, `${route} @${width}: horizontal overflow ${overflow}`);
    assert.ok(rect.width <= 780);
    const button = page.locator('.reading-toc-handle');
    if (width < 1100) {
     assert.equal(await button.isVisible(),true);
     assert.equal(await button.getAttribute('aria-expanded'),'false');
     assert.equal(await toc.isVisible(),false);
     const toggleRect = await button.boundingBox();
     assert.ok(toggleRect.x <= 1, 'TOC handle must sit at the left edge');
     const handleCenter = toggleRect.y + toggleRect.height / 2;
     assert.ok(Math.abs(handleCenter - 450) <= 2, `TOC handle must be vertically centered, got ${handleCenter}`);
     assert.ok(toggleRect.height > toggleRect.width, 'TOC handle must be a slim vertical button');
     assert.ok((await content.locator('p').first().boundingBox()).y < 820, `${route} @${width}: intro pushed below first screen`);
     await button.click();
     assert.equal(await toc.evaluate(el=>el.contains(document.activeElement)),true,'Opening TOC must focus an entry');
     assert.equal(await toc.isVisible(),true);
     assert.equal(await button.getAttribute('aria-expanded'),'true');
     const narrowRect = await toc.boundingBox();
     assert.ok(narrowRect.x>=0 && narrowRect.x+narrowRect.width<=width+1);
     await page.keyboard.press('Escape');
     assert.equal(await toc.isVisible(),false);
     assert.equal(await button.evaluate(e=>document.activeElement===e),true);
     await button.click();
     await toc.locator('a[href^="#"]').first().click();
     assert.equal(await toc.isVisible(),false);
     assert.equal(await button.getAttribute('aria-expanded'),'false');
     await page.evaluate(()=>scrollTo(0,0));
    } else {
     assert.equal(await button.isVisible(),false);
     assert.equal(await toc.isVisible(),true);
    }
    if(evidenceDir && [1440,768,375].includes(width)) {
     fs.mkdirSync(evidenceDir,{recursive:true});
     await page.screenshot({path:`${evidenceDir}/${route.replaceAll('/','-')}${width}.png`});
    }
   }
   assert.deepEqual(errors,[],`${route}: browser errors`);
   await page.emulateMedia({media:'print'});
   assert.equal(await toc.isVisible(),false);
   assert.equal(await page.locator('.reading-toc-handle').isVisible(),false);
   await page.close();
  }
  for (const viewport of [{width:375,height:900},{width:568,height:320},{width:768,height:320}]) {
   const page = await browser.newPage({viewport,reducedMotion:'reduce'});
   await page.goto(new URL(routes[0],baseURL).href,{waitUntil:'domcontentloaded'});
   const toggle = page.locator('.reading-toc-handle');
   const toc = page.locator('.reading-toc');
   await toggle.focus();
   await page.keyboard.press('Enter');
   assert.equal(await toc.isVisible(),true);
   assert.equal(await toc.evaluate(el=>el.contains(document.activeElement)),true,'Keyboard open must enter TOC');
   await page.keyboard.press('Tab');
   assert.equal(await toc.evaluate(el=>el.contains(document.activeElement)),true,'Forward Tab must remain in TOC entries');
   const panelRect = await toc.boundingBox();
   assert.ok(panelRect.y >= 0 && panelRect.y + panelRect.height <= viewport.height + 1, `${viewport.width}x${viewport.height}: panel must stay inside viewport, bottom=${panelRect.y + panelRect.height}`);
   const dimensions = await page.locator('.reading-toc-links').evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight}));
   assert.ok(dimensions.height >= 44, `${viewport.width}x${viewport.height}: links need usable scroll area, got ${dimensions.height}px`);
   await page.locator('.reading-toc-links').evaluate(el=>{el.scrollTop=el.scrollHeight});
   const last = await toc.locator('a').last().boundingBox();
   const rail = await page.locator('.reading-toc-links').boundingBox();
   assert.ok(last.y >= rail.y-1 && last.y+last.height <= rail.y+rail.height+1,'Last TOC item must be reachable by scrolling');
   if(evidenceDir) await page.screenshot({path:`${evidenceDir}/toc-open-${viewport.width}x${viewport.height}.png`});
   await page.keyboard.press('Escape');
   assert.equal(await toggle.evaluate(el=>document.activeElement===el),true);
   await page.close();
  }
  console.log('PASS: keyboard Enter/Tab/Escape and usable scroll area at375x900,568x320,768x320');
  const noJS = await browser.newPage({javaScriptEnabled:false,viewport:{width:1440,height:900}});
  await noJS.goto(new URL(routes[0],baseURL).href,{waitUntil:'domcontentloaded'});
  assert.ok((await noJS.locator('.post-content').boundingBox()).width<=780);
  assert.equal(await noJS.locator('.post-single > .entry-cover').count(),0);
  assert.equal(await noJS.locator('.reading-toc').isVisible(),true);
  assert.ok(await noJS.locator('.reading-toc a[href^="#"]').count()>0);
  await noJS.close();
  console.log('PASS: three KO/EN articles; 6 widths; TOC anchors/current state, keyboard, responsive, print and no-JS desktop');
  console.log(JSON.stringify(measurements,null,2));
  if(evidenceDir) fs.writeFileSync(`${evidenceDir}/measurements.json`,JSON.stringify(measurements,null,2));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
