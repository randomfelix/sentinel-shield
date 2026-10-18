# Sentinel Shield 0.2.1

Compatibility hotfix for the early 0.2.0 build: narrower default lists, third-party/resource-type safeguards, and final-response HTTP warnings that ignore HTTP-to-HTTPS redirects. On first launch, this version clears the old downloaded filter cache once because the earlier parser could broaden unsupported rules; local settings, counters, and custom rules are preserved. Visit **Filter lists → Update filter lists** to rebuild the cache with the corrected parser.

Sentinel Shield is a readable, local-first Firefox extension for blocking ads, trackers, and requests that match known threat-domain rules. The project has no build step or third-party JavaScript dependencies.

## Features

- **Request filtering:** cancels matching HTTP(S) requests using Firefox's `webRequest` API.
- **Ad and tracker blocking:** the bundled starter set focuses on high-confidence ad-delivery and analytics endpoints. Built-in and downloaded rules are evaluated conservatively: ordinary ad/tracker rules do not block top-level pages or first-party assets, and tracker rules primarily apply to scripts, XHR/fetch, pings, and known pixel patterns.
- **Community filter updates:** the user can manually download StevenBlack's unified hosts list, EasyList, and EasyPrivacy. Downloaded rules are cached locally. The parser intentionally supports a subset of upstream filter syntax. The mixed StevenBlack feed is handled as ad/tracker hosts rather than treating every feed entry as confirmed malware.
- **Per-site statistics:** the popup shows the number of requests blocked on the current site today, alongside daily totals.
- **Known-threat interstitial:** a request matching one of the hand-maintained local known-threat domains is blocked. A top-level navigation to a listed threat domain opens a warning screen before the document loads. When a page requests a listed third-party script, that request is canceled and Sentinel opens a warning screen; other page code may already have run before that script request occurs. Continuing does **not** whitelist or execute the blocked script. Community host feeds are used for request blocking but do not automatically trigger the scarier warning screen.
- **HTTP warning:** with the setting enabled, Sentinel waits for response headers before warning on a final unencrypted HTTP page. HTTP responses that redirect to HTTPS do not display a warning. Localhost and private-network addresses are exempt to avoid disrupting local development and device admin pages. Continuing grants a one-time pass for that exact document URL; request filtering remains active for its subresources.
- **Dashboard:** activity log, quick settings, custom allow/block rules, import/export, list status, language settings, and a Mods & translations page.
- **Languages and forks:** English and Brazilian Portuguese packs live in `mods/translate/`. Packs are plain JSON, not executable code.
- **Local data:** settings, downloaded lists, counters, and recent request records are stored in Firefox extension storage. No Sentinel account or remote telemetry service is built in.

## Load temporarily in Firefox

1. Extract the project ZIP.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Select **Load Temporary Add-on…**.
4. Choose the project's `manifest.json` file.
5. Pin Sentinel Shield and open the toolbar popup. Use **Advanced settings** to open the dashboard.

A temporary add-on is removed when Firefox is fully closed. A public release must be packaged, reviewed, and submitted through Mozilla's add-on publishing process.

## Recommended setup

1. Open the dashboard and visit **Filter lists**.
2. Press **Update filter lists** to download the larger community lists. If a source fails, the previous cache and bundled rules remain available.
3. Keep Firefox Enhanced Tracking Protection enabled.
4. If a site stops working, inspect **Request activity**, review custom rules, or disable the specific filter that caused the issue. The default engine intentionally avoids blocking top-level pages through ad/tracker lists, allows first-party assets, limits tracker blocking to likely tracking resource types, and keeps common form/chat/review/payment/transactional providers out of broad default blocking.

## Translation packs and mods

- `mods/translate/en.json` — English UI pack.
- `mods/translate/pt-BR.json` — Brazilian Portuguese UI pack.

To add a language in a fork, copy `en.json`, keep the English keys, translate the values, and register the locale in `background.js`, `localization.js`, and the language selector in `dashboard.html`. Keep translation files as valid JSON and do not put scripts in them. The core extension intentionally does not execute third-party JavaScript mods.

## Filter sources

The optional updater contacts these sources only when the user presses the update button:

- StevenBlack unified hosts: <https://github.com/StevenBlack/hosts>
- EasyList: <https://easylist.to/easylist/easylist.txt>
- EasyPrivacy: <https://easylist.to/easylist/easyprivacy.txt>

These are third-party lists with their own licensing and redistribution terms. The project bundles only a compact, hand-maintained starter set; it does not bundle the full upstream lists. The importer supports a useful subset of host-file and host-anchored Adblock Plus rules, not every upstream rule type.

## Security model

Sentinel blocks **requests matching local rules**. It does not parse arbitrary JavaScript source, inspect downloaded file contents, scan executable files, or guarantee that a page is safe. The malicious-script warning is triggered by a matching external script request; it cancels that request before the script can load, but the page itself may already have begun executing other code. It cannot reliably detect malicious inline scripts, newly created threat domains, or compromised first-party code.

The HTTP interstitial warns about an unencrypted top-level page load only after a non-redirect HTTP response has arrived; HTTP-to-HTTPS redirects are ignored. It does not turn HTTP into HTTPS. If you continue, information sent through that page is still not protected by HTTPS. A listed domain is a rule match, not a forensic verdict that every URL on the domain is malicious.

The log keeps up to 500 recent blocked requests and may include hostnames and blocked URLs. Exported backups can reveal browsing details; keep them private. Community lists may still break legitimate page features despite compatibility safeguards. The parser implements only a subset of upstream syntax, so results will not perfectly match uBlock Origin or other full filter engines. Test login, checkout, media, forms, and ordinary browsing before recommending the extension to other people.

## Code map

- `manifest.json` — permissions and extension entry points.
- `background.js` — request engine, rule parsing, counters, list updates, warning workflow, and local storage.
- `popup.html`, `popup.js`, `ui.css` — toolbar popup and shared styling.
- `dashboard.html`, `dashboard.js` — dashboard, settings, rule management, and activity log.
- `warning.html`, `warning.js`, `warning.css` — HTTP and known-threat interstitial.
- `localization.js`, `mods/translate/*.json` — UI localization and JSON-only translation packs.
- `content.js` — cosmetic selector application.
- `filters/hosts.txt` — local host rules using `category|hostname` lines.
- `filters/rules.txt` — conservative URL-substring rules.
- `filters/cosmetic.txt` — CSS selectors used to hide common ad containers.
- `tests/smoke-test.js` — mocked WebExtension test for core filtering and warning flows.

## Development checks

With a recent Node.js runtime:

```sh
node --check background.js
node --check popup.js
node --check dashboard.js
node --check content.js
node --check localization.js
node --check warning.js
node tests/smoke-test.js
```

The smoke test uses mocked WebExtension APIs. It is not a substitute for testing the extension in a real Firefox profile. Test in a separate profile, check ordinary websites and login/payment flows, and keep the extension's broad host access in mind before publishing.
