import { useEffect } from 'preact/hooks';
import { pageProgress } from '../state';
import { t } from '../i18n';

/** Whole-page conversion progress, bottom centre. Hides itself a few seconds after the run ends. */
export function PagePill() {
  const p = pageProgress.value;
  const s = t();
  useEffect(() => {
    if (!p || p.running) return;
    const id = window.setTimeout(() => (pageProgress.value = null), 8000);
    return () => window.clearTimeout(id);
  }, [p?.running]);
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
