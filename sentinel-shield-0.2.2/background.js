/* Sentinel Shield background engine — Firefox WebExtension, Manifest V3. */
'use strict';

const FILTER_ENGINE_REVISION = 'compat-2026-10-v1';
const DEFAULT_LANGUAGE_MIGRATION = '0.2.2';
const DEFAULTS = {
  enabled: true,
  blockAds: true,
  blockTrackers: true,
  blockMalware: true,
  blockAnnoyances: true,
  cosmeticFiltering: true,
  strictThirdPartyScripts: false,
  warnMaliciousScripts: true,
  warnHttp: true,
  language: 'en',
  allowlistDomains: [],
  pausedSites: [],
  customBlockedHosts: [],
  customUrlRules: [],
  customCosmeticSelectors: []
};
const SOURCES = [
  { id: 'community-hosts', label: 'StevenBlack unified hosts', category: 'trackers', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts', kind: 'hosts', note: 'Mixed ad/tracker host feed; applied with compatibility safeguards' },
  { id: 'easylist', label: 'EasyList', category: 'ads', url: 'https://easylist.to/easylist/easylist.txt', kind: 'abp', note: 'Advertising and ad delivery filters' },
  { id: 'easyprivacy', label: 'EasyPrivacy', category: 'trackers', url: 'https://easylist.to/easylist/easyprivacy.txt', kind: 'abp', note: 'Tracking and analytics filters' },
  { id: 'fanboy-annoyance', label: "Fanboy's Annoyance List", category: 'annoyances', url: 'https://easylist-downloads.adblockplus.org/fanboy-annoyance.txt', kind: 'abp', note: 'Popup, in-page annoyance, social, and notification filters (supported subset)' }
];
const CATEGORY_SETTING = { ads: 'blockAds', trackers: 'blockTrackers', malware: 'blockMalware', annoyances: 'blockAnnoyances' };
const RESOURCE_TYPES = {
  script: 'script', image: 'image', stylesheet: 'stylesheet', xmlhttprequest: 'xmlhttprequest',
  sub_frame: 'subdocument', main_frame: 'document', object: 'object', ping: 'ping', media: 'media',
  font: 'font', websocket: 'other', other: 'other'
};

// Small fallback list for common multi-label public suffixes. Firefox does not
// expose the Public Suffix List to extensions, so this intentionally favors
// conservative first-party grouping over claiming a complete PSL implementation.
const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'net.uk', 'com.au', 'net.au', 'org.au',
  'edu.au', 'gov.au', 'co.nz', 'net.nz', 'org.nz', 'co.br', 'com.br', 'net.br',
  'org.br', 'gov.br', 'edu.br', 'com.cn', 'net.cn', 'org.cn', 'com.hk', 'com.sg',
  'com.mx', 'com.ar', 'com.tr', 'co.in', 'firm.in', 'net.in', 'org.in', 'co.jp',
  'co.kr', 'co.za', 'com.tw', 'com.my', 'com.ph', 'com.vn', 'com.pk', 'com.ng',
  // Common multi-tenant hosting suffixes (separate customers are separate sites).
  'github.io', 'gitlab.io', 'blogspot.com', 'appspot.com', 'pages.dev', 'workers.dev',
  'vercel.app', 'netlify.app', 'herokuapp.com', 'surge.sh', 'web.app', 'firebaseapp.com',
  'azurewebsites.net', 'cloudapp.net', 'cloudfront.net'
]);
function registrableDomain(host) {
  const value = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  const labels = value.split('.').filter(Boolean);
  if (labels.length < 2 || /^\d+$/.test(labels[0])) return value;
  const lastTwo = labels.slice(-2).join('.');
  return MULTI_LABEL_SUFFIXES.has(lastTwo) && labels.length >= 3 ? labels.slice(-3).join('.') : lastTwo;
}

// Compatibility guard: these hosts provide user-facing widgets, forms, chat,
// push, reviews, feature flags, payments/risk checks, or transactional delivery.
// Some broad third-party filter lists occasionally classify them as trackers.
// Sentinel intentionally does not block them by default because doing so often
// breaks sign-in, checkout, support chat, embedded forms, or application startup.
const COMPATIBILITY_HOSTS = new Set([
  'typeform.com', 'intercom.io', 'intercomcdn.com', 'crisp.chat', 'tawk.to',
  'zdassets.com', 'freshchat.com', 'genesys.com', 'drift.com', 'onesignal.com',
  'pushwoosh.com', 'clevertap.com', 'webengage.com', 'moengage.com', 'braze.com',
  'appboy.com', 'customer.io', 'qualtrics.com', 'medallia.com', 'survicate.com',
  'trustpilot.com', 'yotpo.com', 'bazaarvoice.com', 'powerreviews.com', 'reviews.io',
  'judge.me', 'stamped.io', 'okendo.io', 'loox.io', 'rechargepayments.com',
  'riskified.com', 'forter.com', 'sift.com', 'fingerprint.com', 'fingerprintjs.com',
  'sendgrid.net', 'mandrillapp.com', 'mailgun.org', 'postmarkapp.com',
  'sparkpostmail.com', 'list-manage.com', 'pendo.io', 'cdn.pendo.io', 'appcues.com',
  'launchdarkly.com', 'split.io', 'statsig.com', 'growthbook.io', 'featureassets.org',
  'appcenter.ms', 'salesloft.com', 'outreach.io', 'apollo.io', 'clearbit.com',
  'zoominfo.com', 'branch.io', 'app.link', 'adjust.com', 'kochava.com', 'appsflyer.com',
  'addthis.com', 'sharethis.com',
  // Shared CDNs, identity platforms, and payment providers should not be caught
  // by a broad community list just because they also emit telemetry.
  'google.com', 'googleapis.com', 'gstatic.com', 'googleusercontent.com',
  'youtube.com', 'googlevideo.com', 'microsoft.com', 'microsoftonline.com',
  'office.com', 'live.com', 'apple.com', 'icloud.com', 'amazon.com',
  'amazonaws.com', 'cloudfront.net', 'akamaized.net', 'akamaihd.net', 'fastly.net',
  'jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'cloudflare.com',
  'paypal.com', 'paypalobjects.com', 'stripe.com', 'checkout.com', 'adyen.com',
  'braintreegateway.com', 'squareup.com', 'shopify.com', 'shopifycdn.com',
  'woocommerce.com', 'wordpress.com', 'wp.com'
]);
const AD_RESOURCE_TYPES = new Set(['script', 'image', 'stylesheet', 'xmlhttprequest', 'sub_frame', 'ping', 'media', 'object', 'other']);
const TRACKER_RESOURCE_TYPES = new Set(['script', 'xmlhttprequest', 'ping', 'other']);
const TRACKING_PIXEL_URL = /(?:pixel|tracking|beacon|collect)[^/?#]*\.(?:gif|png|jpe?g)(?:[?#]|$)|\/(?:collect|pixel|beacon)(?:[/?#]|$)/i;
const ANNOYANCE_RESOURCE_TYPES = new Set(['main_frame', 'script', 'image', 'sub_frame', 'xmlhttprequest', 'ping']);

function categoryAllowsResource(category, type, url = '') {
  if (category === 'malware') return true;
  if (category === 'ads') return AD_RESOURCE_TYPES.has(type);
  if (category === 'trackers') {
    if (TRACKER_RESOURCE_TYPES.has(type)) return true;
    // Allow known pixel patterns only; tracker-labelled hosts may also serve assets.
    return type === 'image' && TRACKING_PIXEL_URL.test(url);
  }
  if (category === 'annoyances') return ANNOYANCE_RESOURCE_TYPES.has(type);
  return false;
}
function isCompatibilityHost(host) {
  return !!hostMatchesSet(host, COMPATIBILITY_HOSTS);
}
function isLocalOrPrivateHost(host) {
  if (!host) return false;
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local') || normalized === '::1') return true;
  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 0);
}

