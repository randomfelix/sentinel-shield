/* Verifies upgrade from the early 0.2.0 remote filter cache. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const store = {
  settings: { enabled: true, language: 'en', customBlockedHosts: ['custom.example.test'] },
  remoteFilterCache: { easyprivacy: { hosts: ['example.test'], exceptions: [], scoped: [{ host: 'wide-rule.example', path: '', types: [], thirdParty: false, include: [], exclude: [], important: false }] } },
  sourceStatus: { easyprivacy: { ok: true, updatedAt: 123 } },
  requestLog: [{ at: 1, pageHost: 'example.org', targetHost: 'tracker.example', type: 'script', category: 'trackers' }],
  stats: { day: '2026-10-17', blockedTotal: 9, byCategory: { ads: 3, trackers: 6 }, bySite: { 'example.org': 9 } }
};
const changed = [];
const browser = {
  tabs: { async update(id, details) { return { id, ...details }; }, async goBack() { return {}; }, async query() { return []; } },
  runtime: { getURL: (name) => `sentinel://${name}`, onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
  webRequest: { onBeforeRequest: { addListener() {} }, onHeadersReceived: { addListener() {} } },
  action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
  storage: {
    local: {
      async get(keys) {
        if (keys === null) return { ...store };
        if (typeof keys === 'string') return { [keys]: store[keys] };
        const out = {}; for (const key of (keys || [])) if (key in store) out[key] = store[key]; return out;
      },
      async set(values) { Object.assign(store, values); for (const fn of changed) fn(Object.fromEntries(Object.entries(values).map(([k,v]) => [k, { newValue: v }])), 'local'); }
    },
    onChanged: { addListener(fn) { changed.push(fn); } }
  }
};
async function fakeFetch(url) {
  const name = String(url).replace('sentinel://', '');
  return { ok: true, status: 200, async text() { return fs.readFileSync(path.join(root, name), 'utf8'); } };
}
const context = { browser, fetch: fakeFetch, URL, structuredClone, Set, Map, Date, Math, String, Number, Object, Array, RegExp, console, setTimeout, clearTimeout, Promise };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context);
setTimeout(() => {
  try {
    if (store.filterEngineRevision !== 'compat-2026-10-v2') throw new Error('Engine revision marker not saved');
    if (Object.keys(store.remoteFilterCache || {}).length) throw new Error('Incompatible old remote cache was not cleared');
    if (Object.keys(store.sourceStatus || {}).length) throw new Error('Old source status should reset after cache migration');
    if (store.settings.language !== 'en' || store.settings.customBlockedHosts[0] !== 'custom.example.test') throw new Error('User settings should be preserved');
    if (store.stats.blockedTotal !== 9 || store.requestLog.length !== 1) throw new Error('Counters and request history should be preserved');
    console.log(JSON.stringify({ migration: 'passed', settingsPreserved: true, statsPreserved: true, oldFilterCacheCleared: true }, null, 2));
  } catch (error) { console.error(error); process.exitCode = 1; }
}, 40);
