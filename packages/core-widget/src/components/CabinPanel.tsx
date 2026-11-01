import { panelOpen, cabinItems } from '../state';
import { lang, t } from '../i18n';
import type { CabinApi } from '../api';

export function CabinPanel({ api }: { api: CabinApi }) {
  const open = panelOpen.value;
  const items = cabinItems.value;
  const s = t();
  const cur = lang.value;

  const remove = async (id: string) => {
    await api.removeCabin(id);
    cabinItems.value = cabinItems.value.filter((i) => i.id !== id);
  };

  // Cart behaviour: click a product → open its page (where its photos hydrate from cache).
  const openProduct = (pageUrl?: string) => {
    if (pageUrl) window.location.href = pageUrl;
  };

  return (
    <>
      <div class={'cabin-scrim' + (open ? ' open' : '')} onClick={() => (panelOpen.value = false)} />
      <aside class={'cabin-panel' + (open ? ' open' : '')} aria-hidden={!open}>
        <header class="cabin-panel-head">
          <div>
            <div class="cabin-brand">{s.brand}</div>
            <span class="cabin-sub">{s.panelSub}</span>
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
