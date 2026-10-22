import { afterEach, test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as publication from './build-publication.mjs';
import { parseDocument } from 'yaml';

const temporary = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const outer = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'publication-js-'));
  temporary.push(outer);
  const root = join(outer, 'source');
  mkdirSync(root);
  const env = {
    ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  };
  const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=main');
  writeFileSync(join(root, 'hugo.yaml'), 'baseURL: https://example.invalid/\ntitle: Test\ndefaultContentLanguage: ko\nlanguages:\n  ko:\n    weight: 1\n  en:\n    weight: 2\n');
  mkdirSync(join(root, 'layouts/_default'), { recursive: true });
  writeFileSync(join(root, 'layouts/_default/single.html'), '{{ .Title }}|{{ .Date.Format "2006-01-02T15:04:05Z07:00" }}|{{ .Content }}');
  writeFileSync(join(root, 'layouts/_default/list.html'), '{{ range .Pages }}{{ .Title }} {{ end }}');
  git('add', '.');
  git('commit', '-m', 'Baseline');
  function post(slug, language = '', date, extra = '') {
    const directory = join(root, 'content/posts', slug);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, `index${language}.md`);
    writeFileSync(path, `---\ntitle: Test\n${date ? `date: '${date}'\n` : ''}${extra}---\n\n## Body\n`);
    return path;
  }
  function baseline() {
    post('old-post', '', '2026-01-01T10:00:00+09:00');
    post('old-post', '.en', '2026-01-02T10:00:00+09:00');
    git('add', '.');
    git('commit', '-m', 'Previously deployed post');
    return publication.bootstrapState(root, 'HEAD', '2026-10-21T11:00:00+09:00');
  }
  return { outer, root, git, post, baseline };
}

test('new bilingual post needs no date or ID and leaves source unchanged', () => {
  const { root, git, post } = fixture();
  const previous = { version: 1, source_commit: git('rev-parse', 'HEAD'), posts: {} };
  const paths = [post('new-post'), post('new-post', '.en')];
  const before = paths.map(path => readFileSync(path));
  const { state, overrides } = publication.plan(root, previous, '2026-10-21T11:00:00+09:00');
  assert.deepEqual(state.posts['new-post'].dates, {
    ko: '2026-10-21T11:00:00+09:00', en: '2026-10-21T11:00:00+09:00',
  });
  assert.equal(Object.keys(overrides).length, 2);
  assert.deepEqual(paths.map(path => readFileSync(path)), before);
});

test('bootstrap reads the previously deployed commit, not newly authored posts', () => {
  const { root, post, baseline } = fixture();
  const previous = baseline();
  post('new-post');
  const { state } = publication.plan(root, previous, '2026-10-21T11:00:00+09:00');
  assert.equal(state.posts['old-post'].dates.ko, '2026-01-01T10:00:00+09:00');
  assert.equal(state.posts['old-post'].dates.en, '2026-01-02T10:00:00+09:00');
  assert.equal(state.posts['new-post'].date, '2026-10-21T11:00:00+09:00');
});

test('bootstrap preserves the displayed future date when publishDate made the post public', () => {
  const { root, git, post } = fixture();
  post('published', '', '2027-01-01T00:00:00+09:00', "publishDate: '2026-01-01T00:00:00+09:00'\n");
  git('add', '.'); git('commit', '-m', 'Already public');
  const state = publication.bootstrapState(root, 'HEAD', '2026-10-21T11:00:00+09:00');
  assert.equal(state.posts.published?.dates.ko, '2027-01-01T00:00:00+09:00');
});

