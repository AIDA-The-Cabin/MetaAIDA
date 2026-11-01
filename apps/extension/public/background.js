// Unpacked (Load unpacked) installs only: when the extension's files on disk change — a new build copied
// into the loaded folder — reload the extension, so nobody has to open chrome://extensions and press ↻.
// Store installs have an update_url and never run this.
const UNPACKED = !('update_url' in chrome.runtime.getManifest());
const FILES = ['manifest.json', 'content.js', 'popup.js', 'popup.html', 'background.js'];

async function filesHash() {
  const parts = await Promise.all(
    FILES.map((f) => fetch(chrome.runtime.getURL(f), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''))),
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\n')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function check() {
  try {
    const now = await filesHash();
    const { cabinFilesHash } = await chrome.storage.local.get('cabinFilesHash');
    if (cabinFilesHash === now) return;
    await chrome.storage.local.set({ cabinFilesHash: now });
    if (cabinFilesHash) chrome.runtime.reload(); // first run only remembers the files
  } catch {
    /* a build is being copied right now — try again on the next tick */
  }
}

if (UNPACKED) {
  chrome.alarms.create('cabin-files', { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === 'cabin-files') check();
  });
  check();
}
