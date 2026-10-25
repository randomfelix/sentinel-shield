/* Conservative cosmetic filtering only. Network requests are handled by background.js. */
'use strict';
(() => {
  const STYLE_ID = 'sentinel-shield-cosmetic-layer';
  let baseSelectors = [];
  let settings = { cosmeticFiltering: true, customCosmeticSelectors: [] };
  let styleNode = null;
  let observer = null;
  const reportedNodes = new WeakSet();
  let cosmeticReportCount = 0;
  const COSMETIC_REPORT_CAP = 150;

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
  function reportCosmeticNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE || cosmeticReportCount >= COSMETIC_REPORT_CAP) return;
    const selectors = [...new Set([...baseSelectors, ...(settings.customCosmeticSelectors || [])])];
    let matched = false;
    for (const selector of selectors) {
      try {
        if (node.matches(selector)) matched = true;
      } catch { /* Invalid custom selectors are ignored. */ }
      if (matched) break;
    }
    if (matched && !reportedNodes.has(node) && !node.closest?.('[data-sentinel-shield-badge]')) {
      reportedNodes.add(node);
      cosmeticReportCount++;
      try { browser.runtime.sendMessage({ type: 'COSMETIC_BLOCK' }).catch(() => {}); } catch {}
    }
    if (cosmeticReportCount >= COSMETIC_REPORT_CAP) return;
    // Inspect only this newly inserted subtree rather than re-scanning the whole page.
    let candidates = [];
    for (const selector of selectors) {
      try { candidates = node.querySelectorAll(selector); } catch { continue; }
      for (const element of candidates) {
        if (cosmeticReportCount >= COSMETIC_REPORT_CAP) return;
        if (reportedNodes.has(element) || element.closest?.('[data-sentinel-shield-badge]')) continue;
        reportedNodes.add(element);
        cosmeticReportCount++;
        try { browser.runtime.sendMessage({ type: 'COSMETIC_BLOCK' }).catch(() => {}); } catch {}
      }
    }
  }
  function startCosmeticObserver() {
    const root = document.documentElement;
    if (!root || observer) return;
    observer = new MutationObserver((records) => {
      if (!settings.cosmeticFiltering || !settings.enabled || !settings.blockAds) return;
      for (const record of records) {
        for (const node of record.addedNodes || []) {
          if (node.nodeType === Node.ELEMENT_NODE) reportCosmeticNode(node);
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
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
      startCosmeticObserver();
      if (document.documentElement) reportCosmeticNode(document.documentElement);
    } catch { /* Extension storage and style failures should never disrupt page loading. */ }
  }
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings?.newValue) {
      settings = { ...settings, ...changes.settings.newValue };
      applyStyles();
      if (settings.cosmeticFiltering && settings.enabled && settings.blockAds && document.documentElement) reportCosmeticNode(document.documentElement);
    }
  });
  initialize();
})();
