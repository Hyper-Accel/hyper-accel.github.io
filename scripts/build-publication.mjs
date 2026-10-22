#!/usr/bin/env node
// Publication dates belong to the deployment output, never authoring sources.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isAlias, isMap, isScalar, parseDocument, visit } from 'yaml';

const POST_NAMES = new Map([['index.md', 'ko'], ['index.ko.md', 'ko'], ['index.en.md', 'en']]);
const SOURCE_PATHS = ['hugo.yaml', 'assets', 'content', 'layouts', 'i18n', 'static', 'themes/PaperMod'];
export const STATE_NAME = 'publication-state.json';

export function timestamp(value) {
  if (typeof value !== 'string') throw new Error('Date must be an ISO 8601 string');
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Date requires an explicit timezone: ${value}`);
  const result = `${match[1]}T${match[2]}${match[3]}`;
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds)) throw new Error(`Invalid date: ${value}`);
  const offset = match[3] === 'Z' ? 0 : (match[3][0] === '-' ? -1 : 1)
    * (Number(match[3].slice(1, 3)) * 60 + Number(match[3].slice(4)));
  if (new Date(milliseconds + offset * 60_000).toISOString().slice(0, 19) !== result.slice(0, 19)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return result;
}

export function nowKst() {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 19) + '+09:00';
}

export function parseFront(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('Expected YAML front matter');
  const document = parseDocument(match[1], { keepSourceTokens: true, uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('\n'));
  if (!isMap(document.contents) || document.contents.flow) throw new Error('Front matter must be a block YAML mapping');
  visit(document, (_key, node) => {
    if (isAlias(node) || node?.anchor) throw new Error('Front matter anchors and aliases are not supported');
  });
  const fields = Object.create(null);
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || pair.key.value === '<<') {
      throw new Error('Front matter requires explicit string keys');
    }
    const key = pair.key.value.toLowerCase();
    if (Object.hasOwn(fields, key)) throw new Error(`Duplicate front matter key: ${key}`);
    fields[key] = pair.value?.toJSON();
  }
  return { document, fields, front: match[1], start: text.startsWith('---\r\n') ? 5 : 4 };
}

export function setDate(text, value) {
  return setFrontTimestamp(text, 'date', value);
}

function setFrontTimestamp(text, field, value) {
  const { document, front, start } = parseFront(text);
  const date = timestamp(value);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const literal = `'${date}'`;
  const existing = document.contents.items.find(pair => pair.key.value.toLowerCase() === field.toLowerCase())?.value;
  let changed;
  if (existing) {
    if (!isScalar(existing) || !existing.range) throw new Error('Expected a scalar date');
    const [from, to] = existing.range;
    const suffix = front.slice(from, to).endsWith('\n') ? newline : '';
    changed = front.slice(0, from) + literal + suffix + front.slice(to);
  } else changed = front + newline + `${field}: ${literal}`;
  const result = text.slice(0, start) + changed + text.slice(start + front.length);
  if (parseFront(result).fields[field.toLowerCase()] !== date) throw new Error(`Failed to safely replace ${field}`);
  return result;
}

export function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
}

function collect(root) {
  const groups = new Map();
  const directory = join(root, 'content/posts');
  if (!existsSync(directory)) return groups;
  for (const bundle of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!bundle.isDirectory()) continue;
    validSlug(bundle.name);
    const posts = [];
    for (const name of [...POST_NAMES.keys()].sort()) {
      const path = join(directory, bundle.name, name);
      if (!existsSync(path)) continue;
      const language = POST_NAMES.get(name);
      if (posts.some(post => post.language === language)) throw new Error(`Duplicate language in bundle: ${bundle.name}`);
      const fields = parseFront(readFileSync(path, 'utf8')).fields;
      for (const key of ['publishdate', 'expirydate']) if (fields[key]) timestamp(fields[key]);
      posts.push({ path, language, fields });
    }
    if (posts.length) groups.set(bundle.name, posts);
  }
  return groups;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validSlug(key) {
  if (typeof key !== 'string' || !key || ['.', '..', '__proto__', 'constructor', 'prototype'].includes(key)
    || /[/\\\x00-\x1f]/.test(key)) throw new Error('Invalid publication-state post key');
}

export function validateState(state, expectedCommit) {
  if (!object(state) || state.version !== 1) throw new Error('Invalid publication-state version');
  if (typeof state.source_commit !== 'string' || !/^[0-9a-f]{40}$/.test(state.source_commit)) {
    throw new Error('Invalid publication-state revision');
  }
  if (expectedCommit !== undefined && state.source_commit !== expectedCommit) {
    throw new Error('Publication state is not from the active Pages deployment revision');
  }
  if (!object(state.posts)) throw new Error('Invalid publication-state posts');
  for (const [key, entry] of Object.entries(state.posts)) {
    validSlug(key);
    if (!object(entry) || !object(entry.dates)) throw new Error('Invalid publication-state post dates');
    timestamp(entry.date);
    for (const [language, date] of Object.entries(entry.dates)) {
      if (!['ko', 'en'].includes(language)) throw new Error('Invalid publication-state language');
      timestamp(date);
    }
  }
  return state;
}

function exportRevision(root, revision, target, paths) {
  const entries = git(root, 'ls-tree', '-r', '-z', revision, ...(paths ? ['--', ...paths] : []))
    .split('\0').filter(Boolean).map(entry => {
      const [metadata, path] = entry.split('\t');
      const [mode, , oid] = metadata.split(' ');
      if (!['100644', '100755', '160000'].includes(mode)) throw new Error('Unsafe bootstrap source mode');
      return { mode, oid, path };
    });
  mkdirSync(target, { recursive: true });
  const index = join(target, `.publication-index-${randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    execFileSync('git', ['-C', root, 'read-tree', revision], { env });
    execFileSync('git', ['-C', root, 'checkout-index', '--stdin', '-z', `--prefix=${target}${sep}`], {
      env, input: entries.filter(entry => entry.mode !== '160000').map(entry => entry.path + '\0').join(''),
    });
  } finally { rmSync(index, { force: true }); }
  for (const entry of entries.filter(entry => entry.mode === '160000')) {
    if (entry.path !== 'themes/PaperMod') throw new Error('Unsupported bootstrap submodule');
    exportRevision(join(root, entry.path), entry.oid, join(target, entry.path));
  }
}

