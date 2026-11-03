import { panelOpen, cabinItems, profiles, activeProfileId, tryons } from '../state';
import { t } from '../i18n';
import type { CabinApi } from '../api';

export function MarginTab({ api }: { api: CabinApi }) {
  // The badge counts what the panel's first tab lists: every try-on, and those still being made.
  const count = (tryons.value?.length ?? 0) + cabinItems.value.filter((i) => i.status === 'processing').length;
  const s = t();
  // The active person's face sits on the tab, so it is always clear who is trying clothes on.
  const avatar = api.imageUrl(profiles.value.find((p) => p.id === activeProfileId.value)?.avatarUrl);
  return (
    <button class="cabin-tab" onClick={() => (panelOpen.value = !panelOpen.value)} aria-label={s.brand}>
      {avatar ? (
        <img class="cabin-tab-av" src={avatar} alt="" />
      ) : (
        <img class="cabin-tab-logo" src={api.imageUrl('/brand/mark-96.png')} alt="" />
      )}
      <span class="cabin-tab-word">{s.tabWord}</span>
      {count > 0 && <span class="cabin-tab-badge">{count}</span>}
    </button>
  );
}