let settings = structuredClone(DEFAULTS);
let domainRules = { ads: new Set(), trackers: new Set(), malware: new Set(), annoyances: new Set() };
let knownMalwareHosts = new Set();
let popupNavigationHosts = new Set();
let exceptions = { ads: new Set(), trackers: new Set(), malware: new Set(), annoyances: new Set() };
let scopedRules = { ads: [], trackers: [], malware: [], annoyances: [] };
let scopedRuleIndex = { ads: new Map(), trackers: new Map(), malware: new Map(), annoyances: new Map() };
let urlRules = [];
let cosmeticSelectors = [];
let requestLog = [];
let stats = { day: localDayKey(), blockedTotal: 0, byCategory: { ads: 0, trackers: 0, malware: 0, annoyances: 0, scripts: 0 }, bySite: {}, lastSavedAt: 0 };
const navigationBypasses = new Map();
const scriptWarningSuppressions = new Map();
const pendingWarnings = new Map();
const activeScriptWarnings = new Map();
let sourceStatus = {};
let remoteCache = {};
let customBlockSet = new Set();
let flushTimer = null;

function validHost(value) {
  const host = String(value || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!host || host.length > 253 || host.includes('/') || host.includes(':') || host.includes(' ') || !host.includes('.')) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
  return host;
}
function hostnameFrom(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return ''; }
}
function isDomainOrSubdomain(host, domain) {
  return !!host && !!domain && (host === domain || host.endsWith('.' + domain));
}
function isKnownMalwareHost(host) {
  return !!hostMatchesSet(host, knownMalwareHosts);
}
function hostMatchesSet(host, set) {
  if (!host || !set) return null;
  let cursor = host;
  while (cursor) {
    if (set.has(cursor)) return cursor;
    const dot = cursor.indexOf('.');
    if (dot < 0) break;
    cursor = cursor.slice(dot + 1);
  }
  return null;
}
function activeCategory(category) {
  const key = CATEGORY_SETTING[category];
  return key ? settings[key] !== false : false;
}
function firstPartyEnough(a, b) {
  if (!a || !b) return false;
  const left = String(a).toLowerCase().replace(/^\[|\]$/g, '');
  const right = String(b).toLowerCase().replace(/^\[|\]$/g, '');
  if (left === right || left.endsWith('.' + right) || right.endsWith('.' + left)) return true;
  // Treat sibling subdomains of a common registrable domain as first-party.
  // This avoids blocking app/API/CDN assets belonging to the same website.
  return registrableDomain(left) === registrableDomain(right) && !isIpLiteral(left) && !isIpLiteral(right);
}
function isIpLiteral(host) {
  return host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}
function domainOptionMatches(pageHost, include, exclude) {
  if (include?.length && !include.some((d) => isDomainOrSubdomain(pageHost, d))) return false;
  if (exclude?.some((d) => isDomainOrSubdomain(pageHost, d))) return false;
  return true;
}

function parseHostList(text, fallbackCategory) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const pipe = line.indexOf('|');
    if (pipe > 0) {
      const category = line.slice(0, pipe).trim().toLowerCase();
      const host = validHost(line.slice(pipe + 1));
      if (host && ['ads', 'trackers', 'malware', 'annoyances'].includes(category)) out.push({ category, host });
      continue;
    }
    const fields = line.split(/\s+/);
    if (fields.length >= 2 && /^(?:0\.0\.0\.0|127\.0\.0\.1|::1|0:0:0:0:0:0:0:1)$/i.test(fields[0])) {
      const host = validHost(fields[1]);
      if (host && !/^(?:localhost|localhost\.localdomain|broadcasthost|local)$/i.test(host)) out.push({ category: fallbackCategory || 'malware', host });
    } else {
      const host = validHost(fields[0]);
      if (host) out.push({ category: fallbackCategory || 'malware', host });
    }
  }
  return out;
}

