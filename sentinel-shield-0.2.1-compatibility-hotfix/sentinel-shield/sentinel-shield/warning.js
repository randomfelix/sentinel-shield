'use strict';
(() => {
  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const warningId = params.get('id') || '';
  let kind = 'http';
  let destination = '';
  let sourceHost = '';
  const i18n = () => window.SentinelI18n;
  const t = (key, values) => i18n()?.t(key, values) ?? key;

  function showError(message) {
    $('#warningError').textContent = message;
    $('#warningError').classList.add('show');
  }

  function renderWarning() {
    const isHttp = kind === 'http';
    $('#warningKind').textContent = t(isHttp ? 'UNENCRYPTED CONNECTION' : 'KNOWN THREAT WARNING');
    $('#warningTitle').textContent = `${t('This site may not be safe')}!`;
    $('#warningMessage').textContent = isHttp
      ? t('This website does not use HTTPS. Avoid entering passwords, payment details, or other confidential information.')
      : t('Sentinel detected a known malicious script request and blocked it before the script could load. Do you want to continue to this site?');
    $('#destinationLabel').textContent = t('Destination website');
    try { $('#destinationHost').textContent = new URL(destination).hostname; }
    catch { $('#destinationHost').textContent = t('Unknown destination'); }
    $('#warningFootnote').textContent = isHttp
      ? t('The destination uses unencrypted HTTP. The connection may be read or modified by others on the network.')
      : t('Continuing keeps known malicious scripts blocked.');

    if (isHttp) {
      $('#warningDetail').textContent = t('This website does not use HTTPS. Avoid entering passwords, payment details, or other confidential information.');
    } else {
      $('#warningDetail').textContent = sourceHost
        ? `${t('Detected script host')}: ${sourceHost}. ${t('The script request was blocked.')}`
        : t('The page requested a known blocked script.');
    }
    $('#continueButton').textContent = t('Yes, continue');
    $('#backButton').textContent = t('No, go back');
    $('#continueButton').disabled = !destination;
    i18n()?.apply();
  }

  async function currentTabId() {
    const tab = await browser.tabs.getCurrent();
    if (!tab || !Number.isInteger(tab.id)) throw new Error(t('Could not identify the warning tab'));
    return tab.id;
  }

  $('#continueButton').addEventListener('click', async () => {
    $('#continueButton').disabled = true;
    $('#backButton').disabled = true;
    try {
      const tabId = await currentTabId();
      await browser.runtime.sendMessage({ type: 'WARNING_CONTINUE', tabId, warningId });
    } catch (error) {
      showError(error.message || String(error));
      $('#continueButton').disabled = !destination;
      $('#backButton').disabled = false;
    }
  });

  $('#backButton').addEventListener('click', async () => {
    $('#continueButton').disabled = true;
    $('#backButton').disabled = true;
    try {
      const tabId = await currentTabId();
      await browser.runtime.sendMessage({ type: 'WARNING_BACK', tabId, warningId });
    } catch (error) {
      showError(error.message || String(error));
      $('#continueButton').disabled = !destination;
      $('#backButton').disabled = false;
    }
  });

  (async () => {
    await i18n()?.init();
    if (!warningId) {
      showError(t('This warning has expired. Go back and open the site again.'));
      $('#continueButton').disabled = true;
      renderWarning();
      return;
    }
    try {
      const warning = await browser.runtime.sendMessage({ type: 'GET_WARNING_DATA', warningId });
      kind = ['http', 'malware-script', 'malware-site'].includes(warning.kind) ? warning.kind : 'http';
      const candidate = new URL(warning.destination);
      if (!['http:', 'https:'].includes(candidate.protocol)) throw new Error(t('Invalid destination URL'));
      destination = candidate.href;
      sourceHost = String(warning.source || '');
      renderWarning();
    } catch (error) {
      showError(error.message || String(error));
      $('#continueButton').disabled = true;
      $('#backButton').disabled = false;
      renderWarning();
    }
  })();
})();
