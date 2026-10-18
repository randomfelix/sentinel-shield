/* Tiny smoke test with mocked WebExtension APIs; not a substitute for Firefox testing. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const store = { filterEngineRevision: 'compat-2026-10-v1', remoteFilterCache: { easyprivacy: { hosts: ['typeform.com', 'cdn.jsdelivr.net'], exceptions: [], scoped: [] } } };
let requestListener;
let headersListener;
let messageListener;
let installListener;
const changedListeners = [];
const tabUpdates = [];
const browser = {
  tabs: {
    async update(tabId, details) { tabUpdates.push({ tabId, ...details }); return { id: tabId, ...details }; },
    async goBack(tabId) { return { id: tabId }; },
    async query() { return [{ id: 1, url: 'https://example.org/' }]; }
  },
  runtime: {
    getURL: (name) => `sentinel://${name}`,
    onMessage: { addListener: (fn) => { messageListener = fn; } },
    onInstalled: { addListener: (fn) => { installListener = fn; } }
  },
  webRequest: { onBeforeRequest: { addListener: (fn) => { requestListener = fn; } }, onHeadersReceived: { addListener: (fn) => { headersListener = fn; } } },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  storage: {
    local: {
      async get(keys) {
        if (keys === null) return { ...store };
        if (typeof keys === 'string') return { [keys]: store[keys] };
        const out = {};
        for (const k of (keys || [])) if (k in store) out[k] = store[k];
        return out;
      },
      async set(obj) { Object.assign(store, obj); for (const fn of changedListeners) fn(Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { newValue: v }])), 'local'); }
    },
    onChanged: { addListener: (fn) => changedListeners.push(fn) }
  }
};
async function fakeFetch(url) {
  const name = String(url).replace('sentinel://', '');
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  return { ok: true, status: 200, text: async () => text };
}
const context = { browser, fetch: fakeFetch, URL, structuredClone, Set, Map, Date, Math, String, Number, Object, Array, RegExp, console, setTimeout, clearTimeout, Promise };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await wait(50);
  if (!requestListener || !headersListener || !messageListener) throw new Error('Listeners did not register');
  if (!context.firstPartyEnough('api.example.com', 'www.example.com')) throw new Error('Sibling subdomains should be treated as first-party');
  if (!context.firstPartyEnough('api.example.co.uk', 'www.example.co.uk')) throw new Error('Sibling subdomains under a common multi-label suffix should be treated as first-party');
  if (context.firstPartyEnough('example.com', 'example.org')) throw new Error('Unrelated registrable domains must remain third-party');
  const parsedNegatedRule = context.parseABP('||not-a-script.example^$~script\n||tracker.example^$script,third-party', 'trackers');
  if (parsedNegatedRule.scoped.length !== 1 || parsedNegatedRule.scoped[0].host !== 'tracker.example') throw new Error('Unsupported negated filter options must be skipped rather than broadened');
  const state = await messageListener({ type: 'GET_STATE' });
  if (!state.filterCount || !state.settings.enabled) throw new Error('Defaults or local filters did not load');
  const blocked = requestListener({ url: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', type: 'script', tabId: 1, documentUrl: 'https://news.example.com/' });
  if (!blocked.cancel) throw new Error('Expected ad host to be blocked');
  const trackerBlocked = requestListener({ url: 'https://www.google-analytics.com/analytics.js', type: 'script', tabId: 1, documentUrl: 'https://publisher.example/' });
  if (!trackerBlocked.cancel) throw new Error('Expected a known third-party analytics script to be blocked');
  const firstPartyAnalytics = requestListener({ url: 'https://publisher.example/analytics.js', type: 'script', tabId: 1, documentUrl: 'https://publisher.example/' });
  if (firstPartyAnalytics.cancel) throw new Error('First-party scripts must not be blocked by generic URL rules');
  const trackerImage = requestListener({ url: 'https://www.google-analytics.com/logo.png', type: 'image', tabId: 1, documentUrl: 'https://publisher.example/' });
  if (trackerImage.cancel) throw new Error('Tracker-labelled hosts should not have ordinary image assets blocked');
  const functionalWidget = requestListener({ url: 'https://embed.typeform.com/forms.js', type: 'script', tabId: 1, documentUrl: 'https://publisher.example/' });
  if (functionalWidget.cancel) throw new Error('Compatibility allowlist should preserve common user-facing widgets');
  const functionalCdn = requestListener({ url: 'https://cdn.jsdelivr.net/npm/example/lib.js', type: 'script', tabId: 1, documentUrl: 'https://publisher.example/' });
  if (functionalCdn.cancel) throw new Error('Compatibility allowlist should preserve commonly used CDNs even if an old cache includes them');
  const trackerMainFrame = requestListener({ url: 'https://google-analytics.com/', type: 'main_frame', tabId: 1 });
  if (trackerMainFrame.cancel) throw new Error('Ad/tracker lists must not block top-level pages');
  const localHttp = headersListener({ url: 'http://127.0.0.1:3000/', type: 'main_frame', tabId: 11, statusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }] });
  if (localHttp.cancel) throw new Error('Local development addresses should not show HTTP warnings');
  const untouched = requestListener({ url: 'https://assets.example.org/app.js', type: 'script', tabId: 1, documentUrl: 'https://example.org/' });
  if (untouched.cancel) throw new Error('Expected unknown resource not to be blocked by balanced mode');
  await messageListener({ type: 'ADD_BLOCK', host: 'custom.bad-example.test' });
  const custom = requestListener({ url: 'https://custom.bad-example.test/payload.js', type: 'script', tabId: 2, documentUrl: 'https://example.org/' });
  if (!custom.cancel) throw new Error('Custom block rule did not apply');
  await messageListener({ type: 'SITE_TOGGLE', host: 'example.org', active: false });
  const paused = requestListener({ url: 'https://pagead2.googlesyndication.com/a.js', type: 'script', tabId: 3, documentUrl: 'https://sub.example.org/' });
  if (paused.cancel) throw new Error('Site bypass did not apply to subdomain page');
  // HTTP warning must only appear for a final unencrypted response, not a redirect to HTTPS.
  const httpRequest = requestListener({ url: 'http://plain.example.net/', type: 'main_frame', tabId: 4 });
  if (httpRequest.cancel) throw new Error('HTTP requests must wait for response headers before warning');
  const upgradedHttp = headersListener({ url: 'http://plain.example.net/', type: 'main_frame', tabId: 4, statusCode: 301, responseHeaders: [{ name: 'Location', value: 'https://plain.example.net/' }] });
  if (upgradedHttp.cancel) throw new Error('HTTP→HTTPS redirect should not show a warning');
  const httpWarning = headersListener({ url: 'http://plain.example.net/', type: 'main_frame', tabId: 4, statusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }] });
  if (!httpWarning.cancel) throw new Error('Final HTTP page should be held until the warning choice');
  const httpWarningTab = tabUpdates.find((update) => update.tabId === 4 && String(update.url).includes('warning.html'));
  if (!httpWarningTab) throw new Error('Expected an HTTP warning interstitial');
  const httpWarningId = new URL(httpWarningTab.url).searchParams.get('id');
  const httpWarningData = await messageListener({ type: 'GET_WARNING_DATA', warningId: httpWarningId });
  if (httpWarningData.kind !== 'http' || httpWarningData.destination !== 'http://plain.example.net/') throw new Error('HTTP warning data was not stored safely');
  await messageListener({ type: 'WARNING_CONTINUE', tabId: 4, warningId: httpWarningId });
  const allowedHttpStart = requestListener({ url: 'http://plain.example.net/', type: 'main_frame', tabId: 4 });
  if (allowedHttpStart.cancel || allowedHttpStart.redirectUrl) throw new Error('HTTP consent should allow a single navigation request');
  const allowedHttpHeaders = headersListener({ url: 'http://plain.example.net/', type: 'main_frame', tabId: 4, statusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }] });
  if (allowedHttpHeaders.cancel || allowedHttpHeaders.redirectUrl) throw new Error('HTTP consent should bypass the final-response warning once');

  const malwareSite = requestListener({ url: 'https://coinhive.com/', type: 'main_frame', tabId: 5 });
  if (!malwareSite.cancel) throw new Error('Known-malware main-frame should be held until the warning choice');
  const malwareSiteTab = tabUpdates.find((update) => update.tabId === 5 && String(update.url).includes('warning.html'));
  if (!malwareSiteTab) throw new Error('Expected a known-malware site warning');
  const malwareSiteId = new URL(malwareSiteTab.url).searchParams.get('id');
  await messageListener({ type: 'WARNING_CONTINUE', tabId: 5, warningId: malwareSiteId });
  const malwareSiteAllowed = requestListener({ url: 'https://coinhive.com/', type: 'main_frame', tabId: 5 });
  if (malwareSiteAllowed.cancel || malwareSiteAllowed.redirectUrl) throw new Error('Malware-site consent should allow the main-frame navigation once');

  const malwareScript = requestListener({ url: 'https://coinhive.com/miner.js', type: 'script', tabId: 6, documentUrl: 'https://article.example.net/' });
  if (!malwareScript.cancel) throw new Error('Known malicious script request should be blocked');
  await wait(10);
  const scriptWarningTab = tabUpdates.find((update) => update.tabId === 6 && String(update.url).includes('warning.html'));
  if (!scriptWarningTab) throw new Error('Expected a script warning to open for the affected tab');
  const scriptWarningId = new URL(scriptWarningTab.url).searchParams.get('id');
  const scriptWarningData = await messageListener({ type: 'GET_WARNING_DATA', warningId: scriptWarningId });
  if (scriptWarningData.kind !== 'malware-script') throw new Error('Expected a stored malicious-script warning');
  const warningsBeforeContinue = tabUpdates.filter((update) => String(update.url).includes('warning.html')).length;
  await messageListener({ type: 'WARNING_CONTINUE', tabId: 6, warningId: scriptWarningId });
  const stillBlockedScript = requestListener({ url: 'https://coinhive.com/miner.js', type: 'script', tabId: 6, documentUrl: 'https://article.example.net/' });
  if (!stillBlockedScript.cancel) throw new Error('Continuing should not permit the malicious script itself');
  await wait(10);
  if (tabUpdates.filter((update) => String(update.url).includes('warning.html')).length !== warningsBeforeContinue) throw new Error('Continuing should suppress repeated warning loops for the same site/script host');

  const stateAfter = await messageListener({ type: 'GET_STATE', host: 'example.org' });
  if ((stateAfter.stats.bySite['example.org'] || 0) < 1) throw new Error('Per-site block counter did not increment');
  await messageListener({ type: 'SET_LANGUAGE', language: 'en' });
  const finalState = await messageListener({ type: 'GET_STATE' });
  if (finalState.settings.language !== 'en') throw new Error('Language preference was not saved');
  console.log(JSON.stringify({ filterCount: state.filterCount, blockedTotal: finalState.stats.blockedTotal, logs: finalState.recent.length, customBlockCount: finalState.settings.customBlockedHosts.length, siteCounter: stateAfter.siteBlockedCount, warningRedirects: warningsBeforeContinue, checks: 'passed' }, null, 2));
})().catch((e) => { console.error(e); process.exitCode = 1; });
