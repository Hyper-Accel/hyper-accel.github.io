import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const repo = resolve(import.meta.dir, '..');
const hugo = process.env.HUGO || 'hugo';
async function fixture(state = {version:1, source_commit:'a'.repeat(40), posts:{old:{date:'2025-01-01T10:00:00+09:00',dates:{ko:'2025-01-01T10:00:00+09:00',en:'2025-02-02T11:00:00+09:00'}}}}) {
  assert.match(execFileSync(hugo,['version'],{encoding:'utf8'}), /v0\.152\.2/);
  const root=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'native-preview-'));
  for(const dir of ['config','native-preview']) if(existsSync(join(repo,dir))) cpSync(join(repo,dir),join(root,dir),{recursive:true});
  let responseState=state;
  const remote=Bun.serve({port:0,fetch(request){ const path=new URL(request.url).pathname;
    if(path==='/publication-state.json') return responseState===null ? new Response('',{status:404}) : Response.json(responseState);
    if(['/old/','/how-gpu-works/','/tpu-deep-dive/','/crafting-compilers-ch1-1/'].some(s=>path.endsWith(s))) return new Response('<meta property="article:published_time" content="2024-03-04T05:06:07+09:00">');
    return new Response('',{status:404}); }});
  writeFileSync(join(root,'hugo.yaml'),`baseURL: https://example.invalid/\ndefaultContentLanguage: ko\nlanguages:\n  ko:\n    weight: 1\n  en:\n    weight: 2\nparams:\n  previewPublicationURL: ${remote.url}\noutputs:\n  home: [HTML, RSS, JSON]\n`);
  mkdirSync(join(root,'layouts/_default'),{recursive:true});
  writeFileSync(join(root,'layouts/_default/single.html'),'{{ .Date.Format "2006-01-02T15:04:05Z07:00" }}|{{ .Content }}|{{ .Params.authors }}|{{ range .Translations }}{{ .RelPermalink }}{{ end }}|{{ range .Resources }}{{ .RelPermalink }}{{ end }}');
  writeFileSync(join(root,'layouts/index.html'),'{{ range site.RegularPages.ByDate.Reverse }}{{ .Title }}={{ .Date.Format "2006-01-02T15:04:05Z07:00" }};{{ end }}');
  writeFileSync(join(root,'layouts/_default/list.html'),'{{ range .Pages }}{{ .Title }}{{ end }}');
  writeFileSync(join(root,'layouts/index.json'),'{{ range site.RegularPages }}{{ .Date.Format "2006-01-02T15:04:05Z07:00" }};{{ end }}');
  function post(slug,lang='',extra='') { const dir=join(root,'content/posts',slug);mkdirSync(dir,{recursive:true}); const file=join(dir,`index${lang}.md`);writeFileSync(file,`---\ntitle: ${slug}\ndate: '2000-01-01T00:00:00+09:00'\nauthors: [Someone]\n${extra}---\nBody before\n\n---\n\nBody after\n`);return file; }
  post('old');post('old','.en');post('new');
  let proc,logs='';
  async function start(){const reservation=Bun.serve({port:0,fetch:()=>new Response('')});const port=reservation.port;await reservation.stop(true);proc=spawn(hugo,['server','--port',String(port),'--bind','127.0.0.1'],{cwd:root,env:process.env});proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);
    for(let i=0;i<150;i++){const m=/Web Server is available at (http:\/\/[^\s]+)/.exec(logs);if(m)return m[1];if(proc.exitCode!==null)throw Error(logs);await Bun.sleep(100);}throw Error(logs); }
  async function stop(){if(proc&&proc.exitCode===null){proc.kill();await new Promise(r=>proc.once('exit',r));}logs='';}
  return {root,post,start,stop,setState:s=>responseState=s,close:async()=>{await stop();await remote.stop(true);rmSync(root,{recursive:true,force:true});}};
}
test('first rollout preserves live old dates while only new404 articles get local timestamps',async()=>{const f=await fixture(null);try{const url=await f.start();const old=await(await fetch(url+'posts/old/')).text();const fresh=await(await fetch(url+'posts/new/')).text();assert.ok(old.startsWith('2024-03-04T05:06:07&#43;09:00'));assert.ok(!fresh.startsWith('2000-'));assert.ok(!fresh.startsWith('2024-'));assert.ok(readFileSync(join(f.root,'content/posts/old/index.md'),'utf8').includes('2000-01-01'));assert.ok(!existsSync(join(f.root,'public/publication-state.json')));}finally{await f.close();}},30000);

