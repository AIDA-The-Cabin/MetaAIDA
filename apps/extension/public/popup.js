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