test('hotfix, redeploy and later translation keep the first publication timestamp', () => {
  const { root, post, baseline } = fixture();
  const previous = baseline();
  const ko = post('new-post');
  const { state: first } = publication.plan(root, previous, '2026-10-21T11:00:00+09:00');
  writeFileSync(ko, readFileSync(ko, 'utf8') + 'Later hotfix\n');
  post('new-post', '.en');
  const { state, overrides } = publication.plan(root, first, '2026-10-22T12:00:00+09:00');
  assert.equal(state.posts['new-post'].dates.en, first.posts['new-post'].date);
  assert.equal(overrides['content/posts/new-post/index.md'], '2026-10-21T11:00:00+09:00');
});

test('Git-detected directory rename preserves dates without source IDs', () => {
  const { root, git, baseline } = fixture();
  const previous = baseline();
  renameSync(join(root, 'content/posts/old-post'), join(root, 'content/posts/renamed-post'));
  git('add', '-A');
  git('commit', '-m', 'Rename only');
  const { state } = publication.plan(root, previous, '2026-10-22T12:00:00+09:00');
  assert.deepEqual(state.posts['renamed-post'], previous.posts['old-post']);
});

test('rename into a freed slug takes the incoming identity, not its stale date', () => {
  const { root, git, post } = fixture();
  post('alpha', '', '2026-01-01T00:00:00+09:00');
  post('beta', '', '2026-02-01T00:00:00+09:00');
  git('add', '.'); git('commit', '-m', 'Published identities');
  const previous = publication.bootstrapState(root, 'HEAD', '2026-10-21T11:00:00+09:00');
  renameSync(join(root, 'content/posts/alpha'), join(root, 'content/posts/archive'));
  git('add', '-A'); git('commit', '-m', 'Move alpha');
  const first = publication.plan(root, previous, '2026-10-21T11:00:00+09:00').state;
  // Also recover state emitted by the old implementation, which retained aliases.
  first.posts.alpha = previous.posts.alpha;
  renameSync(join(root, 'content/posts/beta'), join(root, 'content/posts/alpha'));
  git('add', '-A'); git('commit', '-m', 'Reuse freed alpha');
  const second = publication.plan(root, first, '2026-10-22T11:00:00+09:00').state;
  assert.deepEqual(second.posts.alpha, previous.posts.beta);
  assert.deepEqual(second.posts.archive, previous.posts.alpha);
  assert.ok(!Object.hasOwn(second.posts, 'beta'));
});

test('per-commit renames survive a later rewrite and compose through intermediate slugs', () => {
  const { root, git, baseline } = fixture();
  const previous = baseline();
  for (const [from, to] of [['old-post', 'intermediate'], ['intermediate', 'final']]) {
    renameSync(join(root, 'content/posts', from), join(root, 'content/posts', to));
    git('add', '-A'); git('commit', '-m', `Move ${from} to ${to}`);
  }
  for (const name of readdirSync(join(root, 'content/posts/final'))) {
    writeFileSync(join(root, 'content/posts/final', name), '---\ntitle: Rewritten\n---\n' + 'Different content\n'.repeat(200));
  }
  git('add', '.'); git('commit', '-m', 'Rewrite after moves');
  const state = publication.plan(root, previous, '2026-10-22T11:00:00+09:00').state;
  assert.deepEqual(state.posts.final, previous.posts['old-post']);
  assert.ok(!Object.hasOwn(state.posts, 'old-post'));
  assert.ok(!Object.hasOwn(state.posts, 'intermediate'));
});

test('ambiguous move plus rewrite fails instead of resetting the date', () => {
  const { root, git, baseline } = fixture();
  const previous = baseline();
  const moved = join(root, 'content/posts/renamed-post');
  renameSync(join(root, 'content/posts/old-post'), moved);
  for (const name of readdirSync(moved)) writeFileSync(join(moved, name), '---\ntitle: Rewritten\n---\n' + 'Different content\n'.repeat(200));
  git('add', '-A');
  git('commit', '-m', 'Ambiguous rename and rewrite');
  assert.throws(() => publication.plan(root, previous, '2026-10-22T12:00:00+09:00'), /Ambiguous/);
});

