/* Sentinel Shield 0.2.2 — best-effort YouTube ad UI/video handling.
 * YouTube serves regular video and some ad segments from shared delivery domains, so this
 * script never blocks googlevideo wholesale. It hides known ad slots and uses available
 * skip controls / seek-to-end only while YouTube marks the player as showing an ad.
 */
'use strict';
(() => {
  const STYLE_ID = 'sentinel-shield-youtube-ad-layer';
  const AD_SELECTORS = [
    '#player-ads', '#masthead-ad', 'ytd-ad-slot-renderer',
    'ytd-display-ad-renderer', 'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-sparkles-text-search-renderer', 'ytd-promoted-video-renderer',
    'ytd-in-feed-ad-layout-renderer', 'ytd-banner-promo-renderer',
    'ytd-companion-slot-renderer', 'ytd-action-companion-ad-renderer',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot', '.ytp-ad-image-overlay',
    '.ytp-ad-text-overlay', '.ytp-ad-action-interstitial',
    '.ytp-ad-progress-list',
    'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)'
  ];
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button', '.ytp-ad-skip-button-container button',
    'button[id*="skip-button"]'
  ];
  const CLOSE_SELECTORS = [
    '.ytp-ad-overlay-close-button', '.ytp-ad-overlay-close-container button',
    'button[aria-label*="Close ad" i]', 'button[aria-label*="Close overlay" i]'
  ];
  let settings = { enabled: true, blockAds: true, cosmeticFiltering: true };
  let styleNode = null;
  let observer = null;
  let lastAdActionAt = 0;
  let workQueued = false;

  function active() {
    return settings.enabled !== false && settings.blockAds !== false;
  }

  function updateStyle() {
    const shouldStyle = active() && settings.cosmeticFiltering !== false && !!document.documentElement;
    if (!shouldStyle) {
      if (styleNode?.isConnected) styleNode.remove();
      styleNode = null;
      return;
    }
    // A MutationObserver watches the document, including this stylesheet.
    // Keep an attached style node instead of replacing it on every mutation.
    if (styleNode?.isConnected) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.dataset.sentinelShield = 'youtube-ads';
    style.textContent = `${AD_SELECTORS.join(',\n')} { display:none !important; visibility:hidden !important; pointer-events:none !important; }`;
    (document.head || document.documentElement).appendChild(style);
    styleNode = style;
  }

  function queryFirst(selectors) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) return element;
      } catch { /* A future YouTube markup change should not break the page. */ }
    }
    return null;
  }

  function clickVisible(selectors) {
    for (const selector of selectors) {
      let elements = [];
      try { elements = document.querySelectorAll(selector); } catch { continue; }
      for (const element of elements) {
        const rect = element.getBoundingClientRect?.();
        const visible = rect && rect.width > 0 && rect.height > 0 &&
          getComputedStyle(element).visibility !== 'hidden' &&
          getComputedStyle(element).display !== 'none';
        if (visible && !element.disabled) {
          try { element.click(); return true; } catch { /* Ignore unavailable control. */ }
        }
      }
    }
    return false;
  }

  function handleVideoAd() {
    if (!active()) return;
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (!player || !(player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
      lastAdActionAt = 0;
      return;
    }
    const now = Date.now();
    // Do not hammer the player every time YouTube's DOM changes.
    if (now - lastAdActionAt < 500) return;
    lastAdActionAt = now;

    if (clickVisible(SKIP_SELECTORS)) return;
    clickVisible(CLOSE_SELECTORS);

    // Some skippable ad creatives expose a seekable video. Only try this after
    // the player itself reports an ad state; never seek normal video playback.
    const video = player.querySelector('video.html5-main-video, video');
    if (video && Number.isFinite(video.duration) && video.duration > 0 && video.duration < 180 &&
        video.currentTime < video.duration - 0.35) {
      try { video.currentTime = Math.max(0, video.duration - 0.15); } catch { /* Not seekable. */ }
    }
  }

  function run() {
    workQueued = false;
    if (!document.documentElement) return;
    updateStyle();
    handleVideoAd();
  }

  function schedule() {
    if (workQueued) return;
    workQueued = true;
    queueMicrotask(run);
  }

  async function init() {
    try {
      const stored = await browser.storage.local.get('settings');
      settings = { ...settings, ...(stored.settings || {}) };
    } catch { /* Keep conservative enabled defaults if storage is unavailable. */ }
    updateStyle();
    if (document.documentElement && !observer) {
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-label'] });
    } else if (!observer) {
      const rootObserver = new MutationObserver(() => {
        if (!document.documentElement) return;
        rootObserver.disconnect();
        observer = new MutationObserver(schedule);
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-label'] });
        run();
      });
      rootObserver.observe(document, { childList: true, subtree: true });
    }
    document.addEventListener('yt-navigate-finish', schedule, true);
    document.addEventListener('yt-page-data-updated', schedule, true);
    // A lightweight fallback catches ad state changes that don't mutate attributes.
    window.setInterval(handleVideoAd, 900);
    schedule();
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings?.newValue) {
      settings = { ...settings, ...changes.settings.newValue };
      schedule();
    }
  });

  init();
})();
