'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let state = null;
let currentPage = 'overview';
let toastTimer;
let faviconByHost = {};
const FALLBACK_FAVICON = browser.runtime.getURL('icons/shield-48.png');
const i18n = () => window.SentinelI18n;
const t = (key, values) => i18n()?.t(key, values) ?? key;
const pageText = {
  overview: ['Your protection overview', 'A live snapshot of the browser\'s local filtering engine.'],
  activity: ['Request activity', 'Inspect recent requests stopped by your local rules.'],
  filters: ['Filter lists', 'Maintain the rule sources used by the local request engine.'],
  exceptions: ['Allow & block rules', 'Create per-domain exceptions and custom local blocks.'],
  settings: ['Settings & data', 'Tune advanced defenses and manage local backups.'],
  mods: ['Mods & translations', 'Manage official translation packs and extend Sentinel in forks.']
};
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmt(n) { return new Intl.NumberFormat().format(Number(n || 0)); }
function ago(ms) { return i18n()?.relativeTime(ms) || ''; }
function timeLabel(ms) { try { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return '—'; } }
function tell(text) { const el = $('#dashToast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800); }
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
  root.querySelectorAll('.recent-favicon, .activity-favicon').forEach((img) => {
    img.addEventListener('error', () => {
      if (img.dataset.fallbackApplied) return;
      img.dataset.fallbackApplied = '1';
      img.src = FALLBACK_FAVICON;
    }, { once: true });
  });
}
async function refresh() { try { await i18n()?.init(); await loadTabFavicons(); state = await send('GET_STATE'); render(); } catch (e) { tell(`${t('Could not load state:')} ${e.message || e}`); } }
function switchPage(name) {
  if (!pageText[name]) return;
  currentPage = name;
  $$('.page-section').forEach((el) => el.classList.toggle('active', el.id === `page-${name}`));
  $$('.nav-button').forEach((el) => el.classList.toggle('active', el.dataset.page === name));
  $('#pageTitle').textContent = t(pageText[name][0]);
  $('#pageSubtitle').textContent = t(pageText[name][1]);
  i18n()?.apply();
  if (name === 'activity') renderActivity();
}
function render() {
  if (!state) return;
  const s = state.settings;
  const on = !!s.enabled;
  $('#globalStatus').textContent = t(on ? 'Protection active' : 'Protection paused');
  $('#globalStatus').style.color = on ? 'var(--mint)' : 'var(--pink)';
  $('#headerPower').textContent = t(on ? '⏻ Pause protection' : '⏻ Enable protection');
  $('#headerPower').className = on ? 'button-secondary' : 'button-primary';
  $('#ovBlocked').textContent = fmt(state.stats?.blockedTotal);
  $('#ovDomains').textContent = fmt(state.filterCount);
  $('#ovDomainFoot').textContent = state.updatedAt ? t('Updated {time}', { time: ago(state.updatedAt) }) : t('built-in starter rules');
  $('#ovTrackers').textContent = fmt(state.stats?.byCategory?.trackers);
  $('#ovCosmetic').textContent = fmt(state.cosmeticCount);
  $('#runtimeDomains').textContent = fmt(state.filterCount);
  $('#runtimeUrls').textContent = fmt(state.urlRuleCount);
  $('#runtimeLogs').textContent = fmt((state.recent || []).length);
  $$('[data-setting]').forEach((el) => { el.checked = !!s[el.dataset.setting]; });
  if ($('#languageSelect')) $('#languageSelect').value = s.language || 'en';
  renderSources(); renderAllowBlock(); renderRecent(); renderActivity();
  i18n()?.apply();
}
function renderRecent() {
  const rows = (state.recent || []).slice(0, 6);
  $('#overviewRecent').innerHTML = rows.length ? rows.map((r) => `<div class="recent-item"><div class="recent-mark recent-site-mark"><img class="recent-favicon" src="${escapeHtml(faviconForHost(r.pageHost))}" alt="" width="18" height="18"></div><div class="recent-info"><div class="recent-host">${escapeHtml(r.targetHost)}</div><div class="recent-meta">${escapeHtml(r.pageHost)} · ${escapeHtml(r.category)} · ${escapeHtml(r.type)}</div></div><div class="recent-time">${ago(r.at)}</div></div>`).join('') : `<div class="empty-state">${escapeHtml(t('No blocked requests recorded yet.'))}</div>`;
  hydrateFaviconImages();
}
function renderSources() {
  const sources = state.sources || [];
  $('#sourcesList').innerHTML = sources.map((src) => {
    const status = state.sourceStatus?.[src.id] || {};
    const localReady = !!status.updatedAt;
    const statusText = localReady ? (status.ok ? t('UPDATED') : t('CACHED')) : t('NOT UPDATED');
    const count = status.count ? t('{count} parsed rules', { count: fmt(status.count) }) : (src.id === 'community-hosts' ? t('{count} current domains (incl. seed)', { count: fmt(state.filterCounts?.trackers || 0) }) : t('{count} built-in domains', { count: fmt(src.id === 'easylist' ? state.filterCounts?.ads : state.filterCounts?.trackers) }));
    return `<div class="source-row"><div class="source-icon">${src.kind === 'hosts' ? '⌘' : '▤'}</div><div><div class="source-name">${escapeHtml(src.label)}</div><div class="source-note">${escapeHtml(src.note)}${status.error ? ` · Latest update issue: ${escapeHtml(status.error)}` : ''}</div></div><div><div class="source-state ${status.error && !localReady ? 'error' : ''}">${statusText}</div><div class="source-count">${count}</div></div></div>`;
  }).join('');
  if (state.updatedAt) $('#updateNote').textContent = t('Last successful list update: {time}. Filters are applied locally after download.', { time: new Date(state.updatedAt).toLocaleString() });
  else $('#updateNote').textContent = t('Starter filters are active offline. Press Update filter lists to download upstream lists. The environment or a network filter may prevent downloads.');
}
function renderAllowBlock() {
  const allows = state.settings.allowlistDomains || [];
  const blocks = state.settings.customBlockedHosts || [];
  $('#allowList').innerHTML = allows.length ? allows.map((h) => `<div class="allow-entry"><div class="allow-domain">${escapeHtml(h)}</div><button class="row-action" data-remove-allow="${escapeHtml(h)}">${escapeHtml(t('Remove'))}</button></div>`).join('') : `<div class="empty-state">${escapeHtml(t('No allow rules yet.'))}</div>`;
  $('#blockList').innerHTML = blocks.length ? blocks.map((h) => `<div class="allow-entry"><div class="allow-domain">${escapeHtml(h)}</div><button class="row-action" data-remove-block="${escapeHtml(h)}">${escapeHtml(t('Remove'))}</button></div>`).join('') : `<div class="empty-state">${escapeHtml(t('No custom block rules yet.'))}</div>`;
  $$('[data-remove-allow]').forEach((b) => b.addEventListener('click', async () => { state = await send('REMOVE_ALLOW', { host: b.dataset.removeAllow }); render(); tell(t('Allow rule removed')); }));
  $$('[data-remove-block]').forEach((b) => b.addEventListener('click', async () => { state = await send('REMOVE_BLOCK', { host: b.dataset.removeBlock }); render(); tell(t('Custom block rule removed')); }));
}
function renderActivity() {
  if (!state || !$('#activityRows')) return;
  const query = ($('#activitySearch')?.value || '').trim().toLowerCase();
  const category = $('#activityCategory')?.value || 'all';
  const rows = (state.recent || []).filter((r) => category === 'all' || r.category === category).filter((r) => !query || [r.pageHost, r.targetHost, r.category, r.type, r.reason, r.url].some((x) => String(x || '').toLowerCase().includes(query)));
  $('#activityCount').textContent = t(rows.length === 1 ? '{count} entry' : '{count} entries', { count: fmt(rows.length) });
  $('#activityRows').innerHTML = rows.length ? rows.map((r) => `<tr><td class="table-muted">${timeLabel(r.at)}</td><td><span class="activity-site"><img class="activity-favicon" src="${escapeHtml(faviconForHost(r.pageHost))}" alt="" width="16" height="16"><span>${escapeHtml(r.pageHost)}</span></span></td><td><strong>${escapeHtml(r.targetHost)}</strong></td><td class="table-muted">${escapeHtml(t(r.type))}</td><td><span class="mini-badge ${escapeHtml(r.category)}">${escapeHtml(t(r.category))}</span></td><td class="table-muted">${escapeHtml(t(r.reason || 'filter match'))}</td></tr>`).join('') : `<tr><td colspan="6" class="empty-table">${escapeHtml(t('No matching log entries.'))}</td></tr>`;
  hydrateFaviconImages();
}
async function setSetting(key, value) { state = await send('SET_SETTING', { key, value }); render(); tell(t('Setting updated')); }
$$('.nav-button').forEach((el) => el.addEventListener('click', () => switchPage(el.dataset.page)));
$$('[data-jump]').forEach((el) => el.addEventListener('click', () => switchPage(el.dataset.jump)));
$$('[data-setting]').forEach((el) => el.addEventListener('change', () => setSetting(el.dataset.setting, el.checked).catch((e) => tell(e.message || String(e)))));
$('#headerPower').addEventListener('click', async () => { await setSetting('enabled', !state.settings.enabled); });
$('#languageSelect').addEventListener('change', async (event) => {
  const language = event.currentTarget.value;
  try {
    await send('SET_LANGUAGE', { language });
    await i18n()?.setLanguage(language);
    state = await send('GET_STATE');
    render();
    switchPage(currentPage);
    i18n()?.apply();
    tell(t('Language updated'));
  } catch (error) { tell(error.message || String(error)); }
});
$('#activitySearch').addEventListener('input', renderActivity);
$('#activityCategory').addEventListener('change', renderActivity);
async function clearLogs() { state = await send('CLEAR_LOGS'); render(); tell(t('Request log cleared')); }
$('#clearLogs').addEventListener('click', clearLogs);
$('#clearAllLogs').addEventListener('click', clearLogs);
$('#resetStats').addEventListener('click', async () => { state = await send('RESET_STATS'); render(); tell(t('Daily counters reset')); });
$('#allowForm').addEventListener('submit', async (e) => { e.preventDefault(); try { state = await send('ADD_ALLOW', { host: $('#allowInput').value }); $('#allowInput').value = ''; render(); tell(t('Allow rule added')); } catch (err) { tell(err.message || String(err)); } });
$('#blockForm').addEventListener('submit', async (e) => { e.preventDefault(); try { state = await send('ADD_BLOCK', { host: $('#blockInput').value }); $('#blockInput').value = ''; render(); tell(t('Custom block rule added')); } catch (err) { tell(err.message || String(err)); } });
$('#updateFilters').addEventListener('click', async () => {
  const btn = $('#updateFilters'); btn.disabled = true; btn.textContent = t('⟳ Downloading lists…'); $('#updateNote').textContent = t('Fetching community filter sources. No browsing information is sent by this extension to those list hosts.');
  try {
    const result = await send('UPDATE_FILTERS'); state = result.state; render();
    const succeeded = result.updated?.length || 0;
    $('#updateNote').textContent = `${t('Updated {count} of {total} source(s).', { count: succeeded, total: (state.sources || []).length })} ${result.errors?.length ? `${t('Some sources failed:')} ${result.errors.join(' · ')}` : t('All configured sources parsed successfully.')}`;
    tell(succeeded ? t('Filter update finished: {count} source(s)', { count: succeeded }) : t('No filter source updated. Existing rules were kept.'));
  } catch (err) { tell(`${t('Update failed:')} ${err.message || err}`); $('#updateNote').textContent = `${t('Update failed:')} ${err.message || err}. ${t('Existing filters remain active.')}`; }
  finally { btn.disabled = false; btn.textContent = t('⟳ Update filter lists'); i18n()?.apply(); }
});
$('#exportData').addEventListener('click', async () => {
  try {
    const data = await send('EXPORT_DATA');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `sentinel-shield-backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); tell(t('Backup exported — keep it private if it includes logs'));
  } catch (err) { tell(`Export failed: ${err.message || err}`); }
});
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 15 * 1024 * 1024) throw new Error('File is larger than 15 MB');
    const data = JSON.parse(await file.text());
    state = await send('IMPORT_BACKUP', { data });
    render(); tell(t('Settings imported'));
  } catch (err) { tell(`${t('Could not import file:')} ${err.message || err}`); }
  finally { e.target.value = ''; }
});
refresh();
