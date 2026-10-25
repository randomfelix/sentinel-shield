# Sentinel Shield filter sources

The updater can fetch these lists when the user presses **Update filter lists** in the dashboard. It does not upload visited URLs or browsing history to list providers; it makes plain list-download requests to the configured upstream URLs. List contents are parsed locally.

| Source | Purpose | URL / project |
|---|---|---|
| StevenBlack unified hosts | Ad/tracker/malicious-domain starter feed, applied with compatibility safeguards | https://github.com/StevenBlack/hosts |
| EasyList | Advertising filters | https://easylist.to/easylist/easylist.txt |
| EasyPrivacy | Tracker/analytics filters | https://easylist.to/easylist/easyprivacy.txt |
| AdGuard Tracking Protection | Third-party tracking domains | https://adguardteam.github.io/AdGuardFilters/SpywareFilter/sections/tracking_servers.txt |
| Disconnect tracker data | Selected Analytics, Social, Fingerprinting and Cryptomining categories | https://github.com/disconnectme/disconnect-tracking-protection |
| Fanboy's Annoyance List | Annoyances (supported subset) | https://easylist-downloads.adblockplus.org/fanboy-annoyance.txt |
| Blocklist Project malware list | Malware-domain starter feed (supported host-anchored subset) | https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt |

**Licensing:** Sentinel Shield links to upstream lists and downloads them on user request rather than packaging copies of the full lists. The Disconnect tracker data is licensed CC BY-NC-SA 4.0; see its repository license before redistribution or commercial use. EasyList, EasyPrivacy, AdGuard and other upstream data remain subject to their respective upstream terms. Upstream projects are independent and are not affiliated with Sentinel Shield.

**Coverage limitation:** No public list covers every tracker or is free of false positives. Sentinel Shield deliberately prefers third-party domain rules and a supported syntax subset to avoid expanding rules in unsafe ways. Requests to shared first-party/CDN endpoints are subject to compatibility protections, and some site-local tracking cannot be identified by hostname alone.

