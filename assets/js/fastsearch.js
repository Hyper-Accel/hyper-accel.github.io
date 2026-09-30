import * as params from '@params';

let fuse;
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

function runSearch() {
  if (!fuse) return;
  const query = searchInput.value.trim();
  updateURL(query);

  if (!query) {
    resultList.innerHTML = '';
    resultsAvailable = false;
    return;
  }

  const options = params.fuseOpts ? { limit: params.fuseOpts.limit } : undefined;
  const results = fuse.search(query, options);
  resultList.innerHTML = results.map(({ item }) => `
    <li class="post-entry">
      <header class="entry-header">${escapeHTML(item.title)}&nbsp;→</header>
      <div class="entry-summary">${escapeHTML(compact(item.summary, 150))}</div>
      <a href="${escapeHTML(item.permalink)}" aria-label="${escapeHTML(item.title)}"></a>
    </li>`).join('');
  resultsAvailable = results.length > 0;
  first = resultList.firstChild;
  last = resultList.lastChild;
}

window.addEventListener('load', () => {
  const xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4 || xhr.status !== 200) return;
    const data = JSON.parse(xhr.responseText);
    const defaults = {
      distance: 100,
      threshold: 0.4,
      ignoreLocation: true,
      keys: ['title', 'permalink', 'summary', 'content']
    };
    const configured = params.fuseOpts ? {
      isCaseSensitive: params.fuseOpts.iscasesensitive ?? false,
      includeScore: params.fuseOpts.includescore ?? false,
      includeMatches: params.fuseOpts.includematches ?? false,
      minMatchCharLength: params.fuseOpts.minmatchcharlength ?? 1,
      shouldSort: params.fuseOpts.shouldsort ?? true,
      findAllMatches: params.fuseOpts.findallmatches ?? false,
      keys: params.fuseOpts.keys ?? defaults.keys,
      location: params.fuseOpts.location ?? 0,
      threshold: params.fuseOpts.threshold ?? defaults.threshold,
      distance: params.fuseOpts.distance ?? defaults.distance,
      ignoreLocation: params.fuseOpts.ignorelocation ?? true
    } : defaults;
    fuse = new Fuse(data, configured);
    searchInput.value = new URLSearchParams(window.location.search).get('q') || '';
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
