import { useState } from 'preact/hooks';
import type { ProfileSummary, TryonItem } from '@aida/shared';
import { panelOpen, cabinItems, profiles, activeProfileId, panelTab, tryons } from '../state';
import { lang, t, profileLabel } from '../i18n';
import { forgetReplacement } from '../replace';
import type { CabinApi } from '../api';
import { CabinRoom } from './CabinRoom';

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

/** Every converted photo of the person, newest first — tried on one by one or converted with a whole page. */
function TryonsList({ api }: { api: CabinApi }) {
  const s = t();
  const list = tryons.value;
  const pending = cabinItems.value.filter((i) => i.status === 'processing');
  // ✕ asks once more before a try-on is deleted (the photo goes back to the store's own picture).
  const [confirming, setConfirming] = useState<string | null>(null);

  const remove = async (it: TryonItem) => {
    try {
      await api.removeTryon(it.id);
    } catch {
      return setConfirming(null);
    }
    tryons.value = (tryons.value ?? []).filter((x) => x.id !== it.id);
    forgetReplacement(it.garmentImageUrl);
    setConfirming(null);
  };

  // Cart behaviour: click a product → open its page (where its photos hydrate from cache).
  const openProduct = (url?: string) => {
    if (url) window.location.href = url;
  };

  if (!pending.length && list !== null && !list.length) {
    return (
      <div class="cabin-empty">
        <span class="cabin-empty-d" aria-hidden="true">&#10209;</span>
        <p>{s.emptyTryons}</p>
      </div>
    );
  }
  return (
    <div class="cabin-items">
      {pending.map((it) => (
        <div class="cabin-item" key={it.id}>
          <div class="cabin-item-load">
            <span class="cabin-spinner-sm" />
          </div>
          <div class="cabin-item-meta">
            <p class="cabin-item-name">{it.name ?? 'Product'}</p>
            <span class="cabin-item-tag">{s.generating}</span>
          </div>
        </div>
      ))}
      {list === null && !pending.length && (
        <div class="cabin-list-load">
          <span class="cabin-spinner-sm" />
        </div>
      )}
      {(list ?? []).map((it) => {
        const link = it.productUrl ?? it.pageUrl;
        return (
          <div
            class="cabin-item"
            key={it.id}
            style={link ? 'cursor:pointer' : ''}
            onClick={() => openProduct(link)}
            title={link ? 'Open product page' : ''}
          >
            <img src={api.imageUrl(it.resultUrl)} alt={it.name ?? ''} loading="lazy" />
            <div class="cabin-item-meta">
              <p class="cabin-item-name">{it.name ?? `${s.photoFrom} ${it.site}`}</p>
              <span class="cabin-item-tag">{`${s.onYou} ✓`}</span>
              {it.name && it.site && <span class="cabin-item-site">{it.site}</span>}
            </div>
            {confirming === it.id ? (
              <button
                class="cabin-item-rm cabin-item-rm-ask"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(it);
                }}
                onMouseLeave={() => setConfirming(null)}
              >
                {s.confirmRemove}
              </button>
            ) : (
              <button
                class="cabin-item-rm"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(it.id);
                }}
                aria-label={s.remove}
              >
                &#10005;
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CabinPanel({ api }: { api: CabinApi }) {
  const open = panelOpen.value;
  const all = profiles.value;
  const activeId = activeProfileId.value;
  const tab = panelTab.value;
  const s = t();
  const cur = lang.value;
  const [picking, setPicking] = useState(false);
  const count = (tryons.value?.length ?? 0) + cabinItems.value.filter((i) => i.status === 'processing').length;

  const meIndex = all.findIndex((p) => p.id === activeId);
  const me = meIndex >= 0 ? all[meIndex] : undefined;
  const meLabel = me ? profileLabel(me.name, meIndex) : s.profile;

  // Another person means other try-ons everywhere on the page → reload so the page shows that person.
  const switchTo = async (id: string) => {
    if (id === activeId) return setPicking(false);
    await api.activateProfile(id);
    location.reload();
  };

  return (
    <>
      <div class={'cabin-scrim' + (open ? ' open' : '')} onClick={() => (panelOpen.value = false)} />
      <aside class={'cabin-panel' + (open ? ' open' : '') + (tab === 'cabin' ? ' wide' : '')} aria-hidden={!open}>
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

        <div class="cabin-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'tryons'} class={tab === 'tryons' ? 'on' : ''} onClick={() => (panelTab.value = 'tryons')}>
            {s.tabTryons}
            {count > 0 && <span class="cabin-tabs-n">{count}</span>}
          </button>
          <button role="tab" aria-selected={tab === 'cabin'} class={tab === 'cabin' ? 'on' : ''} onClick={() => (panelTab.value = 'cabin')}>
            {s.tabCabin}
          </button>
        </div>

        {tab === 'cabin' ? (
          <CabinRoom api={api} />
        ) : (
          <>
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
            <TryonsList api={api} />
          </>
        )}
      </aside>
    </>
  );
}
