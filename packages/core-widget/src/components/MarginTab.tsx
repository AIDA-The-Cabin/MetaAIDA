import { panelOpen, cabinItems, profiles, activeProfileId } from '../state';
import { t } from '../i18n';
import type { CabinApi } from '../api';

export function MarginTab({ api }: { api: CabinApi }) {
  const count = cabinItems.value;
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
      {count.length > 0 && <span class="cabin-tab-badge">{count.length}</span>}
    </button>
  );
}