test('drafts, explicit scheduled posts and expired posts are not registered', () => {
  const { root, post, baseline } = fixture();
  const previous = baseline();
  post('draft', '', undefined, 'draft: true\n');
  post('scheduled', '', undefined, "publishDate: '2027-01-01T00:00:00+09:00'\n");
  post('expired', '', undefined, "expiryDate: '2025-01-01T00:00:00+09:00'\n");
  const { state, overrides } = publication.plan(root, previous, '2026-10-21T11:00:00+09:00');
  assert.deepEqual(state.posts, previous.posts);
  assert.equal(Object.keys(overrides).length, 2);
});

test('future date schedules publication unless an explicit past publishDate overrides it', () => {
  const { root, git, post } = fixture();
  const previous = { version: 1, source_commit: git('rev-parse', 'HEAD'), posts: {} };
  post('future', '', '2027-01-01T00:00:00+09:00');
  post('published', '', '2027-01-01T00:00:00+09:00', "publishDate: '2026-01-01T00:00:00+09:00'\n");
  const { state, overrides } = publication.plan(root, previous, '2026-10-21T11:00:00+09:00');
  assert.ok(!Object.hasOwn(state.posts, 'future'));
  assert.ok(!Object.hasOwn(overrides, 'content/posts/future/index.md'));
  assert.ok(Object.hasOwn(state.posts, 'published'));
});

test('invalid state, unsafe keys and stale source revisions fail closed', () => {
  const { root, git, baseline } = fixture();
  const previous = baseline();
  for (const bad of [{}, { ...previous, version: 99 }, { ...previous, source_commit: 'bad' },
    { ...previous, posts: { '../escape': { date: 'bad', dates: {} } } },
    { ...previous, posts: JSON.parse('{"__proto__":{"date":"2026-01-01T10:00:00+09:00","dates":{}}}') }]) {
    assert.throws(() => publication.plan(root, bad, '2026-10-21T11:00:00+09:00'));
  }
  const path = join(root, 'hugo.yaml');
  writeFileSync(path, 'title: Later revision\n');
  git('add', '.'); git('commit', '-m', 'Later revision');
  const later = { ...previous, source_commit: git('rev-parse', 'HEAD') };
  git('checkout', '--detach', previous.source_commit);
  assert.throws(() => publication.plan(root, later, '2026-10-21T11:00:00+09:00'), /ancestor|stale/);
});

test('malformed or ambiguous YAML is rejected before writing', () => {
  const { root, post, baseline } = fixture();
  const previous = baseline();
  const path = post('new-post');
  for (const front of ['{title: Test}', 'title: One\ntitle: Two', 'title: One\nTitle: Two',
    "original: &date '2026-01-01T00:00:00+09:00'\ndate: *date"]) {
    writeFileSync(path, `---\n${front}\n---\nBody\n`);
    const before = readFileSync(path);
    assert.throws(() => publication.plan(root, previous, '2026-10-21T11:00:00+09:00'));
    assert.deepEqual(readFileSync(path), before);
  }
});

test('YAML scalar replacement preserves CRLF, quoted keys, comments and body', () => {
  for (const front of ["'date': '2026-01-01T10:00:00+09:00'", 'date: >-\n  2026-01-01T10:00:00+09:00']) {
    const source = `---\n${front}\n# Keep comment\ntitle: Test\n---\n\nBody\n`.replaceAll('\n', '\r\n');
    const result = publication.setDate(source, '2026-10-21T11:00:00+09:00');
    assert.equal(publication.parseFront(result).fields.date, '2026-10-21T11:00:00+09:00');
    assert.ok(result.includes('# Keep comment\r\ntitle: Test'));
    assert.ok(result.endsWith('---\r\n\r\nBody\r\n'));
    assert.ok(!result.replaceAll('\r\n', '').includes('\n'));
  }
});

