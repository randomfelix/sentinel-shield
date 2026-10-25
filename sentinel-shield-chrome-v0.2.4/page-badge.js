/* Sentinel Shield v0.2.4 — optional on-page counter and recent-block panel. */
'use strict';
(() => {
  if (window.top !== window.self || !document.documentElement) return;
  const API = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  if (!API?.runtime || !API?.storage?.local) return;
  if (document.getElementById('sentinel-shield-page-badge-host')) return;

  const host = document.createElement('div');
  host.id = 'sentinel-shield-page-badge-host';
  host.dataset.sentinelShieldBadge = 'true';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif!important;color:#edf8f5!important;line-height:1.35!important}
      *{box-sizing:border-box} .wrap{display:flex;flex-direction:column;align-items:flex-end;gap:9px}
      button{font:inherit;cursor:pointer;border:0;color:inherit}
      .launcher{display:flex;align-items:center;gap:8px;min-height:42px;padding:7px 10px;border:1px solid rgba(112,245,197,.32);border-radius:999px;background:rgba(8,17,27,.94);box-shadow:0 8px 28px rgba(0,0,0,.33);backdrop-filter:blur(16px);transition:transform .18s,border-color .18s}
      .launcher:hover{transform:translateY(-2px);border-color:rgba(112,245,197,.68)}
      .shield{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:rgba(112,245,197,.11);color:#70f5c5}
      .shield svg{width:18px;height:18px}.brand{font-size:11px;letter-spacing:.15px;font-weight:750}
      .count{display:none;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#70f5c5;color:#06150f;font-size:10px;font-weight:850;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
      .count.visible{display:inline-flex}
      .panel{width:min(320px,calc(100vw - 32px));max-height:min(560px,calc(100vh - 32px));overflow:auto;padding:14px;border-radius:15px;border:1px solid rgba(112,245,197,.25);background:rgba(8,15,24,.97);box-shadow:0 15px 50px rgba(0,0,0,.42);backdrop-filter:blur(18px)}
      .panel[hidden]{display:none}.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}.head strong{font-size:12px;font-weight:800}
      .close{width:24px;height:24px;border-radius:7px;background:rgba(255,255,255,.07);color:#a9bbc9;font-size:16px}
      .total{padding:12px;border-radius:11px;background:rgba(112,245,197,.07);border:1px solid rgba(112,245,197,.12);margin-bottom:10px}
      .label{font-size:10px;color:#9aadb8}.big{display:block;font-size:25px;font-weight:850;color:#70f5c5;letter-spacing:-.6px;margin-top:3px;font-variant-numeric:tabular-nums}
      .row{display:flex;justify-content:space-between;gap:10px;padding:7px 2px;border-bottom:1px solid rgba(255,255,255,.07);font-size:11px}.row:last-of-type{border-bottom:0}.row span{color:#a8b9c6}.row strong{font-variant-numeric:tabular-nums;color:#eaf6f3}
      .section-label{font-size:9px;color:#96aabc;text-transform:uppercase;letter-spacing:.8px;font-weight:800;margin:13px 0 6px}
      .recent{display:flex;flex-direction:column;gap:5px}.block{display:flex;align-items:flex-start;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);border-radius:9px;min-width:0}
      .block-copy{min-width:0;flex:1}.host{font-size:10px;font-weight:750;overflow-wrap:anywhere;color:#e8f4f2}.meta{font-size:9px;color:#91a3b3;margin-top:3px;text-transform:capitalize}.tag{font-size:8px;font-weight:800;color:#70f5c5;padding:3px 5px;border-radius:5px;background:rgba(112,245,197,.09);white-space:nowrap}
      .empty{font-size:10px;color:#8093a5;padding:10px 2px}.note{font-size:9px;line-height:1.5;color:#7e93a4;margin:10px 1px}
      .open{width:100%;padding:9px;border-radius:9px;background:#70f5c5;color:#07150f;font-size:11px;font-weight:800}
      .remove{width:100%;margin-top:7px;padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12);color:#9fb0c2;font-size:10px;font-weight:650;text-align:center}
      .remove:hover{background:rgba(255,255,255,.1);color:#fff}.status{min-height:12px;font-size:9px;color:#70f5c5;margin-top:6px}
      .reduce-motion *, .reduce-motion *::before, .reduce-motion *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
      @media(prefers-reduced-motion:reduce){.launcher{transition:none}}
    </style>
    <div class="wrap">
      <section class="panel" hidden aria-label="Sentinel Shield block counters">
        <div class="head"><strong>Sentinel Shield</strong><button class="close" type="button" aria-label="Close panel">×</button></div>
        <div class="total"><span class="label">Blocked on this page</span><span class="big" id="total">0</span></div>
        <div class="row"><span>Ads / ad elements</span><strong id="ads">0</strong></div>
        <div class="row"><span>Trackers</span><strong id="trackers">0</strong></div>
        <div class="row"><span>Known threats</span><strong id="malware">0</strong></div>
        <div class="row"><span>Popups / annoyances</span><strong id="annoyances">0</strong></div>
        <div class="row"><span>Unique tracker hosts</span><strong id="unique">0</strong></div>
        <div class="section-label">Recent blocked hosts</div>
        <div class="recent" id="recentBlocks"><div class="empty">No blocked requests recorded on this page yet.</div></div>
        <p class="note">The list shows hostnames matched by Sentinel Shield. Filters are best-effort and may not identify every tracking request.</p>
        <button class="open" type="button">Open dashboard ↗</button>
        <button class="remove" type="button">Remove watermark</button>
        <div class="status" role="status" aria-live="polite"></div>
      </section>
      <button class="launcher" type="button" aria-label="Show Sentinel Shield block counters" aria-expanded="false">
        <span class="shield"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></svg></span>
        <span class="brand">Sentinel</span><span class="count" id="pillCount">0</span>
      </button>
    </div>`;
  document.documentElement.appendChild(host);

  const $ = (selector) => shadow.querySelector(selector);
  const panel = $('.panel');
  const launcher = $('.launcher');
  let current = { total: 0, ads: 0, trackers: 0, malware: 0, annoyances: 0, uniqueTrackerDomains: [], recentBlocks: [] };
  let localSettings = { showPageBadge: false, reducedMotion: false };

  function renderRecent(items) {
    const root = $('#recentBlocks');
    root.replaceChildren();
    const rows = Array.isArray(items) ? items.slice(0, 8) : [];
    if (!rows.length) {
      const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'No blocked requests recorded on this page yet.'; root.appendChild(empty); return;
    }
    for (const item of rows) {
      const row = document.createElement('div'); row.className = 'block';
      const copy = document.createElement('div'); copy.className = 'block-copy';
      const hostName = document.createElement('div'); hostName.className = 'host'; hostName.textContent = String(item.targetHost || 'unknown host');
      const meta = document.createElement('div'); meta.className = 'meta';
      const at = Number(item.at || 0);
      const time = at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
      meta.textContent = [String(item.category || 'blocked'), String(item.type || 'request'), time].filter(Boolean).join(' · ');
      const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = String(item.category || 'blocked');
      copy.append(hostName, meta); row.append(copy, tag); root.appendChild(row);
    }
  }
  function render(stats = {}) {
    current = { ...current, ...stats };
    $('#total').textContent = String(current.total || 0);
    $('#ads').textContent = String(current.ads || 0);
    $('#trackers').textContent = String(current.trackers || 0);
    $('#malware').textContent = String(current.malware || 0);
    $('#annoyances').textContent = String(current.annoyances || 0);
    $('#unique').textContent = String((current.uniqueTrackerDomains || []).length);
    const pill = $('#pillCount'); pill.textContent = String(current.trackers > 999 ? '999+' : current.trackers || 0);
    pill.classList.toggle('visible', Number(current.trackers || 0) > 0);
    launcher.setAttribute('aria-label', `Sentinel Shield: ${current.trackers || 0} trackers blocked on this page`);
    renderRecent(current.recentBlocks);
  }
  function applyVisibility() {
    host.style.setProperty('display', localSettings.showPageBadge === true ? 'block' : 'none', 'important');
    host.classList.toggle('reduce-motion', localSettings.reducedMotion === true);
    if (localSettings.showPageBadge !== true) { panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); }
  }
  function toggle(force) {
    const open = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !open; launcher.setAttribute('aria-expanded', String(open));
  }
  async function setWatermarkVisible(show) {
    try {
      const result = await API.storage.local.get('settings');
      const settings = { ...(result?.settings || {}), showPageBadge: !!show };
      await API.storage.local.set({ settings });
      localSettings = { ...localSettings, ...settings }; applyVisibility();
      if (show) $('.status').textContent = 'Watermark enabled.';
    } catch { $('.status').textContent = 'Could not save setting. Enable it from the dashboard.'; }
  }

  launcher.addEventListener('click', () => toggle());
  $('.close').addEventListener('click', () => toggle(false));
  $('.open').addEventListener('click', () => { try { Promise.resolve(API.runtime.sendMessage({ type: 'OPEN_DASHBOARD' })).catch(() => {}); } catch {} });
  $('.remove').addEventListener('click', () => setWatermarkVisible(false));

  API.runtime.onMessage.addListener((message) => {
    if (message?.type === 'SENTINEL_STATS' && message.stats) render(message.stats);
  });
  API.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    localSettings = { ...localSettings, ...(changes.settings.newValue || {}) }; applyVisibility();
  });
  API.storage.local.get('settings').then((result) => {
    localSettings = { ...localSettings, ...(result?.settings || {}) }; applyVisibility();
  }).catch(applyVisibility);
  try { Promise.resolve(API.runtime.sendMessage({ type: 'GET_TAB_STATS' })).then(render).catch(() => {}); } catch {}
})();