export function bootstrapState(root, revision, value, { hugo = process.env.HUGO || 'hugo' } = {}) {
  const now = timestamp(value);
  revision = git(root, 'rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`);
  const state = { version: 1, source_commit: revision, posts: {} };
  const work = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'publication-bootstrap-'));
  try {
    const site = join(work, 'site');
    exportRevision(root, revision, site, SOURCE_PATHS);
    const visible = hugoVisible(site, work, now, hugo);
    for (const [slug, posts] of collect(site)) {
      for (const post of posts) {
        if (!visible.has(relative(site, post.path).split(sep).join('/'))) continue;
        const date = timestamp(post.fields.date);
        const entry = state.posts[slug] ??= { date, dates: {} };
        entry.dates[post.language] = date;
      }
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  for (const entry of Object.values(state.posts)) entry.date = entry.dates.ko ?? entry.date;
  return validateState(state);
}

function renamedBundles(root, revision) {
  const isPost = path => path.split('/').length === 4 && POST_NAMES.has(path.split('/')[3]);
  const origins = new Map(git(root, 'ls-tree', '-r', '--name-only', revision, '--', 'content/posts')
    .split('\n').filter(isPost).map(path => [path, path.split('/')[2]]));
  // Follow one ancestry chain, diffing merges against the parent on that chain.
  // Endpoint similarity loses a rename followed by a separate substantial rewrite.
  const edges = [];
  let child = git(root, 'rev-parse', 'HEAD');
  while (child !== revision) {
    const parents = git(root, 'rev-list', '--parents', '-n', '1', child).split(' ').slice(1);
    const parent = parents.find(candidate => spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', revision, candidate]).status === 0);
    if (!parent) throw new Error('Cannot establish publication rename ancestry');
    edges.push([parent, child]);
    child = parent;
  }
  for (const [parent, commit] of edges.reverse()) {
    const tokens = git(root, 'diff', '--name-status', '-z', '--find-renames=50%', parent, commit, '--', 'content/posts').split('\0');
    const before = new Map(origins);
    const moves = [];
    let deleted = false;
    let added = false;
    for (let index = 0; index < tokens.length && tokens[index];) {
      const status = tokens[index];
      const path = tokens[index + 1];
      if (status.startsWith('R')) {
        const next = tokens[index + 2];
        if (isPost(path) && isPost(next)) {
          origins.delete(path);
          moves.push([next, before.get(path)]);
        } else if (isPost(path) || isPost(next)) throw new Error('Ambiguous post rename boundary');
      } else if (isPost(path)) {
        if (status === 'D') { deleted = true; origins.delete(path); }
        if (status === 'A') { added = true; origins.delete(path); }
      }
      index += /^[RC]/.test(status) ? 3 : 2;
    }
    if (deleted && added) throw new Error('Ambiguous deleted/new post paths; separate the rename from the rewrite');
    for (const [next, origin] of moves) if (origin !== undefined) origins.set(next, origin);
  }
  const mapping = new Map();
  const destinations = new Map();
  for (const [path, origin] of origins) {
    const next = path.split('/')[2];
    if ((mapping.has(next) && mapping.get(next) !== origin)
      || (destinations.has(origin) && destinations.get(origin) !== next)) throw new Error('Ambiguous split or merged post rename');
    mapping.set(next, origin);
    destinations.set(origin, next);
  }
  return new Map([...mapping].filter(([next, old]) => next !== old));
}

export function plan(root, previous, value, visible) {
  const now = timestamp(value);
  validateState(previous);
  const ancestry = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', previous.source_commit, 'HEAD']);
  if (ancestry.error) throw ancestry.error;
  if (ancestry.status !== 0) throw new Error('Previous deployment is not an ancestor; refusing stale/rollback state');
  const state = structuredClone(previous);
  const overrides = {};
  const groups = collect(root);
  const renames = renamedBundles(root, previous.source_commit);
  const priorPaths = git(root, 'ls-tree', '-r', '--name-only', previous.source_commit, '--', 'content/posts').split('\n');
  const priorBundles = new Set(priorPaths.filter(path => POST_NAMES.has(path.split('/').at(-1))).map(path => path.split('/').at(-2)));
  for (const [next, old] of renames) {
    validSlug(next);
    if (next === old) continue;
    if (priorBundles.has(next) && ![...renames.values()].includes(next)) throw new Error('Ambiguous post rename destination');
    if (Object.hasOwn(previous.posts, old)) state.posts[next] = structuredClone(previous.posts[old]);
  }
  for (const old of renames.values()) if (!renames.has(old)) delete state.posts[old];
  const renamed = new Set(renames.values());
  const disappeared = Object.keys(previous.posts).some(key => priorBundles.has(key) && !groups.has(key) && !renamed.has(key));
  if (disappeared && [...groups.keys()].some(key => !Object.hasOwn(state.posts, key))) {
    throw new Error('Ambiguous deleted/new post paths; separate the rename from the rewrite');
  }
  if (visible === undefined) {
    const work = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'publication-plan-'));
    try {
      const site = join(work, 'site');
      copySite(root, site);
      visible = hugoVisible(site, work, now, process.env.HUGO || 'hugo');
    } finally { rmSync(work, { recursive: true, force: true }); }
  }
  for (const [key, posts] of groups) {
    const published = posts.filter(post => visible.has(relative(root, post.path).split(sep).join('/')));
    if (!published.length) continue;
    const entry = state.posts[key] ??= { date: now, dates: {} };
    for (const post of published) {
      const date = entry.dates[post.language] ??= entry.date;
      overrides[relative(root, post.path).split(sep).join('/')] = date;
    }
  }
  state.source_commit = git(root, 'rev-parse', 'HEAD');
  return { state, overrides };
}