test('publication and expiry timestamps remain fail-closed before Hugo interpretation', () => {
  const { root, git, post } = fixture();
  const previous = { version: 1, source_commit: git('rev-parse', 'HEAD'), posts: {} };
  for (const field of ['publishDate', 'expiryDate']) {
    post('invalid', '', undefined, `${field}: '2026-01-01T00:00:00'\n`);
    assert.throws(() => publication.plan(root, previous, NOW), /timezone/);
  }
});

test('timestamps require a timezone and a valid calendar date', () => {
  for (const invalid of ['2026-01-01T00:00:00', '2026-02-30T00:00:00+09:00', 'invalid', null]) {
    assert.throws(() => publication.timestamp(invalid));
  }
  assert.equal(publication.timestamp('2026-10-21T11:00:00.123+09:00'), '2026-10-21T11:00:00+09:00');
  assert.match(publication.nowKst(), /T\d{2}:\d{2}:\d{2}\+09:00$/);
});

test('HTTP errors and revision mismatch cannot turn into an empty publication state', async () => {
  const { baseline } = fixture();
  const previous = baseline();
  const response = { status: 200, body: JSON.stringify(previous) };
  const server = createServer((_request, result) => { result.writeHead(response.status); result.end(response.body); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.deepEqual(await publication.fetchState(url, previous.source_commit, { attempts: 1 }), previous);
    await assert.rejects(publication.fetchState(url, '0'.repeat(40), { attempts: 1 }), /revision|deployment/);
    response.status = 503;
    await assert.rejects(publication.fetchState(url, previous.source_commit, { attempts: 1 }), /503/);
    response.status = 404;
    assert.equal(await publication.fetchState(url, previous.source_commit, { attempts: 1 }), null);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('missing state bootstraps only before the first managed deployment', async () => {
  const { root, git, baseline } = fixture();
  const previous = baseline();
  const dependencies = { activeDeployment: () => previous.source_commit, fetchState: async () => null };
  assert.deepEqual(await publication.livePrevious(root, 'https://example.invalid', 'example/blog',
    '2026-10-21T11:00:00+09:00', dependencies), previous);
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts/build-publication.mjs'), '// Managed publication marker\n');
  git('add', '.'); git('commit', '-m', 'Managed deployment');
  dependencies.activeDeployment = () => git('rev-parse', 'HEAD');
  await assert.rejects(publication.livePrevious(root, 'https://example.invalid', 'example/blog',
    '2026-10-21T11:00:00+09:00', dependencies), /Missing publication state/);
});

test('output overlap and symlink traversal are refused before writing', () => {
  const { root, outer, baseline } = fixture();
  const previous = baseline();
  for (const work of [join(root, 'generated'), `${outer}/missing/../source/generated`]) {
    assert.throws(() => publication.productionBuild(root, work, previous), /outside|source/);
  }
  symlinkSync(root, join(outer, 'alias'));
  assert.throws(() => publication.productionBuild(root, `${outer}/alias/../output`, previous), /[Ss]ymlink/);
  assert.ok(!existsSync(join(root, 'generated')));
  assert.ok(!existsSync(join(outer, 'output')));
});

test('a failed Hugo process cannot publish state or modify the original source', () => {
  const { root, outer, post, baseline } = fixture();
  const previous = baseline();
  const path = post('new-post');
  const before = readFileSync(path);
  const work = join(outer, 'build');
  assert.throws(() => publication.productionBuild(root, work, previous, { hugo: process.execPath, stdio: 'pipe' }));
  assert.deepEqual(readFileSync(path), before);
  assert.ok(!existsSync(join(work, 'public/publication-state.json')));
});

const HUGO = process.env.HUGO || 'hugo';
const NOW = '2026-10-21T11:00:00+09:00';
const LATER = '2026-10-22T11:00:00+09:00';

function hugoFixture() {
  const f = fixture();
  writeFileSync(join(f.root, 'hugo.yaml'), 'baseURL: https://example.invalid/\ntitle: Test\ndefaultContentLanguage: ko\nlanguages:\n  ko:\n    weight: 1\n  en:\n    weight: 2\nbuildDrafts: false\nbuildFuture: false\nbuildExpired: false\n');
  mkdirSync(join(f.root, 'layouts/_default'), { recursive: true });
  writeFileSync(join(f.root, 'layouts/_default/single.html'), '{{ .Title }}|{{ .Date.Format "2006-01-02T15:04:05Z07:00" }}|{{ .Content }}');
  writeFileSync(join(f.root, 'layouts/_default/list.html'), '{{ range .Pages }}{{ .Title }} {{ end }}');
  f.git('add', '.'); f.git('commit', '-m', 'Hugo fixture');
  f.empty = () => ({ version: 1, source_commit: f.git('rev-parse', 'HEAD'), posts: {} });
  f.build = (previous, label, now = NOW) => {
    const snapshot = (path) => readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      .filter(entry => entry.name !== '.git').map(entry => [entry.name, entry.isDirectory()
        ? snapshot(join(path, entry.name)) : readFileSync(join(path, entry.name)).toString('base64')]);
    const before = snapshot(f.root);
    const work = join(f.outer, label);
    const state = publication.productionBuild(f.root, work, previous, { hugo: HUGO, now, stdio: 'pipe' });
    assert.deepEqual(snapshot(f.root), before, 'Hugo builds must not write any source files');
    return { state, work };
  };
  return f;
}

for (const hiddenBy of ['render', 'cascade']) test(`real Hugo: ${hiddenBy}-hidden posts get a date only when HTML first appears`, () => {
  const f = hugoFixture();
  const previous = f.empty();
  f.post('hidden', '', undefined, hiddenBy === 'render' ? 'build:\n  render: never\n  list: never\n' : '');
  const section = join(f.root, 'content/posts/_index.md');
  if (hiddenBy === 'cascade') writeFileSync(section, '---\ntitle: Posts\ncascade:\n  draft: true\n---\n');
  f.git('add', '.'); f.git('commit', '-m', 'Hidden post');
  const first = f.build(previous, 'hidden');
  assert.ok(!existsSync(join(first.work, 'public/posts/hidden/index.html')));
  assert.ok(!Object.hasOwn(first.state.posts, 'hidden'));
  assert.ok(!Object.hasOwn(publication.plan(f.root, previous, NOW).state.posts, 'hidden'));
  f.post('hidden');
  if (hiddenBy === 'cascade') writeFileSync(section, '---\ntitle: Posts\n---\n');
  f.git('add', '.'); f.git('commit', '-m', 'Visible post');
  const second = f.build(first.state, 'visible', LATER);
  assert.equal(second.state.posts.hidden.date, LATER);
  assert.ok(readFileSync(join(second.work, 'public/posts/hidden/index.html'), 'utf8').includes(LATER));
});

test('real Hugo: bootstrap excludes cascaded and render-disabled posts from the deployed revision', () => {
  const f = hugoFixture();
  f.post('hidden', '', '2026-01-01T00:00:00+09:00', 'build:\n  render: never\n  list: never\n');
  f.post('cascaded', '', '2026-01-01T00:00:00+09:00');
  writeFileSync(join(f.root, 'content/posts/_index.md'), '---\ntitle: Posts\ncascade:\n  draft: true\n---\n');
  f.git('add', '.'); f.git('commit', '-m', 'Hidden deployed source');
  const revision = f.git('rev-parse', 'HEAD');
  // Current working files must not decide migration visibility.
  writeFileSync(join(f.root, 'content/posts/_index.md'), '---\ntitle: Posts\n---\n');
  f.post('hidden', '', '2026-01-01T00:00:00+09:00');
  assert.deepEqual(publication.bootstrapState(f.root, revision, NOW).posts, {});
});

test('real Hugo: date scheduling and explicit publishDate preserve migration output', () => {
  const f = hugoFixture();
  f.post('future', '', '2027-01-01T00:00:00+09:00');
  f.post('published', '', '2027-01-01T00:00:00+09:00', "publishDate: '2026-01-01T00:00:00+09:00'\n");
  f.git('add', '.'); f.git('commit', '-m', 'Scheduling precedences');
  const previous = publication.bootstrapState(f.root, 'HEAD', NOW);
  assert.deepEqual(Object.keys(previous.posts), ['published']);
  assert.equal(previous.posts.published.date, '2027-01-01T00:00:00+09:00');
  const result = f.build(previous, 'migration');
  assert.ok(!existsSync(join(result.work, 'public/posts/future/index.html')));
  assert.ok(!Object.hasOwn(result.state.posts, 'future'));
  assert.ok(readFileSync(join(result.work, 'public/posts/published/index.html'), 'utf8').includes('2027-01-01T00:00:00+09:00'));
  const first = f.build(f.empty(), 'initial');
  assert.ok(!existsSync(join(first.work, 'public/posts/future/index.html')));
  assert.equal(first.state.posts.published.date, NOW);
});

test('real Hugo: a new authored past date uses first-build time for date and implicit publishDate', () => {
  const f = hugoFixture();
  const previous = f.empty();
  writeFileSync(join(f.root, 'layouts/_default/single.html'), '{{ .Date.Format "2006-01-02T15:04:05Z07:00" }}|{{ .PublishDate.Format "2006-01-02T15:04:05Z07:00" }}');
  f.post('authored', '', '2026-10-21T10:00:00+09:00');
  f.git('add', '.'); f.git('commit', '-m', 'Authored at ten');
  const result = f.build(previous, 'authored');
  assert.equal(readFileSync(join(result.work, 'public/posts/authored/index.html'), 'utf8'), `${NOW}|${NOW}`);
});

test('real Hugo: later translation inherits a future displayed date without becoming scheduled', () => {
  const f = hugoFixture();
  const future = '2027-01-01T00:00:00+09:00';
  f.post('published', '', future, "publishDate: '2026-01-01T00:00:00+09:00'\n");
  f.git('add', '.'); f.git('commit', '-m', 'Public article with future displayed date');
  const previous = publication.bootstrapState(f.root, 'HEAD', NOW);
  const translation = f.post('published', '.en');
  const before = readFileSync(translation);
  f.git('add', '.'); f.git('commit', '-m', 'Later translation without dates');
  const result = f.build(previous, 'translation');
  assert.equal(result.state.posts.published.dates.en, future);
  assert.ok(existsSync(join(result.work, 'public/en/posts/published/index.html')), 'registered translation must have final HTML');
  assert.ok(readFileSync(join(result.work, 'public/en/posts/published/index.html'), 'utf8').includes(future));
  assert.deepEqual(readFileSync(translation), before);
});

test('final missing HTML fails before publishing state even when Hugo exits successfully', () => {
  const f = hugoFixture();
  const previous = f.empty();
  f.post('checked');
  f.git('add', '.'); f.git('commit', '-m', 'Visible before final output check');
  const wrapper = join(f.outer, 'hugo-with-missing-output.mjs');
  writeFileSync(wrapper, `#!${process.execPath}\nimport {spawnSync} from 'node:child_process';\nimport {rmSync} from 'node:fs';\nimport {basename,join} from 'node:path';\nconst args=process.argv.slice(2);\nconst result=spawnSync(${JSON.stringify(HUGO)},args,{stdio:'inherit'});\nif(result.status!==0)process.exit(result.status??1);\nconst output=args[args.indexOf('--destination')+1];\nif(basename(output)==='public')rmSync(join(output,'posts/checked/index.html'));\n`);
  chmodSync(wrapper, 0o755);
  const work = join(f.outer, 'missing-final');
  assert.throws(() => publication.productionBuild(f.root, work, previous, {
    hugo: wrapper, now: NOW, stdio: 'pipe',
  }), /Final Hugo output missing/);
  assert.ok(!existsSync(join(work, 'public/publication-state.json')));
});

test('real Hugo: unlisted HTML and translations remain visible without leaking the probe', () => {
  const f = hugoFixture();
  const previous = f.empty();
  f.post('unlisted', '', undefined, 'build:\n  render: always\n  list: never\n');
  f.post('unlisted', '.en', undefined, 'build:\n  render: always\n  list: never\n');
  f.git('add', '.'); f.git('commit', '-m', 'Unlisted bilingual page');
  const result = f.build(previous, 'unlisted');
  assert.deepEqual(result.state.posts.unlisted.dates, { ko: NOW, en: NOW });
  for (const prefix of ['', 'en/']) assert.ok(existsSync(join(result.work, `public/${prefix}posts/unlisted/index.html`)));
  assert.ok(!readdirSync(join(result.work, 'public')).some(name => name.startsWith('publication-visibility-')));
});

test('real Hugo: rename history composes a swap and later rewrite without exchanging dates', () => {
  const f = hugoFixture();
  f.post('alpha', '', '2026-01-01T00:00:00+09:00');
  f.post('beta', '', '2026-02-01T00:00:00+09:00');
  f.git('add', '.'); f.git('commit', '-m', 'Two identities');
  const previous = publication.bootstrapState(f.root, 'HEAD', NOW);
  for (const [from, to] of [['alpha', 'temporary'], ['beta', 'alpha'], ['temporary', 'beta']]) {
    renameSync(join(f.root, 'content/posts', from), join(f.root, 'content/posts', to));
    f.git('add', '-A'); f.git('commit', '-m', `Move ${from}`);
  }
  writeFileSync(join(f.root, 'content/posts/alpha/index.md'), '---\ntitle: Rewrite\n---\n' + 'Completely different text\n'.repeat(200));
  f.git('add', '.'); f.git('commit', '-m', 'Later rewrite');
  const result = f.build(previous, 'swapped');
  assert.deepEqual(result.state.posts.alpha, previous.posts.beta);
  assert.deepEqual(result.state.posts.beta, previous.posts.alpha);
  for (const [slug, old] of [['alpha', 'beta'], ['beta', 'alpha']]) {
    assert.ok(readFileSync(join(result.work, `public/posts/${slug}/index.html`), 'utf8').includes(previous.posts[old].date));
  }
});

test('conflicting partial bundle moves fail closed', () => {
  const { root, git, post } = fixture();
  for (const slug of ['alpha', 'beta']) {
    post(slug, '', '2026-01-01T00:00:00+09:00');
    post(slug, '.en', '2026-02-01T00:00:00+09:00');
  }
  git('add', '.'); git('commit', '-m', 'Published translations');
  const previous = publication.bootstrapState(root, 'HEAD', NOW);
  renameSync(join(root, 'content/posts/alpha/index.md'), join(root, 'content/posts/beta/index.ko.md'));
  rmSync(join(root, 'content/posts/beta/index.md'));
  git('add', '-A'); git('commit', '-m', 'Conflicting partial move');
  assert.throws(() => publication.plan(root, previous, NOW), /Ambiguous|Duplicate language/);
});

test('the deployment uses JavaScript only and cannot commit source changes', () => {
  const source = readFileSync(new URL('../.github/workflows/hugo.yml', import.meta.url), 'utf8');
  const workflow = parseDocument(source).toJS();
  assert.equal(workflow.permissions.contents, 'read');
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ['build', 'deploy']);
  assert.ok(source.includes('bun scripts/build-publication.mjs build'));
  for (const forbidden of ['setup-python', 'python ', 'pip install', 'contents: write', 'git push', 'git commit', './public']) {
    assert.ok(!source.includes(forbidden), forbidden);
  }
  assert.ok(!existsSync(new URL('../data/publications.json', import.meta.url)));
});
