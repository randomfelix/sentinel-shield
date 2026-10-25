/* Chrome MV3 compatibility shim for shared UI/content scripts. Requires Chrome 122+. */
'use strict';
if (!globalThis.browser && globalThis.chrome) globalThis.browser = globalThis.chrome;
globalThis.SENTINEL_CHROME_BUILD = true;
