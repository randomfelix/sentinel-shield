/* Known-source script guard: this catches external script tags on Chrome pages where MV3 has no blocking webRequest callback. */
'use strict';
(() => {
  const reported = new Set();
  let malwareHosts = [];
  let started = false;
  function isBadHost(host) {
    const value = String(host || '').toLowerCase();
    return malwareHosts.some((domain) => value === domain || value.endsWith('.' + domain));
  }
  function inspect(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    const scripts = [];
    if (node instanceof HTMLScriptElement && node.src) scripts.push(node);
    try { for (const script of node.querySelectorAll('script[src]')) scripts.push(script); } catch {}
    for (const script of scripts) {
      let url;
      try { url = new URL(script.src, location.href); } catch { continue; }
      if (!['http:','https:'].includes(url.protocol) || !isBadHost(url.hostname) || reported.has(url.href)) continue;
      reported.add(url.href);
      try { browser.runtime.sendMessage({ type:'MALICIOUS_SCRIPT_DETECTED', source:url.hostname, pageUrl:location.href }).catch(() => {}); } catch {}
    }
  }
  async function init() {
    try {
      const response = await fetch(browser.runtime.getURL('filters/hosts.txt'));
      const text = await response.text();
      malwareHosts = text.split(/\r?\n/).map(line => line.trim()).filter(line => /^malware\|/i.test(line)).map(line => line.split('|')[1].trim().toLowerCase()).filter(Boolean);
    } catch { return; }
    if (!document.documentElement) {
      const ready = new MutationObserver(() => {
        if (!document.documentElement || started) return;
        started = true; ready.disconnect(); observe(); inspect(document.documentElement);
      });
      ready.observe(document, {childList:true,subtree:true});
    } else { started = true; observe(); inspect(document.documentElement); }
  }
  function observe() {
    if (!document.documentElement) return;
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes || []) inspect(node);
    });
    observer.observe(document.documentElement, {childList:true,subtree:true});
  }
  init();
})();
