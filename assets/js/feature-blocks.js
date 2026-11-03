(() => {
  const root = document.documentElement;
  const measureViewport = () => document.body.style.setProperty('--reading-viewport', `${root.clientWidth}px`);
  measureViewport();
  addEventListener('resize', measureViewport, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(measureViewport).observe(root);

  for (const compare of document.querySelectorAll('.compare')) {
    const range = compare.querySelector('.compare-range');
    if (!range) continue;
    const apply = () => compare.style.setProperty('--compare-pos', `${range.value}%`);
    range.addEventListener('input', apply);
    range.hidden = false;
    compare.classList.add('is-ready');
    apply();
  }

  // pair: pictures without a ratio from Hugo (SVG, remote) get it once they load.
  for (const item of document.querySelectorAll('.figure-pair > .figure')) {
    if (item.style.getPropertyValue('--pair-ratio')) continue;
    const image = item.querySelector('img');
    if (!image) continue;
    const apply = () => {
      if (image.naturalWidth && image.naturalHeight) item.style.setProperty('--pair-ratio', String(image.naturalWidth / image.naturalHeight));
    };
    if (image.complete) apply(); else image.addEventListener('load', apply, { once: true });
  }

  // slides: arrows and a counter over the snapping row; the row itself still swipes and scrolls.
  for (const figure of document.querySelectorAll('.figure-slides')) {
    const track = figure.querySelector('.slides');
    const prev = figure.querySelector('.slides-prev');
    const next = figure.querySelector('.slides-next');
    const count = figure.querySelector('.slides-count');
    const slides = track ? [...track.children] : [];
    if (!track || !prev || !next || !count || slides.length < 2) continue;
    const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const show = index => track.scrollTo({ left: index * track.clientWidth });
    const sync = () => {
      const index = Math.min(slides.length - 1, Math.max(0, current()));
      count.textContent = `${index + 1} / ${slides.length}`;
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
    };
    prev.addEventListener('click', () => show(current() - 1));
    next.addEventListener('click', () => show(current() + 1));
    track.addEventListener('keydown', event => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (!step) return;
      event.preventDefault();
      show(current() + step);
    });
    track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    prev.hidden = next.hidden = count.hidden = false;
    figure.classList.add('is-ready');
    sync();
  }

  const targetOfHash = () => {
    if (!location.hash) return null;
    try { return document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { return null; }
  };
  for (const tabs of document.querySelectorAll('.tabs')) {
    const buttons = [...tabs.querySelectorAll(':scope > .tabs-list > .tabs-tab')];
    const panels = buttons.map(button => document.getElementById(button.getAttribute('aria-controls')));
    if (!buttons.length || panels.some(panel => !panel)) continue;
    const select = (index, focus = false) => {
      buttons.forEach((button, i) => {
        const selected = i === index;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        panels[i].hidden = !selected;
      });
      if (focus) buttons[index].focus();
    };
    const openHashTarget = () => {
      const target = targetOfHash();
      const index = target ? panels.findIndex(panel => panel.contains(target)) : -1;
      if (index < 0) return false;
      select(index);
      return true;
    };
    buttons.forEach((button, i) => {
      button.addEventListener('click', () => select(i));
      button.addEventListener('keydown', event => {
        const last = buttons.length - 1;
        const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        select(next, true);
      });
    });
    tabs.classList.add('is-ready');
    if (!openHashTarget()) select(0);
    addEventListener('hashchange', () => { if (openHashTarget()) targetOfHash()?.scrollIntoView(); });
  }
})();
