const API = 'https://metaaida.pages.dev';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---- credits (1 generated image = 1 credit) ---- */
function loadCredits() {
  fetch(API + '/v1/credits')
    .then((r) => r.json())
    .then(({ credits }) => {
      const el = $('#credits');
      if (el) el.textContent = credits;
    })
    .catch(() => {});
}
loadCredits();

/* ---- profiles: who is trying clothes on (switching reloads the open shop tabs) ---- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function renderProfiles(data) {
  const box = $('#profiles');
  if (!data || !data.profiles || !data.profiles.length) {
    box.innerHTML = '<p class="hint" style="margin: 0 0 8px;">No profiles yet.</p>';
    return;
  }
  box.innerHTML = data.profiles
    .map((p, i) => {
      const label = (p.name && p.name.trim()) || 'Profile ' + (i + 1);
      const av = p.avatarUrl
        ? `<img class="av" src="${API}${p.avatarUrl}" alt="">`
        : `<span class="av empty">${esc(label.charAt(0).toUpperCase())}</span>`;
      return (
        `<div class="opt${p.id === data.activeId ? ' sel' : ''}" data-profile="${esc(p.id)}">${av}` +
        `<span class="nm">${esc(label)}</span>${p.hasPhoto ? '' : '<span class="meta">no photo</span>'}</div>`
      );
    })
    .join('');
  $$('.opt[data-profile]').forEach((o) =>
    o.addEventListener('click', () => {
      if (o.dataset.profile === data.activeId) return;
      fetch(API + '/v1/profiles/' + o.dataset.profile + '/activate', { method: 'POST' })
        .then(() => {
          chrome.storage.local.set({ cabinProfileSwitch: Date.now() }); // open shop tabs reload with the new person
          loadProfiles();
        })
        .catch(() => {});
    }),
  );
}
function loadProfiles() {
  fetch(API + '/v1/profiles')
    .then((r) => r.json())
    .then(renderProfiles)
    .catch(() => {
      $('#profiles').innerHTML = '<p class="hint" style="margin: 0 0 8px;">Could not load profiles.</p>';
    });
}
loadProfiles();

/* ---- on / off ---- */
const sw = $('#sw');
const lab = $('#lab');
function renderSwitch(on) {
  sw.classList.toggle('on', on);
  lab.textContent = on ? 'On' : 'Off';
}
chrome.storage.local.get('cabinEnabled', (r) => renderSwitch(r.cabinEnabled !== false));
sw.addEventListener('click', () => {
  chrome.storage.local.get('cabinEnabled', (r) => {
    const next = !(r.cabinEnabled !== false);
    chrome.storage.local.set({ cabinEnabled: next });
    renderSwitch(next);
  });
});

/* ---- scope: Individual (default) | Perpetual ---- */
function selectScope(scope) {
  $$('.opt[data-scope]').forEach((o) => o.classList.toggle('sel', o.dataset.scope === scope));
}
$$('.opt[data-scope]').forEach((o) =>
  o.addEventListener('click', () => {
    chrome.storage.local.set({ cabinScope: o.dataset.scope });
    selectScope(o.dataset.scope);
  }),
);
chrome.storage.local.get('cabinScope', (r) => selectScope(r.cabinScope === 'page' ? 'page' : 'image'));

/* ---- this page: a dry run (count + cost, nothing generated) and the whole-page conversion ---- */
function toPage(type) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs && tabs[0] && tabs[0].id;
      if (!id) return resolve(null);
      const send = (retry) =>
        chrome.tabs.sendMessage(id, { type }, (res) => {
          if (!chrome.runtime.lastError) return resolve(res);
          if (!retry) return resolve(null);
          // No content script in this tab yet (opened before the extension was installed or updated): add it.
          chrome.scripting
            .executeScript({ target: { tabId: id }, files: ['content.js'] })
            .then(() => setTimeout(() => send(false), 1200))
            .catch(() => resolve(null));
        });
      send(true);
    });
  });
}
const NOT_HERE = 'The Cabin is not running on this page.';
$('#plan').addEventListener('click', async () => {
  const info = $('#pageinfo');
  info.textContent = 'Checking — scrolling through the page to find every photo…';
  const r = await toPage('cabin-plan-page');
  if (!r) return (info.textContent = NOT_HERE);
  if (r.error) return (info.textContent = r.error);
  const parts = [r.total + ' photos', r.cached + ' converted', r.todo + ' to convert', 'up to $' + r.estimateUsd.toFixed(2)];
  if (r.skip) parts.push(r.skip + ' skipped');
  if (r.unreachable) parts.push(r.unreachable + ' unreachable');
  info.textContent = parts.join(' · ') + '. Photos without exactly one person are skipped before any image is made.';
});
$('#convert').addEventListener('click', async () => {
  const r = await toPage('cabin-convert-page');
  $('#pageinfo').textContent = !r ? NOT_HERE : r.error ? r.error : 'Converting — follow the progress on the page.';
});
