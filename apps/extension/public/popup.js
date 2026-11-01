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
