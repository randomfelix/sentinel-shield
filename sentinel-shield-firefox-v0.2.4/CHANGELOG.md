# Sentinel Shield Firefox v0.2.4

## Changes
- Replaced risky YouTube parent-element matching with a conservative, explicit ad-selector set; protects the YouTube masthead, logo, search controls and main layout.
- Does not block `googlevideo.com` wholesale, to avoid breaking ordinary video playback.
- Added a removable, optional on-page mini-panel showing block totals and recent blocked hostnames; the watermark is disabled by default.
- Added dashboard **UI** settings for reduced motion, tracker counts on the extension icon and the watermark.
- Added AdGuard Tracking Protection and selected Disconnect tracker categories to the filter-list updater, alongside existing feeds.
- Added a curated built-in tracker seed and balanced Chrome source quotas across tracking, ads, annoyances and malware.
- Fixed the Firefox migration to read and preserve the saved UI-setting revision.

## Limits
- Filter updates are user-triggered. The filter parser supports a conservative subset of upstream list syntax; no source is exhaustive or false-positive-free.
- YouTube ad handling is best-effort. Static/syntax tests passed, but they do not replace live browser testing of YouTube playback and layout.
- Disconnect tracker data is CC BY-NC-SA 4.0. See `FILTER-SOURCES.md` for upstream source and licensing notes.
