// NODE_PATH=/path/to/node_modules node tests/theme_switch.cjs [baseURL] [screenshotsDir]
const assert=require('node:assert/strict');const {chromium}=require('playwright');const fs=require('node:fs');
const base=process.argv[2]||'http://localhost:1394/';const out=process.argv[3];
(async()=>{
 const browser=await chromium.launch();
 const reports=[];
 try{
  for(const route of ['','posts/how-gpu-works/','en/posts/how-gpu-works/','search/','categories/ai-hardware/']){
   const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(new URL(route,base).href,{waitUntil:'domcontentloaded'});
   const toggle=page.locator('#theme-toggle');assert.equal(await toggle.count(),1,'Top theme toggle must exist');assert.equal(await toggle.isVisible(),true);
   assert.equal(await toggle.evaluate(e=>!!e.closest('.tr-header .tr-tools')),true);
   assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
   await toggle.click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
   assert.equal(await page.evaluate(()=>localStorage.getItem('pref-theme')),'light');
   const label=await toggle.getAttribute('aria-label');assert.ok(/다크|dark/i.test(label),'Label describes switching to dark');
   const colors=await page.evaluate(()=>{
    const rgb=color=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)};
    const lum=color=>{const v=rgb(color).map(x=>x/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return v[0]*0.2126+v[1]*0.7152+v[2]*0.0722};
    const body=getComputedStyle(document.body);const bg=body.backgroundColor;
    const nodes=[...document.querySelectorAll('.tr-headline,.tr-brand,.tr-sub,.post-content p,.post-meta')].filter(e=>e.getBoundingClientRect().width>0).slice(0,8);
    return {bg,trBg:body.getPropertyValue('--tr-bg').trim(),samples:nodes.map(e=>{const color=getComputedStyle(e).color;const a=lum(color),b=lum(bg);return {selector:e.className||e.tagName,color,contrast:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)}})};
   });
   assert.equal(colors.trBg,'#f6f8fb');for(const sample of colors.samples) assert.ok(sample.contrast>=4.5,`Light text contrast ${sample.selector}: ${sample.contrast}`);
   reports.push({route,colors});
   await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
   for(const width of [1440,768,375,320]){
    await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo(0,0));
    // The existing home stack has baseline overflow at320px; this change gates
    // all header controls at320px and whole-page overflow at375px and above.
    if(width>=375) assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,`${route}@${width}: page overflow`);
    for(const selector of ['#theme-toggle','.tr-search-link','.tr-pill-careers','.tr-tools a:last-child']){
     const r=await page.locator(selector).boundingBox();assert.ok(r&&r.x>=0&&r.x+r.width<=width+1,`${selector}@${width}: header control clipped`);
    }
    for(const theme of ['light','dark']){
     if(await page.locator('html').getAttribute('data-theme')!==theme)await toggle.click();
     await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
     if(out && [1440,768,375].includes(width)&&['','posts/how-gpu-works/','search/'].includes(route)){
      fs.mkdirSync(out,{recursive:true});await page.screenshot({path:`${out}/${route.replaceAll('/','-')||'home'}-${width}-${theme}.png`});
     }
    }
    await toggle.click(); // Restore light after light/dark capture roundtrip.
   }
   await toggle.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
   await page.keyboard.press('Space');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
   await page.goto(new URL(route.startsWith('en/')?'en/':'posts/',base).href,{waitUntil:'domcontentloaded'});assert.equal(await page.locator('html').getAttribute('data-theme'),'light','Theme persists across navigation');
   assert.deepEqual(errors,[],`${route}: JavaScript errors`);await context.close();
  }
  const saved=await browser.newContext({viewport:{width:1440,height:900}});const page=await saved.newPage();
  await page.addInitScript(()=>{localStorage.setItem('pref-theme','light');window.__firstBodyTheme=null;requestAnimationFrame(function capture(){if(document.body)window.__firstBodyTheme=document.documentElement.dataset.theme;else requestAnimationFrame(capture)})});
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__firstBodyTheme!==null);assert.equal(await page.evaluate(()=>window.__firstBodyTheme),'light','Saved light applies before first body frame');await saved.close();
  console.log('PASS:5 routes;4 widths; top button, actual light palette/contrast, dark/light roundtrip, keyboard, persistence, first paint, header preservation');
  console.log(JSON.stringify(reports,null,2));if(out)fs.writeFileSync(`${out}/theme-measurements.json`,JSON.stringify(reports,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
