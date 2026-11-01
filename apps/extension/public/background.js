// Store tabs that were already open when the extension was installed, updated or turned back on have no
// content script (or an outdated one): put the current one in, so the button and the popup work without
// refreshing the page.
chrome.runtime.onInstalled.addListener(async () => {
  const matches = chrome.runtime.getManifest().content_scripts[0].matches;
  const tabs = await chrome.tabs.query({ url: matches });
  for (const t of tabs) {
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }).catch(() => {});
  }
});
