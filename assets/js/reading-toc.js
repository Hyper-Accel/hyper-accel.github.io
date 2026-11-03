(() => {
  const toc = document.querySelector('.reading-toc');
  const toggle = document.querySelector('.reading-toc-toggle');
  if (!toc || !toggle) return;
  const narrow = matchMedia('(max-width: 1099px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const sections = links.map(link => {
    try {
      const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      return heading ? { link, heading } : null;
    } catch { return null; }
  }).filter(Boolean);
  const header = document.querySelector('.tr-header');
  const nav = toc.querySelector('nav');
  if (nav) nav.setAttribute('aria-labelledby', 'reading-toc-title');
  document.body.classList.add('reading-toc-ready');
  let offset = 132;
  let frame = 0;
  let active = null;

  const setOpen = (open, restoreFocus = false) => {
    toc.classList.toggle('is-open', open && narrow.matches);
    toggle.setAttribute('aria-expanded', String(open && narrow.matches));
    if (open && narrow.matches) (active?.link || links[0])?.focus({ preventScroll: true });
    if (restoreFocus && narrow.matches) toggle.focus({ preventScroll: true });
  };
  const update = () => {
    frame = 0;
    let current = null;
    for (const section of sections) {
      if (section.heading.getBoundingClientRect().top <= offset + 8) current = section;
      else break;
    }
    if (current === active) return;
    if (active) active.link.removeAttribute('aria-current');
    active = current;
    if (active) {
      active.link.setAttribute('aria-current', 'location');
      // Keep the active entry visible in long rails without moving the page.
      const scroller = toc.querySelector('.reading-toc-links');
      if (scroller && scroller.clientHeight) {
        const linkRect = active.link.getBoundingClientRect();
        const railRect = scroller.getBoundingClientRect();
        if (linkRect.top < railRect.top) scroller.scrollTop -= railRect.top - linkRect.top;
        else if (linkRect.bottom > railRect.bottom) scroller.scrollTop += linkRect.bottom - railRect.bottom;
      }
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const measureHeader = () => {
    offset = (header?.getBoundingClientRect().height || 108) + 24;
    document.body.style.setProperty('--reading-offset', `${offset}px`);
    schedule();
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  toc.querySelector('.reading-toc-close')?.addEventListener('click', () => setOpen(false, true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toc.classList.contains('is-open')) setOpen(false, true);
  });
  document.addEventListener('click', event => {
    if (toc.classList.contains('is-open') && !toc.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  sections.forEach(({ link, heading }) => {
    // Capture before PaperMod's generic smooth-anchor listener. Preserve modified clicks.
    link.addEventListener('click', event => {
      event.stopImmediatePropagation();
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      setOpen(false);
      if (location.hash !== link.hash) history.pushState(null, '', link.hash);
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      schedule();
    }, true);
  });
  narrow.addEventListener('change', () => { setOpen(false); measureHeader(); });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', measureHeader, { passive: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  document.querySelector('.post-content')?.addEventListener('load', schedule, true);
  if (header && 'ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header);
  document.fonts?.ready.then(measureHeader);
  measureHeader();
})();
