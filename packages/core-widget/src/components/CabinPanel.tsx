import { useState } from 'preact/hooks';
import type { ProfileSummary } from '@aida/shared';
import { panelOpen, cabinItems, profiles, activeProfileId } from '../state';
import { lang, t, profileLabel } from '../i18n';
import type { CabinApi } from '../api';

function Avatar({ api, p, label }: { api: CabinApi; p?: ProfileSummary; label: string }) {
  const src = api.imageUrl(p?.avatarUrl);
  return src ? (
    <img class="cabin-av" src={src} alt="" />
  ) : (
    <span class="cabin-av cabin-av-empty" aria-hidden="true">
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

export function CabinPanel({ api }: { api: CabinApi }) {
  const open = panelOpen.value;
  const items = cabinItems.value;
  const all = profiles.value;
  const activeId = activeProfileId.value;
  const s = t();
  const cur = lang.value;
  const [picking, setPicking] = useState(false);

  const meIndex = all.findIndex((p) => p.id === activeId);
  const me = meIndex >= 0 ? all[meIndex] : undefined;
  const meLabel = me ? profileLabel(me.name, meIndex) : s.profile;

  const remove = async (id: string) => {
    await api.removeCabin(id);
    cabinItems.value = cabinItems.value.filter((i) => i.id !== id);
  };

  // Cart behaviour: click a product → open its page (where its photos hydrate from cache).
  const openProduct = (pageUrl?: string) => {
    if (pageUrl) window.location.href = pageUrl;
  };

  // Another person means other try-ons everywhere on the page → reload so the page shows that person.
  const switchTo = async (id: string) => {
    if (id === activeId) return setPicking(false);
    await api.activateProfile(id);
    location.reload();
  };

  return (
    <>
      <div class={'cabin-scrim' + (open ? ' open' : '')} onClick={() => (panelOpen.value = false)} />
      <aside class={'cabin-panel' + (open ? ' open' : '')} aria-hidden={!open}>
        <header class="cabin-panel-head">
          <div class="cabin-brand-row">
            <img class="cabin-logo" src={api.imageUrl('/brand/mark-96.png')} alt="" />
            <div>
              <div class="cabin-brand">{s.brand}</div>
              <span class="cabin-sub">{s.panelSub}</span>
            </div>
          </div>
          <div class="cabin-head-right">
            <div class="cabin-lang">
              <button class={cur === 'en' ? 'on' : ''} onClick={() => (lang.value = 'en')}>EN</button>
              <span>|</span>
              <button class={cur === 'ro' ? 'on' : ''} onClick={() => (lang.value = 'ro')}>RO</button>
            </div>
            <button class="cabin-x" onClick={() => (panelOpen.value = false)} aria-label="close">&#10005;</button>
          </div>
        </header>

        {me && (
          <div class="cabin-who">
            <button class="cabin-who-btn" onClick={() => setPicking(!picking)} aria-expanded={picking}>
              <Avatar api={api} p={me} label={meLabel} />
              <span class="cabin-who-text">
                <span class="cabin-who-cap">{s.tryingAs}</span>
                <span class="cabin-who-name">{meLabel}</span>
              </span>
              <span class="cabin-who-caret" aria-hidden="true">{picking ? '▴' : '▾'}</span>
            </button>
            {picking && (
              <div class="cabin-who-list">
                {all.map((p, i) => (
                  <button class={'cabin-who-opt' + (p.id === activeId ? ' on' : '')} key={p.id} onClick={() => switchTo(p.id)}>
                    <Avatar api={api} p={p} label={profileLabel(p.name, i)} />
                    <span class="cabin-who-optname">{profileLabel(p.name, i)}</span>
                    {p.id === activeId && <span class="cabin-who-check" aria-hidden="true">&#10003;</span>}
                  </button>
                ))}
                <a class="cabin-who-link" href={api.profilePage()} target="_blank" rel="noopener">{s.manage}</a>
              </div>
            )}
            {!me.hasPhoto && !picking && (
              <a class="cabin-who-link" href={api.profilePage()} target="_blank" rel="noopener">{s.addPhoto}</a>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div class="cabin-empty">
            <span class="cabin-empty-d" aria-hidden="true">&#10209;</span>
            <p>{s.empty}</p>
          </div>
        ) : (
          <div class="cabin-items">
            {items.map((it) => (
              <div
                class="cabin-item"
                key={it.id}
                style={it.pageUrl ? 'cursor:pointer' : ''}
                onClick={() => openProduct(it.pageUrl)}
                title={it.pageUrl ? 'Open product page' : ''}
              >
                {it.status === 'processing' ? (
                  <div class="cabin-item-load"><span class="cabin-spinner-sm" /></div>
                ) : it.resultUrl ? (
                  <img src={api.imageUrl(it.resultUrl)} alt={it.name ?? ''} />
                ) : (
                  <img alt="" />
                )}
                <div class="cabin-item-meta">
                  <p class="cabin-item-name">{it.name ?? 'Product'}</p>
                  <span class="cabin-item-tag">{it.status === 'processing' ? s.generating : `${s.onYou} ✓`}</span>
                </div>
                {it.status !== 'processing' && (
                  <button
                    class="cabin-item-rm"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(it.id);
                    }}
                    aria-label={s.remove}
                  >
                    &#10005;
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}
