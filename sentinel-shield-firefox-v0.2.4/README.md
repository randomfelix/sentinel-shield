# Sentinel Shield — Firefox 0.2.4

A local-first browser extension for blocking common ad and tracker requests, suppressing selected ad elements, and warning about curated malicious-domain matches.

## Install

1. Extract this ZIP to a folder.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on…** and choose `manifest.json`.
4. Open Sentinel Shield's dashboard and press **Update filter lists** to fetch the upstream lists you want to use.

## v0.2.4

- Improved YouTube compatibility: the logo, masthead, search UI and main layout are protected from cosmetic ad selectors. No broad video-grid selector is used, and `googlevideo.com` is not blocked wholesale.
- The on-page watermark / block mini-panel is **off by default**. Turn it on in **Settings → UI**; use **Remove watermark** in its panel to hide it again.
- The optional panel shows per-page counters plus recent blocked hostnames, category and resource type.
- Added **UI** settings for reduced motion and displaying the current tab's tracker count on the browser-action badge.
- Added AdGuard Tracking Protection and selected categories from Disconnect to the list updater, in addition to the existing EasyList, EasyPrivacy, StevenBlack, Fanboy's Annoyance and Blocklist Project sources.
- Added and expanded a curated built-in seed for common ad-delivery, analytics, attribution and session-measurement hosts.
- Fixed a Firefox UI-setting migration bug that could reset the watermark selection on later startup; balanced Chrome's per-source rule quotas so newer feeds are not starved by the first feeds.

## Filter sources & privacy

Filter-list updates are **user-triggered** from the dashboard. The extension downloads the lists from their upstream providers and parses supported rules locally; it does not upload your browsing history or visited URLs to those list providers. See [`FILTER-SOURCES.md`](FILTER-SOURCES.md) for source URLs and license notes.

Disconnect's tracking data is licensed **CC BY-NC-SA 4.0**; its terms must be followed for redistribution or commercial use. Sentinel Shield links to the upstream data and does not package a copy of the full Disconnect list.

## Important limitations

- No public list catches every tracker or is free from false positives. This extension imports only the filter syntax its parser understands; unsupported cosmetic, regex, redirect, or exception constructs may be skipped instead of interpreted unsafely.
- YouTube's HTML and ad delivery changes often. Ad hiding and skip controls are best-effort, not a guarantee that every ad is removed. Blocking shared video-delivery domains could break normal playback, so `googlevideo.com` is intentionally not blanket-blocked.
- The mini-panel and badge report matches that the extension's own request observer records. Browser-specific request-observation limits mean they are not a perfect audit of every request blocked by the browser.
- If a site breaks, disable the relevant category or add a site exception rather than broadly blocking a shared CDN or platform domain.

## Versioning

Firefox and Chrome builds are released separately but use the same version number, **0.2.4**.