function parseABP(text, category) {
  const hosts = [];
  const excepts = [];
  const scoped = [];
  const maxLines = 500000;
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('#') || line.startsWith('/') || line.startsWith('##')) continue;
    if (line.startsWith('@@')) {
      const m = line.match(/^@@\|\|([a-z0-9.-]+)(?:\^|\/|\$|$)/i);
      if (m) { const host = validHost(m[1]); if (host) excepts.push(host); }
      continue;
    }
    if (!line.startsWith('||')) continue;
    const m = line.match(/^\|\|([a-z0-9.-]+)(\^|\/([^$]+)?|\$|$)(?:\$([^$]+))?$/i);
    if (!m) continue;
    const host = validHost(m[1]);
    if (!host) continue;
    const rest = m[2] || '';
    const pathPart = rest.startsWith('/') ? '/' + String(m[3] || '').split('^')[0] : '';
    const optionsText = m[4] || '';
    const options = optionsText.split(',').filter(Boolean);
    // This subset parser cannot safely evaluate negated type constraints (for
    // example $~script). Ignoring the negation would broaden the rule and block
    // legitimate resources, so skip that rule rather than guessing.
    if (options.some((option) => option.startsWith('~')) || options.includes('badfilter') || options.includes('match-case')) continue;
    if (!pathPart && !options.length) { hosts.push(host); continue; }
    const types = options.filter((x) => !x.startsWith('domain=') && !x.startsWith('~') && !['third-party', 'match-case', 'important', 'badfilter'].includes(x));
    let include = [], exclude = [];
    const domainOpt = options.find((x) => x.startsWith('domain='));
    if (domainOpt) {
      for (const piece of domainOpt.slice(7).split('|')) {
        if (!piece) continue;
        const isExclude = piece.startsWith('~');
        const d = validHost(isExclude ? piece.slice(1) : piece);
        if (d) (isExclude ? exclude : include).push(d);
      }
    }
    scoped.push({ host, path: pathPart || '', types, thirdParty: options.includes('third-party'), include, exclude, important: options.includes('important') });
  }
  return { hosts: [...new Set(hosts)], excepts: [...new Set(excepts)], scoped };
}

function installDomainRules(items, category) {
  if (!domainRules[category]) return;
  for (const item of items || []) {
    const host = typeof item === 'string' ? validHost(item) : validHost(item.host);
    if (host) domainRules[category].add(host);
  }
}
function indexScopedRules(category, rules) {
  if (!scopedRules[category] || !Array.isArray(rules)) return;
  for (const rule of rules) {
    if (!rule || !validHost(rule.host)) continue;
    scopedRules[category].push(rule);
    if (!scopedRuleIndex[category].has(rule.host)) scopedRuleIndex[category].set(rule.host, []);
    scopedRuleIndex[category].get(rule.host).push(rule);
  }
}
function scopedRulesForHost(host, category) {
  const result = [];
  let cursor = host;
  while (cursor) {
    const rules = scopedRuleIndex[category].get(cursor);
    if (rules) result.push(...rules);
    const dot = cursor.indexOf('.');
    if (dot < 0) break;
    cursor = cursor.slice(dot + 1);
  }
  return result;
}

function compileLocalFilters() {
  domainRules = { ads: new Set(), trackers: new Set(), malware: new Set(), annoyances: new Set() };
  knownMalwareHosts = new Set();
  popupNavigationHosts = new Set();
  exceptions = { ads: new Set(), trackers: new Set(), malware: new Set(), annoyances: new Set() };
  scopedRules = { ads: [], trackers: [], malware: [], annoyances: [] };
  scopedRuleIndex = { ads: new Map(), trackers: new Map(), malware: new Map(), annoyances: new Map() };
  urlRules = [];
  cosmeticSelectors = [];
  return Promise.all([
    fetch(browser.runtime.getURL('filters/hosts.txt')).then((r) => r.text()),
    fetch(browser.runtime.getURL('filters/rules.txt')).then((r) => r.text()),
    fetch(browser.runtime.getURL('filters/cosmetic.txt')).then((r) => r.text())
  ]).then(([hostText, ruleText, cosmeticText]) => {
    const entries = parseHostList(hostText, 'malware');
    for (const entry of entries) {
      domainRules[entry.category].add(entry.host);
      // Only curated bundled annoyance hosts may be blocked as main-frame
      // popup/pop-under destinations. A downloaded filter list must not turn
      // an arbitrary host-only rule into a full-site navigation block.
      if (entry.category === 'annoyances') popupNavigationHosts.add(entry.host);
      // Only the hand-maintained malware entries trigger the scary interstitial.
      // The unified community hosts feed also contains ads and trackers.
      if (entry.category === 'malware') knownMalwareHosts.add(entry.host);
    }
    for (const line of ruleText.split(/\r?\n/)) {
      const m = line.trim().match(/^url\|(ads|trackers|malware|annoyances)\|(.+)$/i);
      if (m && m[2].length >= 4) urlRules.push({ category: m[1].toLowerCase(), value: m[2].toLowerCase() });
    }
    cosmeticSelectors = cosmeticText.split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#') && x.length < 300);
  }).catch((err) => console.error('[Sentinel] Could not load packaged filters', err));
}

function categoryEnabled(category) {
  return activeCategory(category);
}
function checkDomainRules(host, pageHost, type, currentRequestUrl) {
  // Never let ad/tracker lists block an entire top-level page. First-party
  // assets are also exempt from ordinary ad/tracker domains to protect site UX.
  for (const category of Object.keys(domainRules)) {
    if (!categoryEnabled(category) || !categoryAllowsResource(category, type, currentRequestUrl)) continue;
    if (category !== 'malware') {
      // A main-frame request has the destination as its pageHost. For the
      // narrow, hand-maintained annoyance category, still evaluate that target
      // so known pop-under/ad destinations can be stopped before navigation.
      const knownAnnoyanceNavigation = category === 'annoyances' && type === 'main_frame' && !!hostMatchesSet(host, popupNavigationHosts);
      if (!pageHost || (!knownAnnoyanceNavigation && firstPartyEnough(host, pageHost)) || isCompatibilityHost(host)) continue;
    }
    if (hostMatchesSet(host, exceptions[category])) continue;
    const found = hostMatchesSet(host, domainRules[category]);
    if (found) return { category, rule: found, reason: `${category} domain list` };
  }
  // Some upstream ABP rules have type, third-party, path, or site scoping.
  // Apply the same compatibility policy to this supported subset.
  for (const category of Object.keys(scopedRules)) {
    if (!categoryEnabled(category) || !categoryAllowsResource(category, type, currentRequestUrl)) continue;
    if (hostMatchesSet(host, exceptions[category])) continue;
    if (category !== 'malware' && (!pageHost || firstPartyEnough(host, pageHost) || isCompatibilityHost(host))) continue;
    for (const rule of scopedRulesForHost(host, category)) {
      if (!isDomainOrSubdomain(host, rule.host)) continue;
      if (rule.types.length && !rule.types.includes(RESOURCE_TYPES[type] || 'other')) continue;
      if (rule.thirdParty && firstPartyEnough(host, pageHost)) continue;
      if (!domainOptionMatches(pageHost, rule.include, rule.exclude)) continue;
      if (rule.path && !safeUrlPathHas(currentRequestUrl, host, rule.host, rule.path)) continue;
      return { category, rule: rule.host + (rule.path || ''), reason: `${category} filter rule` };
    }
  }
  return null;
}

