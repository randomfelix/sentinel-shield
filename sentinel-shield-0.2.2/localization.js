/* Local UI translation loader. Translation packs are JSON-only and never execute code. */
'use strict';
(() => {
  const PACKS = { en: 'mods/translate/en.json', 'pt-BR': 'mods/translate/pt-BR.json' };
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  let language = 'en';
  let dictionary = {};
  let ready;
  const sourceTitle = document.title;

  function t(key, values = {}) {
    let result = String(dictionary[key] ?? key);
    for (const [name, value] of Object.entries(values || {})) {
      result = result.replaceAll(`{${name}}`, String(value));
    }
    return result;
  }

  function apply() {
    if (!document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,code,pre,textarea')) continue;
      if (!originalText.has(node)) originalText.set(node, node.nodeValue || '');
      const raw = originalText.get(node);
      const source = raw.trim();
      if (!source || !(source in dictionary)) continue;
      const leading = raw.match(/^\s*/)?.[0] || '';
      const trailing = raw.match(/\s*$/)?.[0] || '';
      node.nodeValue = `${leading}${t(source)}${trailing}`;
    }
    for (const element of document.querySelectorAll('[placeholder],[title],[aria-label]')) {
      for (const attribute of ['placeholder', 'title', 'aria-label']) {
        if (!element.hasAttribute(attribute)) continue;
        let map = originalAttributes.get(element);
        if (!map) { map = {}; originalAttributes.set(element, map); }
        if (!(attribute in map)) map[attribute] = element.getAttribute(attribute) || '';
        const source = map[attribute];
        if (source in dictionary) element.setAttribute(attribute, t(source));
      }
    }
    document.documentElement.lang = language;
    document.title = t(sourceTitle);
  }

  async function setLanguage(nextLanguage) {
    language = PACKS[nextLanguage] ? nextLanguage : 'en';
    try {
      const response = await fetch(browser.runtime.getURL(PACKS[language]));
      if (!response.ok) throw new Error(`Translation pack HTTP ${response.status}`);
      const pack = await response.json();
      if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('Invalid translation JSON');
      dictionary = pack;
    } catch (error) {
      console.warn('[Sentinel] Translation pack could not be loaded', error);
      language = 'en';
      dictionary = {};
    }
    apply();
    return language;
  }

  async function init() {
    if (!ready) {
      ready = (async () => {
        let preferred = 'en';
        try {
          const data = await browser.storage.local.get('settings');
          preferred = data.settings?.language || preferred;
        } catch {}
        await setLanguage(preferred);
      })();
    }
    return ready;
  }

  function relativeTime(ms) {
    const seconds = Math.max(0, Math.floor((Date.now() - Number(ms || 0)) / 1000));
    if (seconds < 60) return t('{count}s ago', { count: seconds });
    if (seconds < 3600) return t('{count}m ago', { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return t('{count}h ago', { count: Math.floor(seconds / 3600) });
    return t('{count}d ago', { count: Math.floor(seconds / 86400) });
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings?.newValue?.language && changes.settings.newValue.language !== language) {
      ready = setLanguage(changes.settings.newValue.language);
    }
  });

  window.SentinelI18n = { t, apply, init, setLanguage, relativeTime, get language() { return language; } };
})();
