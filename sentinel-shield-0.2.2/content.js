/* Conservative cosmetic filtering only. Network requests are handled by background.js. */
'use strict';
(() => {
  const STYLE_ID = 'sentinel-shield-cosmetic-layer';
  let baseSelectors = [];
  let settings = { cosmeticFiltering: true, customCosmeticSelectors: [] };
  let styleNode = null;
  let observer = null;

  function validSelector(selector) {
    const s = String(selector || '').trim();
    if (!s || s.length > 300 || /[{};]/.test(s) || /url\s*\(/i.test(s)) return false;
    try { document.querySelector(s); return true; } catch { return false; }
  }
  function applyStyles() {
    if (!document.documentElement) {
      if (!observer) {
        observer = new MutationObserver(() => { if (document.documentElement) { observer.disconnect(); observer = null; applyStyles(); } });
        observer.observe(document, { childList: true, subtree: true });
      }
      return;
    }
    if (styleNode?.isConnected) styleNode.remove();
    styleNode = null;
    if (!settings.cosmeticFiltering) return;
    const selectors = [...new Set([...baseSelectors, ...(settings.customCosmeticSelectors || [])])].filter(validSelector);
    if (!selectors.length) return;
    styleNode = document.createElement('style');
    styleNode.id = STYLE_ID;
    styleNode.dataset.sentinelShield = 'cosmetic';
    styleNode.textContent = `${selectors.join(',\n')} { display: none !important; visibility: hidden !important; }`;
    (document.head || document.documentElement).appendChild(styleNode);
  }
  async function initialize() {
    try {
      const [cssText, stored] = await Promise.all([
        fetch(browser.runtime.getURL('filters/cosmetic.txt')).then((r) => r.text()),
        browser.storage.local.get('settings')
      ]);
      baseSelectors = cssText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.length <= 300);
      settings = { ...settings, ...(stored.settings || {}) };
      applyStyles();
    } catch { /* Extension storage and style failures should never disrupt page loading. */ }
  }
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings?.newValue) {
      settings = { ...settings, ...changes.settings.newValue };
      applyStyles();
    }
  });
  initialize();
})();