function safeUrlPathHas(url, host, ruleHost, rulePath) {
  if (!isDomainOrSubdomain(host, ruleHost) || !rulePath) return false;
  try {
    const parsed = new URL(url);
    const target = parsed.pathname + parsed.search;
    const normalized = rulePath.replace(/\^/g, '/').replace(/\*/g, '');
    return target.includes(normalized);
  } catch { return false; }
}
function requestTypeForStrict(details) {
  return details.type === 'script';
}
function findCustomBlock(host) {
  const match = hostMatchesSet(host, customBlockSet);
  return match ? { category: 'malware', rule: match, reason: 'custom block rule' } : null;
}
function findUrlRule(url, pageHost, type, targetHost) {
  const lower = url.toLowerCase();
  const sameSite = !!pageHost && firstPartyEnough(targetHost, pageHost);
  for (const rule of urlRules) {
    if (!categoryEnabled(rule.category) || !categoryAllowsResource(rule.category, type, url)) continue;
    if (hostMatchesSet(targetHost, exceptions[rule.category])) continue;
    const knownAnnoyanceNavigation = rule.category === 'annoyances' && type === 'main_frame' && !!hostMatchesSet(targetHost, popupNavigationHosts);
    if (rule.category !== 'malware' && (!pageHost || (sameSite && !knownAnnoyanceNavigation) || isCompatibilityHost(targetHost))) continue;
    if (lower.includes(rule.value)) return { category: rule.category, rule: rule.value, reason: 'URL pattern' };
  }
  // Explicit custom URL rules remain intentionally literal and user-controlled.
  for (const rule of settings.customUrlRules || []) {
    const value = String(rule.value || '').toLowerCase();
    const category = String(rule.category || 'ads');
    if (value.length >= 4 && categoryEnabled(category) && categoryAllowsResource(category, type, url) && lower.includes(value)) {
      return { category, rule: value, reason: 'custom URL pattern' };
    }
  }
  return null;
}

function localDayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function bumpStats(category, pageHost) {
  const today = localDayKey();
  if (stats.day !== today) {
    stats = { day: today, blockedTotal: 0, byCategory: { ads: 0, trackers: 0, malware: 0, annoyances: 0, scripts: 0 }, bySite: {}, lastSavedAt: 0 };
  }
  stats.bySite ||= {};
  stats.blockedTotal++;
  if (!(category in stats.byCategory)) stats.byCategory[category] = 0;
  stats.byCategory[category]++;
  if (category === 'malware' && stats.byCategory.scripts !== undefined) stats.byCategory.scripts += 0;
  if (pageHost && pageHost !== 'unknown page') {
    stats.bySite[pageHost] = (stats.bySite[pageHost] || 0) + 1;
    // Keep this convenience counter bounded on long-running profiles.
    const keys = Object.keys(stats.bySite);
    if (keys.length > 1200) {
      keys.sort((a, b) => (stats.bySite[b] || 0) - (stats.bySite[a] || 0));
      stats.bySite = Object.fromEntries(keys.slice(0, 1000).map((key) => [key, stats.bySite[key]]));
    }
  }
}
function addLog(details, match, pageHost, targetHost) {
  const item = {
    at: Date.now(),
    tabId: details.tabId,
    pageHost: pageHost || 'unknown page',
    targetHost: targetHost || 'unknown host',
    url: details.url,
    type: details.type || 'other',
    category: match.category,
    rule: match.rule || '',
    reason: match.reason || 'filter match'
  };
  requestLog.unshift(item);
  if (requestLog.length > 500) requestLog.length = 500;
  bumpStats(match.category, pageHost);
  if (details.type === 'script') stats.byCategory.scripts = (stats.byCategory.scripts || 0) + 1;
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; saveState(); }, 1200);
}
function matchingPausedSite(pageHost) {
  return (settings.pausedSites || []).some((d) => isDomainOrSubdomain(pageHost, d));
}
function matchingAllowlisted(host) {
  return (settings.allowlistDomains || []).some((d) => isDomainOrSubdomain(host, d));
}
function stripHash(rawUrl) {
  try { const url = new URL(rawUrl); url.hash = ''; return url.href; } catch { return String(rawUrl || ''); }
}
function isHttpUrl(rawUrl) {
  try { const protocol = new URL(rawUrl).protocol; return protocol === 'http:' || protocol === 'https:'; } catch { return false; }
}
function warningUrl(kind, destination, extra = {}) {
  for (const [id, item] of pendingWarnings) {
    if (Date.now() - item.createdAt > 5 * 60 * 1000) pendingWarnings.delete(id);
  }
  // Keep full destinations (which can contain private query tokens) out of the
  // extension page URL and browser history. Only an opaque local ID is exposed.
  let id = '';
  do { id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; } while (pendingWarnings.has(id));
  pendingWarnings.set(id, {
    kind, destination, source: validHost(extra.source) || '', createdAt: Date.now()
  });
  const url = new URL(browser.runtime.getURL('warning.html'));
  url.searchParams.set('id', id);
  return url.href;
}
function getPendingWarning(id) {
  const key = String(id || '');
  const warning = pendingWarnings.get(key);
  if (!warning || Date.now() - warning.createdAt > 5 * 60 * 1000) {
    pendingWarnings.delete(key);
    for (const [tabId, activeId] of activeScriptWarnings) if (activeId === key) activeScriptWarnings.delete(tabId);
    return null;
  }
  return warning;
}
function navigationKey(tabId, url) { return `${tabId}|${stripHash(url)}`; }
function peekNavigationBypass(tabId, url) {
  const key = navigationKey(tabId, url);
  const item = navigationBypasses.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) { navigationBypasses.delete(key); return null; }
  return item;
}
function clearNavigationBypass(tabId, url) {
  navigationBypasses.delete(navigationKey(tabId, url));
}
function warningSuppressionKey(tabId, pageHost, sourceHost) {
  return `${tabId}|${pageHost}|${sourceHost}`;
}
function isScriptWarningSuppressed(tabId, pageHost, sourceHost) {
  const key = warningSuppressionKey(tabId, pageHost, sourceHost);
  const expiresAt = scriptWarningSuppressions.get(key) || 0;
  if (expiresAt <= Date.now()) { scriptWarningSuppressions.delete(key); return false; }
  return true;
}
function navigateTabToWarning(tabId, kind, destination, extra = {}) {
  if (!Number.isInteger(tabId) || tabId < 0) return false;
  const target = warningUrl(kind, destination, extra);
  browser.tabs.update(tabId, { url: target }).catch(() => {});
  return true;
}
function openMaliciousScriptWarning(tabId, pageUrl, sourceHost) {
  if (tabId < 0 || !isHttpUrl(pageUrl)) return;
  const pageHost = hostnameFrom(pageUrl);
  if (!settings.warnMaliciousScripts || isScriptWarningSuppressed(tabId, pageHost, sourceHost)) return;
  const currentId = activeScriptWarnings.get(tabId);
  if (currentId && getPendingWarning(currentId)) return;
  // Cancel the script synchronously; then replace the tab with one warning page.
  const warningPage = warningUrl('malware-script', pageUrl, { source: sourceHost });
  const warningId = new URL(warningPage).searchParams.get('id');
  activeScriptWarnings.set(tabId, warningId);
  browser.tabs.update(tabId, { url: warningPage }).catch(() => {});
}
function onBeforeRequest(details) {
  if (!settings.enabled || !details.url || !/^https?:/i.test(details.url)) return {};
  const targetHost = hostnameFrom(details.url);
  if (!targetHost) return {};

  const isMainFrame = details.type === 'main_frame';
  const navigationBypass = isMainFrame && details.tabId >= 0 ? peekNavigationBypass(details.tabId, details.url) : null;

  // A user-confirmed visit to a blocked main-frame domain gets one navigation
  // pass. This does not whitelist the site's subresources.
  if (isMainFrame && navigationBypass?.allowMainFrameBlock) {
    // For an HTTP destination, keep the bypass until response headers so the
    // HTTPS warning can distinguish a final HTTP page from an HTTP→HTTPS redirect.
    if (!(navigationBypass.allowHttp && /^http:/i.test(details.url))) {
      clearNavigationBypass(details.tabId, details.url);
    }
    return {};
  }

  const pageUrl = isMainFrame ? details.url : (details.documentUrl || details.originUrl || details.initiator || '');
  const pageHost = hostnameFrom(pageUrl);
  if (pageHost && matchingPausedSite(pageHost)) return {};
  if (matchingAllowlisted(targetHost)) return {};

  let match = findCustomBlock(targetHost);
  if (!match) match = checkDomainRules(targetHost, pageHost, details.type, details.url);
  if (!match) match = findUrlRule(details.url, pageHost, details.type, targetHost);
  if (!match && settings.strictThirdPartyScripts && requestTypeForStrict(details) && pageHost && !firstPartyEnough(targetHost, pageHost)) {
    match = { category: 'malware', rule: targetHost, reason: 'strict third-party script guard' };
  }

  if (match) {
    addLog(details, match, pageHost, targetHost);
    try { browser.action.setBadgeText({ text: '●' }); browser.action.setBadgeBackgroundColor({ color: '#f06b7a' }); } catch {}

    if (isMainFrame && match.category === 'malware' && isKnownMalwareHost(targetHost) && settings.warnMaliciousScripts) {
      navigateTabToWarning(details.tabId, 'malware-site', details.url, { source: targetHost });
      return { cancel: true };
    }
    if (!isMainFrame && details.type === 'script' && match.category === 'malware' && isKnownMalwareHost(targetHost)) {
      openMaliciousScriptWarning(details.tabId, pageUrl, targetHost);
    }
    return { cancel: true };
  }
  return {};
}

function onHeadersReceived(details) {
  if (!settings.enabled || !settings.warnHttp || details.type !== 'main_frame' || !/^http:/i.test(details.url)) return {};
  if (!Number.isInteger(details.tabId) || details.tabId < 0) return {};
  const host = hostnameFrom(details.url);
  if (!host || isLocalOrPrivateHost(host) || matchingPausedSite(host) || matchingAllowlisted(host)) return {};

  const key = navigationKey(details.tabId, details.url);
  const hasLocation = (details.responseHeaders || []).some((header) => String(header.name || '').toLowerCase() === 'location' && String(header.value || '').trim());
  const isRedirect = Number(details.statusCode) >= 300 && Number(details.statusCode) < 400 && hasLocation;
  if (isRedirect) {
    // Ignore HTTP redirect responses (especially HTTP→HTTPS upgrades). The final
    // destination is evaluated separately, so secure sites don't get false alarms.
    navigationBypasses.delete(key);
    return {};
  }

  const bypass = peekNavigationBypass(details.tabId, details.url);
  if (bypass?.allowHttp) {
    clearNavigationBypass(details.tabId, details.url);
    return {};
  }

  // Wait for response headers rather than warning at request start: many legacy
  // links immediately redirect to HTTPS and should never show a warning page.
  navigateTabToWarning(details.tabId, 'http', details.url);
  return { cancel: true };
}

