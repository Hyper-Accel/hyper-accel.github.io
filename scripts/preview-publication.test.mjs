import { afterEach, test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPreview } from './preview-publication.mjs';

const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function fixture() {
  const outer = mkdtempSync(join(realpathSync(tmpdir()), 'publication-preview-test-'));
  cleanup.push(() => rmSync(outer, { recursive: true, force: true }));
  const root = join(outer, 'source');
  mkdirSync(join(root, 'layouts/_default'), { recursive: true });
  writeFileSync(join(root, 'hugo.yaml'), 'baseURL: https://example.invalid/\ntitle: Test\n');
  writeFileSync(join(root, 'layouts/_default/single.html'), '{{ .Date.Format "2006-01-02T15:04:05Z07:00" }}|{{ .Content }}');
  writeFileSync(join(root, 'layouts/index.html'), '{{ range site.RegularPages }}<a href="{{ .RelPermalink }}">{{ .Title }}</a>{{ end }}');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: root, env, stdio: 'pipe' });
  execFileSync('git', ['add', '.'], { cwd: root, env });
  execFileSync('git', ['commit', '-m', 'Base'], { cwd: root, env, stdio: 'pipe' });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  mkdirSync(join(root, 'content/posts/example'), { recursive: true });
  const post = join(root, 'content/posts/example/index.md');
  writeFileSync(post, "---\ntitle: Example\ndate: '2026-10-19T10:00:00+09:00'\n---\nFirst body\n");
  return { outer, root, post, initialState: { version: 1, source_commit: revision, posts: {} } };
}

test('deployment preview stamps new posts, serves only output and preserves dates across restart', async () => {
  const f = fixture();
  const before = readFileSync(f.post, 'utf8');
  const workDir = join(f.outer, 'cache');
  let now = '2026-10-21T11:00:00+09:00';
  const options = { root: f.root, workDir, initialState: f.initialState, port: 0, watch: false,
    hugo: process.env.HUGO || 'hugo', now: () => now };
  const preview = await startPreview(options);
  cleanup.push(() => preview.stop());
  const html = await (await fetch(preview.url + 'posts/example/')).text();
  assert.ok(html.includes(now));
  assert.ok(html.includes('__publication_preview_version'));
  assert.equal(readFileSync(f.post, 'utf8'), before);
  for (const path of ['.git/config', 'site/content/posts/example/index.md', 'build-report.json']) {
    assert.equal((await fetch(preview.url + path)).status, 404);
  }
  const initial = await (await fetch(preview.url + 'publication-state.json')).json();
  assert.equal(initial.posts.example.date, now);
  now = '2026-10-22T12:00:00+09:00';
  writeFileSync(f.post, before + '\nHotfix\n');
  assert.equal(await preview.rebuild(), true);
  const hotfix = await (await fetch(preview.url + 'posts/example/')).text();
  assert.ok(hotfix.includes('Hotfix'));
  assert.ok(hotfix.includes('2026-10-21T11:00:00+09:00'));
  await preview.stop();
  const restarted = await startPreview({ ...options, initialState: undefined });
  cleanup.push(() => restarted.stop());
  const state = await (await fetch(restarted.url + 'publication-state.json')).json();
  assert.deepEqual(state.posts, initial.posts);
});

test('watch rebuilds changed source and advances the browser reload version', async () => {
  const f = fixture();
  const preview = await startPreview({ root: f.root, workDir: join(f.outer, 'cache'), initialState: f.initialState,
    port: 0, now: () => '2026-10-21T11:00:00+09:00' });
  cleanup.push(() => preview.stop());
  const version = await (await fetch(preview.url + '__publication_preview_version')).json();
  writeFileSync(f.post, readFileSync(f.post, 'utf8') + '\nWatched change\n');
  const deadline = Date.now() + 10_000;
  let next = version;
  while (next === version && Date.now() < deadline) {
    await Bun.sleep(50);
    next = await (await fetch(preview.url + '__publication_preview_version')).json();
  }
  assert.ok(next > version, 'watch must trigger a successful production rebuild');
  assert.ok((await (await fetch(preview.url + 'posts/example/')).text()).includes('Watched change'));
}, 15_000);

test('failed rebuild keeps the previous page and state, then recovers', async () => {
  const f = fixture();
  const errors = [];
  const preview = await startPreview({ root: f.root, workDir: join(f.outer, 'cache'), initialState: f.initialState,
    port: 0, watch: false, now: () => '2026-10-21T11:00:00+09:00', onError: error => errors.push(error.message) });
  cleanup.push(() => preview.stop());
  const state = readFileSync(preview.statePath);
  const original = readFileSync(f.post);
  writeFileSync(f.post, 'Invalid front matter');
  assert.equal(await preview.rebuild(), false);
  assert.deepEqual(readFileSync(preview.statePath), state);
  assert.ok((await (await fetch(preview.url + 'posts/example/')).text()).includes('First body'));
  assert.equal(errors.length, 1);
  writeFileSync(f.post, original);
  assert.equal(await preview.rebuild(), true);
});

test('cache refuses source overlap and concurrent servers without changing source', async () => {
  const f = fixture();
  const options = { root: f.root, workDir: join(f.outer, 'cache'), initialState: f.initialState,
    port: 0, watch: false, now: () => '2026-10-21T11:00:00+09:00' };
  await assert.rejects(startPreview({ ...options, workDir: join(f.root, 'cache') }), /outside source/);
  const preview = await startPreview(options);
  cleanup.push(() => preview.stop());
  await assert.rejects(startPreview(options), /EEXIST/);
  assert.ok((await fetch(preview.url)).ok);
});

test('a stale next-state symlink cannot overwrite an authoring file', async () => {
  const f = fixture();
  const workDir = join(f.outer, 'cache');
  mkdirSync(workDir);
  const marker = join(f.root, 'authoring-marker.txt');
  writeFileSync(marker, 'ORIGINAL SOURCE');
  symlinkSync(marker, join(workDir, 'next-state.json'));
  const preview = await startPreview({ root: f.root, workDir, initialState: f.initialState,
    port: 0, watch: false, now: () => '2026-10-21T11:00:00+09:00' });
  cleanup.push(() => preview.stop());
  assert.equal(readFileSync(marker, 'utf8'), 'ORIGINAL SOURCE');
  assert.ok(!lstatSync(preview.statePath).isSymbolicLink());
  assert.ok(lstatSync(join(workDir, 'next-state.json')).isSymbolicLink());
  assert.equal((await (await fetch(preview.url + 'publication-state.json')).json()).posts.example.date,
    '2026-10-21T11:00:00+09:00');
});

test('metadata-only source events do not trigger rebuilds or browser reloads', async () => {
  const f = fixture();
  const preview = await startPreview({ root: f.root, workDir: join(f.outer, 'cache'), initialState: f.initialState,
    port: 0, now: () => '2026-10-21T11:00:00+09:00' });
  cleanup.push(() => preview.stop());
  const version = await (await fetch(preview.url + '__publication_preview_version')).json();
  chmodSync(f.post, 0o600);
  await Bun.sleep(1200);
  assert.equal(await (await fetch(preview.url + '__publication_preview_version')).json(), version);
}, 10_000);
