(() => {
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  const syncLabel = () => {
    const label = document.documentElement.dataset.theme === 'dark'
      ? button.dataset.labelLight : button.dataset.labelDark;
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  // PaperMod owns the click/state/pref-theme handler; do not toggle a second time.
  new MutationObserver(syncLabel).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme'],
  });
  syncLabel();
})();