async function loadRemoteCache() {
  const store = await browser.storage.local.get(['remoteFilterCache', 'sourceStatus', 'requestLog', 'stats', 'settings', 'filterEngineRevision']);
  if (store.settings) settings = { ...DEFAULTS, ...store.settings };
  if (store.defaultLanguageMigration !== DEFAULT_LANGUAGE_MIGRATION) {
    // 0.2.1 used Brazilian Portuguese as its implicit default. Make English
    // the baseline for 0.2.2, preserve every other preference, and let users
    // choose Portuguese again from Settings whenever they prefer.
    settings.language = 'en';
    await browser.storage.local.set({ settings, defaultLanguageMigration: DEFAULT_LANGUAGE_MIGRATION });
  }
  if (store.requestLog) requestLog = Array.isArray(store.requestLog) ? store.requestLog.slice(0, 500) : [];
  if (store.stats) stats = { ...stats, ...store.stats, byCategory: { ...stats.byCategory, ...(store.stats.byCategory || {}) }, bySite: { ...(store.stats.bySite || {}) } };

  // The previous 0.2.0 subset parser could broaden some unsupported negated
  // filter options. Clear only that compiled remote cache once on upgrade;
  // local settings, counters, logs, and custom rules are preserved. Users can
  // then rebuild the cache with the safer parser from Filter Lists.
  if (store.filterEngineRevision !== FILTER_ENGINE_REVISION) {
    remoteCache = {};
    sourceStatus = {};
    await browser.storage.local.set({
      remoteFilterCache: {},
      sourceStatus: {},
      filterEngineRevision: FILTER_ENGINE_REVISION
    });
  } else {
    sourceStatus = store.sourceStatus || {};
    remoteCache = store.remoteFilterCache || {};
  }
  customBlockSet = new Set((settings.customBlockedHosts || []).map(validHost).filter(Boolean));
}
function applyRemoteCache() {
  for (const source of SOURCES) {
    const list = remoteCache[source.id];
    if (!list) continue;
    installDomainRules(list.hosts, source.category);
    if (list.exceptions && exceptions[source.category]) for (const h of list.exceptions) exceptions[source.category].add(h);
    if (list.scoped && scopedRules[source.category]) indexScopedRules(source.category, list.scoped.slice(0, 30000));
  }
}

async function saveState() {
  try {
    await browser.storage.local.set({ settings, requestLog: requestLog.slice(0, 500), stats, sourceStatus });
  } catch (err) { console.warn('[Sentinel] Could not save state', err); }
}
async function getState(siteHost = '') {
  if (stats.day !== localDayKey()) stats = { day: localDayKey(), blockedTotal: 0, byCategory: { ads: 0, trackers: 0, malware: 0, annoyances: 0, scripts: 0 }, bySite: {}, lastSavedAt: 0 };
  stats.bySite ||= {};
  const counts = Object.fromEntries(Object.entries(domainRules).map(([k, v]) => [k, v.size]));
  const combined = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    settings, stats, siteBlockedCount: stats.bySite[String(siteHost || '').toLowerCase()] || 0, recent: requestLog.slice(0, 500), sourceStatus, sources: SOURCES,
    filterCounts: counts, filterCount: combined, scopedCount: Object.values(scopedRules).reduce((n, a) => n + a.length, 0),
    cosmeticCount: cosmeticSelectors.length, urlRuleCount: urlRules.length,
    updatedAt: Object.values(sourceStatus).map((x) => x.updatedAt || 0).reduce((a, b) => Math.max(a, b), 0)
  };
}
async function updateFilters() {
  const nextCache = { ...remoteCache };
  const updated = [];
  const errors = [];
  for (const source of SOURCES) {
    try {
      const response = await fetch(source.url, { cache: 'no-store', credentials: 'omit', redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length < 300 || text.length > 30_000_000) throw new Error('Unexpected list size; refused to import it');
      let parsed;
      if (source.kind === 'hosts') parsed = { hosts: [...new Set(parseHostList(text, source.category).map((x) => x.host))], exceptions: [], scoped: [] };
      else parsed = parseABP(text, source.category);
      if (!parsed.hosts.length && !parsed.scoped.length) throw new Error('No supported host-anchored rules found in this list');
      nextCache[source.id] = { hosts: parsed.hosts.slice(0, 250000), exceptions: parsed.excepts || [], scoped: (parsed.scoped || []).slice(0, 30000) };
      sourceStatus[source.id] = { label: source.label, count: parsed.hosts.length + parsed.scoped.length, updatedAt: Date.now(), ok: true, note: source.note };
      updated.push(source.label);
    } catch (err) {
      const old = sourceStatus[source.id] || {};
      sourceStatus[source.id] = { ...old, label: source.label, ok: !!old.updatedAt, error: String(err?.message || err).slice(0, 180), note: source.note };
      errors.push(`${source.label}: ${String(err?.message || err).slice(0, 100)}`);
    }
  }
  remoteCache = nextCache;
  await browser.storage.local.set({ remoteFilterCache: remoteCache, sourceStatus });
  // Recompile all rules after updating so current-page requests use new data.
  await compileLocalFilters();
  applyRemoteCache();
  await saveState();
  return { updated, errors, state: await getState() };
}

function sanitizeSettings(incoming) {
  if (!incoming || typeof incoming !== 'object') throw new Error('Invalid settings file');
  const next = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof DEFAULTS[key] === 'boolean' && typeof incoming[key] === 'boolean') next[key] = incoming[key];
    if (Array.isArray(DEFAULTS[key]) && Array.isArray(incoming[key])) next[key] = incoming[key].slice(0, 2000);
  }
  if (['en', 'pt-BR'].includes(incoming.language)) next.language = incoming.language;
  next.allowlistDomains = [...new Set(next.allowlistDomains.map(validHost).filter(Boolean))];
  next.pausedSites = [...new Set(next.pausedSites.map(validHost).filter(Boolean))];
  next.customBlockedHosts = [...new Set(next.customBlockedHosts.map(validHost).filter(Boolean))];
  next.customUrlRules = next.customUrlRules.filter((r) => r && ['ads','trackers','malware','annoyances'].includes(r.category) && typeof r.value === 'string' && r.value.length >= 4 && r.value.length <= 300).slice(0, 1000);
  next.customCosmeticSelectors = next.customCosmeticSelectors.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 300 && !/[{};]/.test(x)).slice(0, 500);
  return next;
}

