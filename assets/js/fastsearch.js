let ready = false;
let first;
let last;
let currentElement = null;
let resultsAvailable = false;
const resultList = document.getElementById('searchResults');
const searchInput = document.getElementById('searchInput');

function escapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function compact(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
}

function updateURL(query) {
  const url = new URL(window.location.href);
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  window.history.replaceState({}, '', url);
}

const isKo = (document.documentElement.lang || '').startsWith('ko');
const MAX_RESULTS = 30;
let docs = [];
let status;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text, terms) {
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  return text.split(pattern).map((part, i) => (i % 2 ? `<mark>${escapeHTML(part)}</mark>` : escapeHTML(part))).join('');
}

function snippet(doc, terms) {
  const phrase = terms.join(' ');
  const candidates = terms.length > 1 ? [phrase, ...terms] : terms;
  const anchor = [candidates[0], ...[...candidates.slice(1)].sort((a, b) => b.length - a.length)].find((t) => doc.lc.includes(t));
  if (!anchor) return compact(doc.summary, 150);
  const pos = doc.lc.indexOf(anchor);
  let start = Math.max(0, pos - 60);
  let end = Math.min(doc.text.length, pos + anchor.length + 110);
  if (start > 0) start = doc.text.indexOf(' ', start) + 1 || start;
  const lastSpace = doc.text.lastIndexOf(' ', end);
  if (end < doc.text.length && lastSpace > pos + anchor.length) end = lastSpace;
  return `${start > 0 ? '…' : ''}${doc.text.slice(start, end).trim()}${end < doc.text.length ? '…' : ''}`;
}

function countOf(haystack, needle) {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1 && n < 99; i = haystack.indexOf(needle, i + needle.length)) n += 1;
  return n;
}

function renderStatus(query, count) {
  if (!status) {
    status = document.createElement('p');
    status.className = 'search-status';
    status.setAttribute('role', 'status');
    resultList.before(status);
  }
  if (!query) status.textContent = '';
  else if (!count) status.textContent = isKo ? `‘${query}’가 포함된 글이 없습니다.` : `No posts contain “${query}”.`;
  else status.textContent = isKo ? `‘${query}’ 검색 결과 ${count}건` : `${count} result${count > 1 ? 's' : ''} for “${query}”`;
}

function runSearch() {
  if (!ready) return;
  const query = searchInput.value.trim();
  updateURL(query);
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];

  if (!terms.length) {
    resultList.innerHTML = '';
    renderStatus('', 0);
    resultsAvailable = false;
    return;
  }

  const results = docs
    .filter((doc) => terms.every((t) => doc.lt.includes(t) || doc.lc.includes(t)))
    .map((doc) => ({
      doc,
      score: terms.reduce((s, t) => s + (doc.lt.includes(t) ? 50 : 0) + Math.min(countOf(doc.lc, t), 20), 0)
        + (terms.length > 1 ? Math.min(countOf(doc.lc, terms.join(' ')), 20) * 3 : 0)
    }))
    .sort((a, b) => b.score - a.score);

  renderStatus(query, results.length);
  resultList.innerHTML = results.slice(0, MAX_RESULTS).map(({ doc }) => {
    const hits = terms.reduce((s, t) => s + countOf(doc.lc, t), 0);
    const meta = [doc.category, doc.date, hits ? (isKo ? `본문 ${hits}곳` : `${hits} in text`) : '']
      .filter(Boolean).map((m, i) => (i === 0 && doc.category ? `<span class="tr-cat">${escapeHTML(m)}</span>` : `<span>${escapeHTML(m)}</span>`)).join('');
    return `
    <li class="post-entry" style="${escapeHTML(doc.style || '')}">
      <div class="entry-meta">${meta}</div>
      <header class="entry-header">${highlight(doc.title, terms)}&nbsp;→</header>
      <div class="entry-summary">${highlight(snippet(doc, terms), terms)}</div>
      <a href="${escapeHTML(doc.permalink)}" aria-label="${escapeHTML(doc.title)}"></a>
    </li>`;
  }).join('');
  resultsAvailable = results.length > 0;
  first = resultList.firstElementChild;
  last = resultList.lastElementChild;
}

window.addEventListener('load', () => {
  const xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4 || xhr.status !== 200) return;
    docs = JSON.parse(xhr.responseText).map((item) => {
      const text = String(item.content || '').replace(/\s+/g, ' ').trim();
      return { ...item, text, lc: text.toLowerCase(), lt: String(item.title || '').toLowerCase() };
    });
    ready = true;
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial && !searchInput.value) searchInput.value = initial;
    runSearch();
  };
  xhr.open('GET', '../index.json');
  xhr.send();
});

searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('search', runSearch);

function focusResult(element) {
  document.querySelectorAll('.focus').forEach((item) => item.classList.remove('focus'));
  if (!element) return;
  element.focus();
  currentElement = element;
  element.parentElement.classList.add('focus');
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    searchInput.value = '';
    runSearch();
    searchInput.focus();
    return;
  }
  if (!resultsAvailable) return;
  const active = document.activeElement === searchInput ? searchInput : currentElement;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusResult(active === searchInput ? first.lastElementChild : active.parentElement.nextElementSibling?.lastElementChild);
  } else if (event.key === 'ArrowUp' && active !== searchInput) {
    event.preventDefault();
    focusResult(active.parentElement === first ? searchInput : active.parentElement.previousElementSibling?.lastElementChild);
  } else if (event.key === 'ArrowRight' && active !== searchInput) {
    active.click();
  }
});
