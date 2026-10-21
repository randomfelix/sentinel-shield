'use strict';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let state = null;
let activeTab = null;
let activeHost = '';
let toastTimer;
let faviconByHost = {};
const FALLBACK_FAVICON = browser.runtime.getURL('icons/shield-48.png');
const i18n = () => window.SentinelI18n;
const t = (key, values) => i18n()?.t(key, values) ?? key;
function tell(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2200);
}
function fmt(number) { return new Intl.NumberFormat().format(Number(number || 0)); }
function ago(timestamp) { return i18n()?.relativeTime(timestamp) || ''; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
async function send(type, extra = {}) { return browser.runtime.sendMessage({ type, ...extra }); }
async function loadTabFavicons() {
  try {
    const tabs = await browser.tabs.query({});
    const next = {};
    for (const tab of tabs) {
      let host = '';
      try { host = new URL(tab.url || '').hostname.toLowerCase(); } catch { continue; }
      const icon = String(tab.favIconUrl || '');
      if (host && /^(?:https?:|data:image\/)/i.test(icon)) next[host] = icon;
    }
    faviconByHost = next;
  } catch { faviconByHost = {}; }
}
function faviconForHost(host) {
  const value = faviconByHost[String(host || '').toLowerCase()];
  return value && /^(?:https?:|data:image\/)/i.test(value) ? value : FALLBACK_FAVICON;
}
function hydrateFaviconImages(root = document) {
  root.querySelectorAll('.recent-favicon, .site-favicon-img').forEach((img) => {
    img.addEventListener('error', () => {
      if (img.dataset.fallbackApplied) return;
      img.dataset.fallbackApplied = '1';
      img.src = FALLBACK_FAVICON;
    }, { once: true });
  });
}

async function refresh() {
  try {
    await i18n()?.init();
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0] || null;
    try { activeHost = new URL(activeTab?.url || '').hostname.toLowerCase(); } catch { activeHost = ''; }
    await loadTabFavicons();
    state = await send('GET_STATE', { host: activeHost });
    render();
  } catch (error) {
    tell(`${t('Could not read protection state:')} ${error.message || error}`);
  }
}

function render() {
  if (!state) return;
  const settings = state.settings;
  const active = !!settings.enabled;
  $('#protectionTitle').textContent = active ? t('You’re protected') : t('Protection is paused');
  $('#protectionDetail').textContent = active
    ? t('{count} domain rules loaded locally', { count: fmt(state.filterCount) })
    : t('Network filtering is currently disabled');
  $('#statusPill').textContent = active ? t('ACTIVE') : t('PAUSED');
  $('#statusPill').className = `pill ${active ? 'good' : 'bad'}`;
  $('#protectionCard').classList.toggle('inactive', !active);
  $('#powerToggle').classList.toggle('off', !active);
  $('#powerToggle').setAttribute('aria-label', active ? t('Pause protection') : t('Enable protection'));
  $('#blockedToday').textContent = fmt(state.stats?.blockedTotal);
  $('#filterCount').textContent = fmt(state.filterCount);
  $('#siteBlockedCount').textContent = fmt(state.siteBlockedCount);
  const updated = state.updatedAt ? t('Updated {time}', { time: ago(state.updatedAt) }) : t('built-in starter rules');
  $('#filterFoot').textContent = updated;

  const canToggle = !!activeHost && !['about:', 'moz-extension:'].some((prefix) => (activeTab?.url || '').startsWith(prefix)) && !['addons.mozilla.org'].some((host) => activeHost === host || activeHost.endsWith(`.${host}`));
  const siteActive = !((settings.pausedSites || []).some((domain) => activeHost === domain || activeHost.endsWith(`.${domain}`)));
  $('#siteHost').textContent = activeHost || t('Browser internal page');
  $('#siteFavicon').innerHTML = activeHost
    ? `<img class="site-favicon-img" src="${escapeHtml(faviconForHost(activeHost))}" alt="" width="22" height="22">`
    : 'S';
  $('#siteState').textContent = !activeHost ? t('Site controls unavailable here') : (siteActive ? t('Protection active on this site') : t('This site is on your bypass list'));
  $('#siteLock').textContent = !activeHost ? '—' : (siteActive ? '●' : '○');
  $('#siteLock').style.color = siteActive ? 'var(--mint)' : 'var(--pink)';
  $('#siteToggle').checked = siteActive;
  $('#siteToggle').disabled = !canToggle;
  $('#siteFootText').textContent = t('Protection follows you across sites');
  $$('[data-setting]').forEach((element) => { element.checked = !!settings[element.dataset.setting]; });

  const recent = (state.recent || []).slice(0, 3);
  $('#recentList').innerHTML = recent.length ? recent.map((row) => `<div class="recent-item"><div class="recent-mark recent-site-mark"><img class="recent-favicon" src="${escapeHtml(faviconForHost(row.pageHost))}" alt="" width="18" height="18"></div><div class="recent-info"><div class="recent-host">${escapeHtml(row.targetHost)}</div><div class="recent-meta">${escapeHtml(t(row.category))} · ${escapeHtml(t(row.type))} · ${escapeHtml(row.pageHost)}</div></div><div class="recent-time">${escapeHtml(ago(row.at))}</div></div>`).join('') : `<div class="empty-state">${escapeHtml(t('No blocked requests yet. That’s a good sign.'))}</div>`;
  hydrateFaviconImages();
  i18n()?.apply();
}

async function setSetting(key, value) {
  state = await send('SET_SETTING', { key, value });
  state = await send('GET_STATE', { host: activeHost });
  render();
  tell(`${t(key.replace(/([A-Z])/g, ' $1'))} ${value ? t('enabled') : t('disabled')}`);
}

$('#powerToggle').addEventListener('click', async () => {
  if (!state) return;
  await setSetting('enabled', !state.settings.enabled);
});
$('#siteToggle').addEventListener('change', async (event) => {
  if (!activeHost) return;
  await send('SITE_TOGGLE', { host: activeHost, active: event.target.checked });
  await refresh();
  tell(event.target.checked ? t('Protection restored for this site') : t('Site bypass enabled'));
});
$$('[data-setting]').forEach((element) => element.addEventListener('change', (event) => {
  setSetting(event.currentTarget.dataset.setting, event.currentTarget.checked).catch((error) => tell(error.message || String(error)));
}));
const openDashboard = () => browser.runtime.openOptionsPage();
$('#openDashboard').addEventListener('click', openDashboard);
$('#manageSite').addEventListener('click', openDashboard);
$('#viewActivity').addEventListener('click', async () => { await openDashboard(); });
$('#openSettings').addEventListener('click', openDashboard);
refresh();