async function handleMessage(message) {
  switch (message?.type) {
    case 'GET_STATE': return getState(message?.host);
    case 'GET_WARNING_DATA': {
      const warning = getPendingWarning(message.warningId);
      if (!warning) throw new Error('This warning has expired. Go back and open the site again.');
      return { kind: warning.kind, destination: warning.destination, source: warning.source };
    }
    case 'SET_LANGUAGE': {
      if (!['en', 'pt-BR'].includes(message.language)) throw new Error('Unsupported language');
      settings.language = message.language;
      await browser.storage.local.set({ settings });
      return getState();
    }
    case 'SET_SETTING': {
      const allowed = new Set(Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === 'boolean'));
      if (!allowed.has(message.key)) throw new Error('Unknown setting');
      settings[message.key] = !!message.value;
      await browser.storage.local.set({ settings });
      return getState();
    }
    case 'SITE_TOGGLE': {
      const host = validHost(message.host);
      if (!host) throw new Error('Invalid site hostname');
      settings.pausedSites = (settings.pausedSites || []).filter((h) => h !== host);
      if (!message.active) settings.pausedSites.push(host);
      await browser.storage.local.set({ settings });
      return getState();
    }
    case 'ADD_ALLOW': {
      const host = validHost(message.host);
      if (!host) throw new Error('Enter a hostname such as example.com');
      if (!settings.allowlistDomains.includes(host)) settings.allowlistDomains.push(host);
      await browser.storage.local.set({ settings });
      return getState();
    }
    case 'REMOVE_ALLOW': settings.allowlistDomains = settings.allowlistDomains.filter((h) => h !== message.host); await browser.storage.local.set({ settings }); return getState();
    case 'ADD_BLOCK': {
      const host = validHost(message.host);
      if (!host) throw new Error('Enter a hostname such as ads.example.com');
      if (!settings.customBlockedHosts.includes(host)) settings.customBlockedHosts.push(host);
      customBlockSet.add(host);
      await browser.storage.local.set({ settings }); return getState();
    }
    case 'REMOVE_BLOCK': settings.customBlockedHosts = settings.customBlockedHosts.filter((h) => h !== message.host); customBlockSet = new Set(settings.customBlockedHosts); await browser.storage.local.set({ settings }); return getState();
    case 'WARNING_CONTINUE': {
      const tabId = Number.isInteger(message.tabId) ? message.tabId : -1;
      const warningId = String(message.warningId || '');
      const warning = getPendingWarning(warningId);
      const kind = warning && ['http', 'malware-script', 'malware-site'].includes(warning.kind) ? warning.kind : '';
      let destination = '';
      try {
        const candidate = new URL(String(warning?.destination || ''));
        if (!['http:', 'https:'].includes(candidate.protocol)) throw new Error('Only HTTP(S) destinations are allowed');
        destination = candidate.href;
      } catch { throw new Error('Invalid destination URL'); }
      if (tabId < 0 || !kind) throw new Error('Could not identify the warning tab');
      if (kind === 'malware-script') {
        const pageHost = hostnameFrom(destination);
        const sourceHost = validHost(warning.source) || '';
        if (sourceHost) scriptWarningSuppressions.set(warningSuppressionKey(tabId, pageHost, sourceHost), Date.now() + 10 * 60 * 1000);
      } else {
        navigationBypasses.set(navigationKey(tabId, destination), {
          allowHttp: kind === 'http' || (kind === 'malware-site' && /^http:/i.test(destination)),
          allowMainFrameBlock: kind === 'malware-site',
          expiresAt: Date.now() + 30 * 1000
        });
      }
      await browser.tabs.update(tabId, { url: destination });
      pendingWarnings.delete(warningId);
      if (activeScriptWarnings.get(tabId) === warningId) activeScriptWarnings.delete(tabId);
      return { ok: true };
    }
    case 'WARNING_BACK': {
      const tabId = Number.isInteger(message.tabId) ? message.tabId : -1;
      if (tabId < 0) throw new Error('Could not identify the warning tab');
      const warningId = String(message.warningId || '');
      const warning = getPendingWarning(warningId);
      // If a script-triggered warning is dismissed via Back and the browser
      // returns to the interrupted page, suppress the same interstitial loop.
      if (warning?.kind === 'malware-script' && isHttpUrl(warning.destination)) {
        const pageHost = hostnameFrom(warning.destination);
        const sourceHost = validHost(warning.source) || '';
        if (sourceHost) scriptWarningSuppressions.set(warningSuppressionKey(tabId, pageHost, sourceHost), Date.now() + 10 * 60 * 1000);
      }
      if (typeof browser.tabs.goBack === 'function') {
        try { await browser.tabs.goBack(tabId); pendingWarnings.delete(warningId); if (activeScriptWarnings.get(tabId) === warningId) activeScriptWarnings.delete(tabId); return { ok: true }; } catch {}
      }
      await browser.tabs.update(tabId, { url: 'about:newtab' });
      pendingWarnings.delete(warningId);
      if (activeScriptWarnings.get(tabId) === warningId) activeScriptWarnings.delete(tabId);
      return { ok: true };
    }
    case 'UPDATE_FILTERS': return updateFilters();
    case 'CLEAR_LOGS': requestLog = []; await browser.storage.local.set({ requestLog }); return getState();
    case 'RESET_STATS': stats = { day: localDayKey(), blockedTotal: 0, byCategory: { ads: 0, trackers: 0, malware: 0, annoyances: 0, scripts: 0 }, bySite: {}, lastSavedAt: 0 }; await browser.storage.local.set({ stats }); return getState();
    case 'IMPORT_SETTINGS': {
      settings = sanitizeSettings(message.data);
      customBlockSet = new Set(settings.customBlockedHosts);
      await browser.storage.local.set({ settings });
      return getState();
    }
    case 'IMPORT_BACKUP': {
      const incoming = message.data;
      if (!incoming || typeof incoming !== 'object') throw new Error('Invalid backup file');
      settings = sanitizeSettings(incoming.settings || incoming);
      customBlockSet = new Set(settings.customBlockedHosts);
      const oldCache = (await browser.storage.local.get('remoteFilterCache')).remoteFilterCache || {};
      const incomingCache = incoming.filterEngineRevision === FILTER_ENGINE_REVISION && incoming.remoteFilterCache && typeof incoming.remoteFilterCache === 'object' ? incoming.remoteFilterCache : null;
      if (incomingCache) {
        const safeCache = {};
        for (const source of SOURCES) {
          const raw = incomingCache[source.id];
          if (!raw || typeof raw !== 'object') continue;
          safeCache[source.id] = {
            hosts: Array.isArray(raw.hosts) ? [...new Set(raw.hosts.slice(0, 250000).map(validHost).filter(Boolean))] : [],
            exceptions: Array.isArray(raw.exceptions) ? [...new Set(raw.exceptions.slice(0, 50000).map(validHost).filter(Boolean))] : [],
            scoped: Array.isArray(raw.scoped) ? raw.scoped.slice(0, 30000).map((r) => {
              const host = validHost(r?.host); if (!host) return null;
              const path = typeof r.path === 'string' ? r.path.slice(0, 300) : '';
              const allowedTypes = new Set(['script','image','stylesheet','xmlhttprequest','subdocument','document','object','ping','media','font','other']);
              const types = Array.isArray(r.types) ? r.types.filter((x) => allowedTypes.has(x)).slice(0, 20) : [];
              return { host, path, types, thirdParty: !!r.thirdParty, include: Array.isArray(r.include) ? r.include.slice(0, 100).map(validHost).filter(Boolean) : [], exclude: Array.isArray(r.exclude) ? r.exclude.slice(0, 100).map(validHost).filter(Boolean) : [], important: !!r.important };
            }).filter(Boolean) : []
          };
        }
        remoteCache = { ...oldCache, ...safeCache };
      }
      if (incoming.sourceStatus && typeof incoming.sourceStatus === 'object') {
        const safeStatus = {};
        for (const source of SOURCES) if (incoming.sourceStatus[source.id]) {
          const v = incoming.sourceStatus[source.id];
          safeStatus[source.id] = { label: source.label, count: Math.min(Number(v.count) || 0, 300000), updatedAt: Math.max(0, Number(v.updatedAt) || 0), ok: !!v.ok, note: source.note, error: String(v.error || '').slice(0, 180) };
        }
        sourceStatus = safeStatus;
      }
      if (incoming.stats && typeof incoming.stats === 'object') {
        const src = incoming.stats;
        stats = { day: String(src.day || localDayKey()).slice(0, 10), blockedTotal: Math.min(1_000_000_000, Math.max(0, Number(src.blockedTotal) || 0)), byCategory: { ads: 0, trackers: 0, malware: 0, annoyances: 0, scripts: 0, ...(src.byCategory || {}) }, bySite: {}, lastSavedAt: 0 };
        if (src.bySite && typeof src.bySite === 'object') {
          for (const [host, count] of Object.entries(src.bySite).slice(0, 1200)) { const safeHost = validHost(host); if (safeHost) stats.bySite[safeHost] = Math.min(1_000_000_000, Math.max(0, Number(count) || 0)); }
        }
        for (const k of Object.keys(stats.byCategory)) stats.byCategory[k] = Math.min(1_000_000_000, Math.max(0, Number(stats.byCategory[k]) || 0));
      }
      if (Array.isArray(incoming.requestLog)) requestLog = incoming.requestLog.slice(0, 500).filter((r) => r && typeof r === 'object').map((r) => ({ at: Math.max(0, Number(r.at) || 0), tabId: Number.isInteger(r.tabId) ? r.tabId : -1, pageHost: String(r.pageHost || '').slice(0, 253), targetHost: String(r.targetHost || '').slice(0, 253), url: String(r.url || '').slice(0, 4000), type: String(r.type || 'other').slice(0, 40), category: ['ads','trackers','malware','annoyances','scripts'].includes(r.category) ? r.category : 'malware', rule: String(r.rule || '').slice(0, 500), reason: String(r.reason || '').slice(0, 180) }));
      await browser.storage.local.set({ settings, remoteFilterCache: remoteCache, sourceStatus, stats, requestLog });
      await compileLocalFilters(); applyRemoteCache(); await saveState();
      return getState();
    }
    case 'EXPORT_DATA': {
      const data = await browser.storage.local.get(null);
      return { app: 'Sentinel Shield', filterEngineRevision: FILTER_ENGINE_REVISION, exportedAt: new Date().toISOString(), settings, stats, requestLog: requestLog.slice(0, 500), sourceStatus, remoteFilterCache: data.remoteFilterCache || {} };
    }
    default: throw new Error('Unsupported message');
  }
}

