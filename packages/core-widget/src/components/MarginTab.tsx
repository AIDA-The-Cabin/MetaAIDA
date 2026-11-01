import { panelOpen, cabinItems } from '../state';
import { t } from '../i18n';

export function MarginTab() {
  const count = cabinItems.value;
  const s = t();
  return (
    <button class="cabin-tab" onClick={() => (panelOpen.value = !panelOpen.value)} aria-label={s.brand}>
      <span class="cabin-tab-diamond" aria-hidden="true">&#10209;</span>
      <span class="cabin-tab-word">{s.tabWord}</span>
      {count.length > 0 && <span class="cabin-tab-badge">{count.length}</span>}
    </button>
  );
}
