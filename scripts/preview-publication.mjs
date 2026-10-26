#!/usr/bin/env bun
// Local deployment semantics; authoring files and production state stay read-only.
import { watch as watchFiles, closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseDocument } from 'yaml';
import { bootstrapState, git, livePrevious, nowKst, productionBuild, validateState } from './build-publication.mjs';

function within(path, parent) {
  const rel = relative(parent, path);
  return !rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}
function safeCache(root, path) {
  // Inspect before normalization, including alias/../ traversal.
  let prefix = sep;
  const absolute = isAbsolute(path) ? path : `${process.cwd()}${sep}${path}`;
  for (const part of absolute.split(sep).filter(Boolean)) {
    prefix += (prefix.endsWith(sep) ? '' : sep) + part;
    if (lstatSync(prefix, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Preview cache cannot use symlinks');
  }
  const cache = resolve(path);
  if (within(cache, root) || within(root, cache)) throw new Error('Preview cache must be outside source');
  return cache;
}

export async function startPreview({ root, workDir, initialState, loadInitialState, port = 1313,
  hugo = 'hugo', now = nowKst, watch = true, onError = error => console.error(`Preview build failed: ${error.message}`) }) {
  root = realpathSync(root);
  workDir = safeCache(root, workDir);
  mkdirSync(workDir, { recursive: true });
  const ownerPath = join(workDir, 'owner.json');
  const statePath = join(workDir, 'publication-state.json');
  for (const path of [ownerPath, statePath]) {
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Preview state cannot use symlinks');
  }
  if (existsSync(ownerPath) && JSON.parse(readFileSync(ownerPath, 'utf8')).root !== root) {
    throw new Error('Preview cache belongs to another source repository');
  }
  const lockPath = join(workDir, 'preview.lock');
  const lock = openSync(lockPath, 'wx');
  writeFileSync(lock, String(process.pid));
  let server, watcher, timer, stopped = false, previous, current, serial = 0;
  let queue = Promise.resolve();
  const generations = [];
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    watcher?.close();
    await queue;
    await server?.stop(true);
    for (const path of generations) rmSync(path, { recursive: true, force: true });
    closeSync(lock);
    rmSync(lockPath, { force: true });
  };
  try {
    previous = existsSync(statePath) ? validateState(JSON.parse(readFileSync(statePath, 'utf8')))
      : validateState(initialState ?? await loadInitialState());
    writeFileSync(ownerPath, JSON.stringify({ root }) + '\n');
    server = Bun.serve({ hostname: '127.0.0.1', port, async fetch(request) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      const pathname = new URL(request.url).pathname;
      if (pathname === '/__publication_preview_version') return Response.json(serial, { headers: { 'Cache-Control': 'no-store' } });
      if (!current) return new Response('Building preview', { status: 503 });
      try {
        let path = resolve(current, '.' + decodeURIComponent(pathname));
        if (!within(path, current)) return new Response('Forbidden', { status: 403 });
        if (lstatSync(path).isDirectory()) path = join(path, 'index.html');
        if (!lstatSync(path).isFile()) return new Response('Not found', { status: 404 });
        const file = Bun.file(path);
        const headers = { 'Content-Type': file.type, 'Cache-Control': 'no-store' };
        if (request.method === 'HEAD') return new Response(null, { headers });
        if (path.endsWith('.html')) {
          const reload = `<script>(()=>{let v=${serial};setInterval(async()=>{try{const n=await(await fetch('/__publication_preview_version',{cache:'no-store'})).json();if(n!==v)location.reload()}catch{}},1000)})()</script>`;
          return new Response(await file.text() + reload, { headers });
        }
        return new Response(file, { headers });
      } catch { return new Response('Not found', { status: 404 }); }
    } });
    const rebuild = () => {
      const task = queue.then(() => {
        if (stopped) return false;
        const generation = mkdtempSync(join(workDir, 'build-'));
        try {
          const output = join(generation, 'output');
          const state = productionBuild(root, output, previous, { now: now(), hugo, baseUrl: String(server.url), stdio: 'pipe' });
          const temporary = join(generation, 'next-state.json');
          writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
          renameSync(temporary, statePath);
          previous = state;
          current = join(output, 'public');
          serial++;
          generations.push(generation);
          while (generations.length > 2) rmSync(generations.shift(), { recursive: true, force: true });
          return true;
        } catch (error) {
          rmSync(generation, { recursive: true, force: true });
          onError(error);
          return false;
        }
      });
      queue = task;
      return task;
    };
    if (!await rebuild()) throw new Error('Initial preview build failed; publication state was not advanced');
    const stamps = new Map();
    const stamp = path => {
      const info = lstatSync(join(root, path), { throwIfNoEntry: false });
      return info ? `${info.mtimeMs}:${info.size}:${info.ino}` : 'missing';
    };
    const remember = path => {
      if (!existsSync(join(root, path))) return;
      stamps.set(path, stamp(path));
      if (lstatSync(join(root, path)).isDirectory()) {
        for (const name of readdirSync(join(root, path))) {
          if (!['.git', '.DS_Store', '__pycache__'].includes(name)) remember(`${path}/${name}`);
        }
      }
    };
    if (watch) {
      for (const path of ['hugo.yaml', 'assets', 'content', 'layouts', 'i18n', 'static', 'themes']) remember(path);
      watcher = watchFiles(root, { recursive: true }, (_event, filename) => {
        const path = String(filename ?? '').split(sep).join('/');
        if (!(path === 'hugo.yaml' || /^(assets|content|layouts|i18n|static|themes)\//.test(path))) return;
        if (path.split('/').some(part => ['.git', '.DS_Store', '__pycache__'].includes(part))) return;
        // Native copy/read metadata events must not cause a self-triggered build loop.
        const next = stamp(path);
        if (stamps.get(path) === next) return;
        stamps.set(path, next);
        clearTimeout(timer);
        timer = setTimeout(() => { void rebuild(); }, 250);
      });
    }
    return { url: String(server.url), statePath, rebuild, stop };
  } catch (error) { await stop(); throw error; }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: Object.fromEntries(
    ['root', 'work-dir', 'port', 'hugo', 'previous-state', 'bootstrap-ref', 'site-url', 'repository'].map(key => [key, { type: 'string' }]),
  ) });
  const root = realpathSync(resolve(values.root ?? join(dirname(fileURLToPath(import.meta.url)), '..')));
  const port = Number(values.port ?? 1313);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid preview port');
  if (values['previous-state'] && values['bootstrap-ref']) throw new Error('Choose --previous-state or --bootstrap-ref');
  const hugo = values.hugo ?? 'hugo';
  const workDir = values['work-dir'] ?? join(homedir(), '.cache', 'hyperaccel-blog-preview', createHash('sha256').update(root).digest('hex').slice(0, 16));
  const preview = await startPreview({ root, workDir, port, hugo, loadInitialState: async () => {
    if (values['previous-state']) return validateState(JSON.parse(readFileSync(values['previous-state'], 'utf8')));
    if (values['bootstrap-ref']) return bootstrapState(root, values['bootstrap-ref'], nowKst(), { hugo });
    const config = parseDocument(readFileSync(join(root, 'hugo.yaml'), 'utf8')).toJS();
    const remote = git(root, 'remote', 'get-url', 'origin');
    const match = /github\.com[:/]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
    if (!values.repository && !match) throw new Error('Specify --repository owner/repo');
    return livePrevious(root, values['site-url'] ?? config.baseURL, values.repository ?? match[1], nowKst(), { hugo });
  } });
  console.log(`Deployment preview: ${preview.url}\nLocal state: ${preview.statePath}\nWatching source; successful rebuilds reload the browser. Ctrl+C stops the server.`);
  const shutdown = () => { void preview.stop().then(() => process.exit(0)); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