browser.runtime.onMessage.addListener((message) => handleMessage(message));
browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, { urls: ['http://*/*', 'https://*/*'] }, ['blocking']);
browser.webRequest.onHeadersReceived.addListener(onHeadersReceived, { urls: ['http://*/*'] }, ['blocking', 'responseHeaders']);
browser.runtime.onInstalled.addListener(async () => {
  const existing = await browser.storage.local.get('settings');
  if (!existing.settings) await browser.storage.local.set({ settings: DEFAULTS });
  await browser.action.setBadgeText({ text: '' });
});
if (browser.tabs.onUpdated?.addListener) {
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const activeId = activeScriptWarnings.get(tabId);
    if (!activeId || !changeInfo.url) return;
    if (!changeInfo.url.includes('warning.html') || !changeInfo.url.includes(`id=${activeId}`)) {
      activeScriptWarnings.delete(tabId);
      pendingWarnings.delete(activeId);
    }
  });
}
if (browser.tabs.onRemoved?.addListener) {
  browser.tabs.onRemoved.addListener((tabId) => {
    const activeId = activeScriptWarnings.get(tabId);
    activeScriptWarnings.delete(tabId);
    if (activeId) pendingWarnings.delete(activeId);
  });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings?.newValue) {
    settings = { ...DEFAULTS, ...changes.settings.newValue };
    customBlockSet = new Set((settings.customBlockedHosts || []).map(validHost).filter(Boolean));
  }
});

(async function boot() {
  await loadRemoteCache();
  await compileLocalFilters();
  applyRemoteCache();
  if (!(await browser.storage.local.get('settings')).settings) await browser.storage.local.set({ settings: DEFAULTS });
})();