test('invalid managed entry cannot fall back to a local date',async()=>{const f=await fixture({version:1,source_commit:'a'.repeat(40),posts:{old:{dates:{}}}});try{await assert.rejects(f.start(),/Invalid deployed publication/);}finally{await f.close();}},30000);

test('native adapter accepts existing array-valued summaries',async()=>{const f=await fixture();try{f.post('old','','summary: [first, second]\n');const url=await f.start();assert.equal((await fetch(url+'posts/old/')).status,200);}finally{await f.close();}},30000);

test('legacy HTML dates use lowercase canonical URLs even for mixed-case physical bundles',async()=>{const f=await fixture(null);try{f.post('how-GPU-works');f.post('TPU-deep-dive');f.post('crafting-compilers-Ch1-1');const url=await f.start();for(const slug of ['old','how-gpu-works','tpu-deep-dive','crafting-compilers-ch1-1']){const html=await(await fetch(url+'posts/'+slug+'/')).text();assert.ok(html.includes('2024-03-04T05:06:07&#43;09:00'),html);}}finally{await f.close();}},30000);

test('native new dates persist restart, hot reload preserves old dates and RSS/search ordering',async()=>{const f=await fixture();try{let url=await f.start();const first=await(await fetch(url+'posts/new/')).text();assert.ok(!first.includes('2000-01-01'));const stamp=first.split('|')[0];assert.ok((await(await fetch(url)).text()).startsWith('new='));assert.ok((await(await fetch(url+'index.json')).text()).includes('2025-01-01'));assert.ok((await(await fetch(url+'index.xml')).text()).includes('Wed, 01 Jan 2025'));const file=join(f.root,'content/posts/old/index.md');writeFileSync(file,readFileSync(file,'utf8').replace('Body after','HOT RELOAD'));let changed='';for(let i=0;i<50;i++){changed=await(await fetch(url+'posts/old/')).text();if(changed.includes('HOT RELOAD'))break;await Bun.sleep(100);}assert.ok(changed.includes('HOT RELOAD'),changed);assert.ok(changed.includes('2025-01-01'));await f.stop();await Bun.sleep(1100);url=await f.start();assert.equal((await(await fetch(url+'posts/new/')).text()).split('|')[0],stamp);assert.ok(!existsSync(join(f.root,'public/publication-state.json')));}finally{await f.close();}},30000);

test('malformed managed state fails closed',async()=>{const f=await fixture({version:99,posts:{}});try{await assert.rejects(f.start(),/Invalid deployed publication state/);}finally{await f.close();}},30000);

test('native resources keep nested paths and binary bytes',async()=>{const f=await fixture();try{mkdirSync(join(f.root,'content/posts/old/nested'),{recursive:true});const bytes=Buffer.from([0,255,1,128,32,42]);writeFileSync(join(f.root,'content/posts/old/nested/file.bin'),bytes);const url=await f.start();const response=await fetch(url+'posts/old/nested/file.bin');assert.equal(response.status,200,await(await fetch(url+'posts/old/')).text());assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);}finally{await f.close();}},30000);

test('native server gives real bilingual Page.Date from deployed state, not edited authored dates',async()=>{const f=await fixture();try{const url=await f.start(); const ko=await(await fetch(url+'posts/old/')).text();assert.ok(ko.includes('2025-01-01T10:00:00&#43;09:00'));const en=await(await fetch(url+'en/posts/old/')).text();assert.ok(en.includes('2025-02-02T11:00:00&#43;09:00'),en);assert.ok(ko.includes('Body after'));assert.ok(ko.includes('Someone'));assert.ok(ko.includes('/en/posts/old/'));}finally{await f.close();}},30000);

test('nested params and their override precedence match ordinary Hugo',async()=>{
  const f=await fixture();
  try {
    f.post('old','','fallback: top-level-default\nparams:\n  sentinel: nested-value\n  authors: [Nested Author]\n');
    writeFileSync(join(f.root,'layouts/_default/single.html'),'sentinel={{ .Params.sentinel }}|authors={{ .Params.authors }}|fallback={{ .Params.fallback }}|wrapped={{ isset .Params "params" }}');
    let url=await f.start();
    const adapted=await(await fetch(url+'posts/old/')).text();
    await f.stop();
    rmSync(join(f.root,'config'),{recursive:true});
    url=await f.start();
    const ordinary=await(await fetch(url+'posts/old/')).text();
    assert.equal(ordinary,'sentinel=nested-value|authors=[Nested Author]|fallback=top-level-default|wrapped=false');
    assert.equal(adapted,ordinary);
  } finally { await f.close(); }
},30000);
