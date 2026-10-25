/* Sentinel Shield v0.2.4 — conservative YouTube compatibility layer.
 * Intentionally avoids broad parent selectors and never blocks googlevideo.com.
 * Header recovery is a compatibility guard for styles injected by older builds.
 */
'use strict';
(() => {
  const KEY = '__sentinelShieldYoutube024';
  try { window[KEY]?.stop?.(); } catch {}

  const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  const STYLE_ID = 'sentinel-shield-youtube-ad-layer';
  const HIDDEN_ATTR = 'data-sentinel-shield-ad-hidden';

  const AD_SELECTORS = [
    '#player-ads', '#masthead-ad', 'ytd-ad-slot-renderer',
    'ytd-display-ad-renderer', 'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-sparkles-text-search-renderer', 'ytd-promoted-video-renderer',
    'ytd-in-feed-ad-layout-renderer', 'ytd-banner-promo-renderer',
    'ytd-companion-slot-renderer', 'ytd-action-companion-ad-renderer',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot', '.ytp-ad-image-overlay',
    '.ytp-ad-text-overlay', '.ytp-ad-action-interstitial', '.ytp-ad-progress-list'
  ];
  const HEADER_SELECTORS = [
    '#masthead-container', '#masthead', 'ytd-masthead', '#logo',
    'ytd-topbar-logo-renderer', '#search', '#search-form', 'yt-searchbox', 'ytd-searchbox'
  ];
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button', '.ytp-ad-skip-button-container button'
  ];
  const CLOSE_SELECTORS = [
    '.ytp-ad-overlay-close-button', '.ytp-ad-overlay-close-container button',
    'button[aria-label="Close ad"]'
  ];

  let settings = { enabled: true, blockAds: true, cosmeticFiltering: true };
  let stopped = false;
  let scheduled = false;
  let observer = null;
  let timer = null;
  let styleNode = null;
  let lastAdActionAt = 0;
  const hiddenElements = new Set();
  const originalHeaderStyles = new Map();

  const qsa = (selector, root = document) => {
    try { return root.querySelectorAll(selector); } catch { return []; }
  };
  const active = () => settings.enabled !== false && settings.blockAds !== false;
  const cosmeticActive = () => active() && settings.cosmeticFiltering !== false;

  function restoreHeader() {
    for (const selector of HEADER_SELECTORS) {
      for (const el of qsa(selector)) {
        if (!originalHeaderStyles.has(el)) {
          originalHeaderStyles.set(el, {
            display: el.style.getPropertyValue('display'),
            displayPriority: el.style.getPropertyPriority('display'),
            visibility: el.style.getPropertyValue('visibility'),
            visibilityPriority: el.style.getPropertyPriority('visibility'),
            opacity: el.style.getPropertyValue('opacity'),
            opacityPriority: el.style.getPropertyPriority('opacity')
          });
        }
        el.removeAttribute(HIDDEN_ATTR);
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('opacity', '1', 'important');
        if (selector === '#masthead-container') {
          el.style.setProperty('display', 'block', 'important');
        }
      }
    }
  }

  function ensureStyle() {
    if (!document.documentElement) return;
    if (styleNode?.isConnected) return;
    // Clear the older stylesheet ID if the older build injected it.
    document.getElementById('sentinel-shield-youtube-ad-layer')?.remove();
    styleNode = document.createElement('style');
    styleNode.id = STYLE_ID;
    styleNode.dataset.sentinelShield = 'youtube-ads';
    styleNode.textContent = `${AD_SELECTORS.join(',\n')} { display:none !important; visibility:hidden !important; pointer-events:none !important; }\n#masthead-container, #masthead, ytd-masthead, #logo, ytd-topbar-logo-renderer, #search, #search-form, yt-searchbox, ytd-searchbox { visibility:visible !important; opacity:1 !important; }\n#masthead-container { display:block !important; }`;
    (document.head || document.documentElement).appendChild(styleNode);
  }

  function protectedElement(el) {
    if (!(el instanceof Element)) return true;
    if (el.matches('html,body,ytd-app,#content,#page-manager,#primary,#secondary,#masthead-container,#masthead,ytd-masthead')) return true;
    if (el.closest('#masthead-container,#masthead,ytd-masthead')) return true;
    for (const selector of HEADER_SELECTORS) {
      try { if (el.matches(selector) || el.querySelector(selector)) return true; } catch {}
    }
    return false;
  }

  function hideAdElements() {
    if (!cosmeticActive()) {
      for (const el of hiddenElements) if (el.isConnected) el.removeAttribute(HIDDEN_ATTR);
      hiddenElements.clear();
      return;
    }
    ensureStyle();
    // Hide only the explicit ad nodes selected above; never hide a parent row/card.
    for (const selector of AD_SELECTORS) {
      for (const el of qsa(selector)) {
        if (protectedElement(el)) continue;
        el.setAttribute(HIDDEN_ATTR, 'true');
        hiddenElements.add(el);
      }
    }
  }

  function clickVisible(selectors) {
    for (const selector of selectors) {
      for (const el of qsa(selector)) {
        const rect = el.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0 || el.disabled) continue;
        const css = getComputedStyle(el);
        if (css.display === 'none' || css.visibility === 'hidden') continue;
        try { el.click(); return true; } catch {}
      }
    }
    return false;
  }

  function handleVideoAd() {
    if (stopped || !active()) return;
    const player = document.querySelector('#movie_player, .html5-video-player');
    const adShowing = !!player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
    if (!adShowing) { lastAdActionAt = 0; return; }
    const now = Date.now();
    if (now - lastAdActionAt < 900) return;
    lastAdActionAt = now;
    if (clickVisible(SKIP_SELECTORS)) return;
    clickVisible(CLOSE_SELECTORS);
    // Best effort only. Never touches the video unless YouTube explicitly marks an ad.
    const video = player.querySelector('video.html5-main-video, video');
    if (video && Number.isFinite(video.duration) && video.duration > 0 && video.duration < 180 && video.currentTime < video.duration - 0.5) {
      try { video.currentTime = Math.max(0, video.duration - 0.2); } catch {}
    }
  }

  function run() {
    scheduled = false;
    if (stopped || !document.documentElement) return;
    restoreHeader();
    hideAdElements();
    restoreHeader();
    handleVideoAd();
  }
  function schedule() {
    if (stopped || scheduled) return;
    scheduled = true;
    queueMicrotask(run);
  }
  function onSettingsChanged(changes, area) {
    if (area !== 'local' || !changes.settings?.newValue) return;
    settings = { ...settings, ...changes.settings.newValue };
    schedule();
  }
  async function init() {
    if (api?.storage?.local) {
      try { const state = await api.storage.local.get('settings'); settings = { ...settings, ...(state.settings || {}) }; } catch {}
    }
    if (stopped) return;
    if (api?.storage?.onChanged?.addListener) api.storage.onChanged.addListener(onSettingsChanged);
    if (document.documentElement) {
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-label'] });
    } else {
      const firstObserver = new MutationObserver(() => {
        if (!document.documentElement || stopped) return;
        firstObserver.disconnect();
        observer = new MutationObserver(schedule);
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-label'] });
        schedule();
      });
      firstObserver.observe(document, { childList: true, subtree: true });
    }
    document.addEventListener('yt-navigate-finish', schedule, true);
    document.addEventListener('yt-page-data-updated', schedule, true);
    timer = setInterval(() => { restoreHeader(); handleVideoAd(); }, 1000);
    schedule();
  }
  function stop() {
    stopped = true;
    observer?.disconnect(); observer = null;
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.removeEventListener('yt-navigate-finish', schedule, true);
    document.removeEventListener('yt-page-data-updated', schedule, true);
    api?.storage?.onChanged?.removeListener(onSettingsChanged);
    for (const el of hiddenElements) if (el.isConnected) el.removeAttribute(HIDDEN_ATTR);
    hiddenElements.clear();
    styleNode?.remove(); styleNode = null;
    for (const [el, s] of originalHeaderStyles) {
      if (!el.isConnected) continue;
      for (const [prop, value, priority] of [
        ['display', s.display, s.displayPriority], ['visibility', s.visibility, s.visibilityPriority], ['opacity', s.opacity, s.opacityPriority]
      ]) {
        if (value) el.style.setProperty(prop, value, priority);
        else el.style.removeProperty(prop);
      }
    }
    originalHeaderStyles.clear();
    delete window[KEY];
  }

  window[KEY] = { stop };
  init();
})();