function api(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
}

export function activeDeployment(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository name');
  for (const deployment of api(`repos/${repository}/deployments?environment=github-pages&per_page=100`)) {
    const statuses = api(`repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`);
    if (statuses[0]?.state === 'success') return deployment.sha;
  }
  throw new Error('No active successful Pages deployment; explicit initial bootstrap is required');
}

export async function fetchState(siteUrl, expectedCommit, { attempts = 3, retryDelayMs = 2000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const url = `${siteUrl.replace(/\/$/, '')}/${STATE_NAME}?revision=${randomUUID()}`;
      const response = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }, signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404 && attempt === attempts - 1) return null;
        throw new Error(`HTTP ${response.status} reading publication state`);
      }
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2_000_000) {
            await reader.cancel();
            throw new Error('Publication state exceeds size limit');
          }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      return validateState(JSON.parse(Buffer.concat(chunks).toString('utf8')), expectedCommit);
    } catch (error) { lastError = error; }
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  }
  throw lastError ?? new Error('Publication state lookup did not run');
}

export async function livePrevious(root, siteUrl, repository, now, dependencies = {}) {
  if (!siteUrl.startsWith('https://')) throw new Error('Production state must use HTTPS');
  const revision = (dependencies.activeDeployment ?? activeDeployment)(repository);
  git(root, 'rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`);
  const state = await (dependencies.fetchState ?? fetchState)(siteUrl, revision);
  if (state !== null) return state;
  // Recognize both implementations so a language migration cannot reset dates.
  for (const marker of ['scripts/build-publication.mjs', 'scripts/build_publication.py']) {
    if (spawnSync('git', ['-C', root, 'cat-file', '-e', `${revision}:${marker}`]).status === 0) {
      throw new Error('Missing publication state from a managed deployment; refusing to reset dates');
    }
  }
  console.log(`Initial migration from previously deployed source ${revision}`);
  return bootstrapState(root, revision, now, { hugo: dependencies.hugo });
}

function assertRawNoSymlinks(path) {
  const absolute = isAbsolute(path) ? path : `${process.cwd()}${sep}${path}`;
  let prefix = sep;
  for (const part of absolute.split(sep).filter(Boolean)) {
    prefix += (prefix.endsWith(sep) ? '' : sep) + part;
    if (lstatSync(prefix, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`Symlinked path: ${prefix}`);
  }
}

function assertTreeNoSymlinks(path) {
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error(`Symlinked source tree: ${path}`);
  if (info.isDirectory()) for (const name of readdirSync(path)) assertTreeNoSymlinks(join(path, name));
}

function within(path, parent) {
  const rel = relative(parent, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function copySite(root, site) {
  mkdirSync(site, { recursive: true });
  for (const relativePath of SOURCE_PATHS) {
    const source = join(root, relativePath);
    assertRawNoSymlinks(source);
    assertTreeNoSymlinks(source);
    if (!existsSync(source)) continue;
    const target = join(site, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      recursive: true, filter: path => !['.git', '.DS_Store', '__pycache__'].includes(basename(path)),
    });
  }
}

function hugoVisible(site, work, now, hugo, baseUrl) {
  // A single scratch-only JSON page asks Hugo for the actual page objects.
  // GetPage includes unlisted pages; checking emitted HTML excludes render: never.
  const name = `publication-visibility-${randomUUID()}`;
  const content = join(site, 'content', `${name}.md`);
  const layout = join(site, 'layouts/_default', `${name}.json`);
  const output = join(work, 'visibility');
  const references = [...collect(site).keys()].map(slug => JSON.stringify(`/posts/${slug}`)).join(' ');
  mkdirSync(dirname(content), { recursive: true });
  mkdirSync(dirname(layout), { recursive: true });
  writeFileSync(content, `---\ntitle: Visibility probe\nlayout: ${name}\nurl: /${name}/\noutputs: [JSON]\ndraft: false\nbuild:\n  render: always\n  list: never\n---\n`);
  writeFileSync(layout, `{{- $rows := slice -}}{{- range .Site.Sites -}}{{- $site := . -}}{{- range slice ${references} -}}{{- with $site.GetPage . -}}{{- $page := . -}}{{- with .OutputFormats.Get "html" -}}{{- $rows = $rows | append (dict "source" $page.File.Filename "url" .Permalink "base" $site.BaseURL "publishDate" ($page.PublishDate.Format "2006-01-02T15:04:05Z07:00")) -}}{{- end -}}{{- end -}}{{- end -}}{{- end -}}{{ dict "pages" $rows | jsonify }}`);
  const command = ['--source', site, '--destination', output, '--cacheDir', join(work, 'cache'),
    '--environment', 'production', '--clock', now];
  if (baseUrl) command.push('--baseURL', baseUrl.replace(/\/$/, '') + '/');
  try {
    const result = spawnSync(hugo, command, { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Hugo visibility failed: ${result.stderr || result.stdout}`);
    const report = JSON.parse(readFileSync(join(output, name, 'index.json'), 'utf8'));
    if (!Array.isArray(report.pages)) throw new Error('Cannot establish Hugo publication visibility');
    const visible = new Map();
    for (const row of report.pages) {
      const url = new URL(row.url);
      const base = new URL(row.base);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('Invalid Hugo publication URL');
      const path = decodeURIComponent(url.pathname.slice(base.pathname.length));
      const target = resolve(output, path + (url.pathname.endsWith('/') ? 'index.html' : ''));
      if (!within(target, output) || !within(row.source, site)) throw new Error('Unsafe Hugo visibility path');
      if (existsSync(target) && lstatSync(target).isFile()) {
        visible.set(relative(site, row.source).split(sep).join('/'), {
          publishDate: row.publishDate.startsWith('0001-01-01T00:00:00') ? now : timestamp(row.publishDate),
          outputPath: relative(output, target),
        });
      }
    }
    return visible;
  } finally {
    rmSync(content, { force: true });
    rmSync(layout, { force: true });
  }
}

export function productionBuild(root, requestedWork, previous, { now = nowKst(), hugo = 'hugo', baseUrl, stdio = 'inherit' } = {}) {
  root = realpathSync(root);
  assertRawNoSymlinks(requestedWork);
  const work = resolve(requestedWork);
  if (within(work, root) || within(root, work)) throw new Error('Build workspace must be outside the source repository');
  if (existsSync(work)) throw new Error('Build workspace already exists; use a fresh directory');
  for (const relativePath of SOURCE_PATHS) {
    const source = join(root, relativePath);
    assertRawNoSymlinks(source);
    assertTreeNoSymlinks(source);
  }
  now = timestamp(now);
  validateState(previous);
  const site = join(work, 'site');
  copySite(root, site);
  const visible = hugoVisible(site, work, now, hugo, baseUrl);
  const { state, overrides } = plan(root, previous, now, visible);
  for (const [relativePath, date] of Object.entries(overrides)) {
    const path = join(site, relativePath);
    // A legacy future display date must not schedule an already-visible translation.
    // Ordinary dates keep Hugo's implicit publishDate fallback to the stamped date.
    let text = readFileSync(path, 'utf8');
    if (Date.parse(date) > Date.parse(now)) {
      text = setFrontTimestamp(text, 'publishDate', visible.get(relativePath).publishDate);
    }
    writeFileSync(path, setDate(text, date));
  }
  const command = ['--source', site, '--destination', join(work, 'public'), '--cacheDir', join(work, 'cache'),
    '--environment', 'production', '--minify', '--clock', now];
  if (baseUrl) command.push('--baseURL', baseUrl.replace(/\/$/, '') + '/');
  const result = spawnSync(hugo, command, { stdio, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Hugo failed (${result.status ?? result.signal}): ${result.stderr ?? ''}`);
  for (const relativePath of Object.keys(overrides)) {
    const target = join(work, 'public', visible.get(relativePath).outputPath);
    if (!lstatSync(target, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Final Hugo output missing for ${relativePath}; refusing publication state`);
    }
  }
  writeFileSync(join(work, 'public', STATE_NAME), JSON.stringify(state, null, 2) + '\n');
  const report = {
    source_commit: state.source_commit, build_time: now,
    new_posts: Object.keys(state.posts).filter(key => !Object.hasOwn(previous.posts, key)).sort(),
    source_dates_written: 0, output: join(work, 'public'),
  };
  writeFileSync(join(work, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  return state;
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: Object.fromEntries(
    ['root', 'work-dir', 'previous-state', 'bootstrap-ref', 'site-url', 'repository', 'base-url', 'now', 'hugo', 'expected-commit']
      .map(name => [name, { type: 'string' }]),
  ) });
  const [command] = positionals;
  if (positionals.length !== 1 || !['build', 'verify'].includes(command)) throw new Error('Usage: build-publication.mjs build|verify [options]');
  if (command === 'verify') {
    if (!values['site-url'] || !values['expected-commit']) throw new Error('verify requires --site-url and --expected-commit');
    if (await fetchState(values['site-url'], values['expected-commit'], { attempts: 6 }) === null) throw new Error('Deployed publication state is missing');
    console.log('Live publication state matches deployed source revision');
    return;
  }
  if (!values['work-dir']) throw new Error('build requires --work-dir outside the source repository');
  if (['previous-state', 'bootstrap-ref', 'site-url'].filter(name => values[name]).length !== 1) {
    throw new Error('Choose exactly one: --previous-state, --bootstrap-ref, --site-url');
  }
  const root = resolve(values.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const now = timestamp(values.now ?? nowKst());
  let previous;
  if (values['previous-state']) previous = validateState(JSON.parse(readFileSync(values['previous-state'], 'utf8')));
  else if (values['bootstrap-ref']) previous = bootstrapState(root, values['bootstrap-ref'], now, { hugo: values.hugo });
  else {
    if (!values.repository) throw new Error('--site-url requires --repository');
    previous = await livePrevious(root, values['site-url'], values.repository, now, { hugo: values.hugo });
  }
  productionBuild(root, values['work-dir'], previous, { now, hugo: values.hugo, baseUrl: values['base-url'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
