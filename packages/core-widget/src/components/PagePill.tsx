import { useEffect } from 'preact/hooks';
import { pageProgress, tryonStatus } from '../state';
import { t } from '../i18n';

/**
 * Bottom centre: whole-page conversion progress, or — right after "Show my try-ons" is turned on — how many
 * photos on this page show the customer. Hides itself a few seconds after either one is settled.
 */
export function PagePill() {
  const p = pageProgress.value;
  const st = tryonStatus.value;
  const s = t();
  useEffect(() => {
    if (!p || p.running) return;
    const id = window.setTimeout(() => (pageProgress.value = null), 8000);
    return () => window.clearTimeout(id);
  }, [p?.running]);
  useEffect(() => {
    if (!st || st.loading) return;
    const id = window.setTimeout(() => (tryonStatus.value = null), 6000);
    return () => window.clearTimeout(id);
  }, [st?.loading]);

  if (!p && st) {
    return (
      <div class="cabin-pill" role="status">
        {st.loading && <span class="cabin-spinner-sm" />}
        <span class="cabin-pill-text">
          {st.loading
            ? s.showingTryons
            : st.count
              ? `✓ ${st.count} ${st.count === 1 ? s.photoOnYou : s.photosOnYou}`
              : s.noTryonsHere}
        </span>
        {!st.loading && (
          <button class="cabin-pill-x" onClick={() => (tryonStatus.value = null)} aria-label={s.close}>
            ×
          </button>
        )}
      </div>
    );
  }
  if (!p) return null;

  const handled = p.done + p.skipped + p.failed;
  const extra = [p.skipped ? `${p.skipped} ${s.skipped}` : '', p.failed ? `${p.failed} ${s.failed}` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <div class="cabin-pill" role="status">
      {p.running && <span class="cabin-spinner-sm" />}
      <span class="cabin-pill-text">
        {p.running
          ? `${s.pageConverting} · ${handled} / ${p.total}`
          : `${p.stopped === 'credits' ? s.outOfCredits : s.pageDone} · ${p.done} ${s.photos}`}
        {extra && <span class="cabin-pill-extra"> · {extra}</span>}
      </span>
      {!p.running && (
        <button class="cabin-pill-x" onClick={() => (pageProgress.value = null)} aria-label={s.close}>
          ×
        </button>
      )}
    </div>
  );
}
