import { useEffect, useRef, useState } from 'preact/hooks';
import type { FigureBox, Outfit, OutfitSlot, ProfileFigure, TryonItem } from '@aida/shared';
import {
  activeProfileId,
  figure,
  outfitRun,
  outfitSlots,
  outfits,
  profiles,
  roomView,
  shownOutfit,
  tryons,
} from '../state';
import { t } from '../i18n';
import type { CabinApi } from '../api';

const SLOTS: OutfitSlot[] = ['hat', 'jewelry', 'top', 'bottoms', 'shoes'];

/**
 * The drop zones over the figure, as fractions of the photo: laid out from where SAM found the person and their
 * head, or — until it answers, or without a match — over a standing full-body photo.
 */
export function zonesFor(fig: ProfileFigure | null): Record<OutfitSlot, FigureBox> {
  const P = fig?.person && fig.person.y2 - fig.person.y1 > 0.3 ? fig.person : { x1: 0.2, y1: 0.02, x2: 0.8, y2: 0.99 };
  const ph = P.y2 - P.y1;
  const pw = P.x2 - P.x1;
  const cx = (P.x1 + P.x2) / 2;
  // The face (SAM), or where it sits on a standing figure: about the 5th–14th hundredth of its height.
  const F =
    fig?.face && fig.face.y2 > fig.face.y1 && fig.face.y2 < P.y1 + ph * 0.3
      ? fig.face
      : { x1: cx - pw * 0.15, y1: P.y1 + ph * 0.04, x2: cx + pw * 0.15, y2: P.y1 + ph * 0.135 };
  const fh = F.y2 - F.y1;
  const fw = Math.max(F.x2 - F.x1, fh * 0.75);
  const fc = (F.x1 + F.x2) / 2;
  const waist = P.y1 + ph * 0.46; // where a top ends and trousers begin
  const ankle = P.y1 + ph * 0.9;
  const fit = (b: FigureBox): FigureBox => ({
    x1: Math.max(0.01, b.x1),
    y1: Math.max(0.004, b.y1),
    x2: Math.min(0.99, b.x2),
    y2: Math.min(0.996, b.y2),
  });
  return {
    hat: fit({ x1: fc - fw * 1.05, x2: fc + fw * 1.05, y1: P.y1 - fh * 0.3, y2: F.y1 + fh * 0.22 }),
    jewelry: fit({ x1: fc - fw * 1.15, x2: fc + fw * 1.15, y1: F.y2 - fh * 0.08, y2: F.y2 + fh * 0.95 }),
    top: fit({ x1: P.x1, x2: P.x2, y1: F.y2 + fh * 0.95, y2: waist }),
    bottoms: fit({ x1: P.x1 + pw * 0.05, x2: P.x2 - pw * 0.05, y1: waist, y2: ankle }),
    shoes: fit({ x1: P.x1 + pw * 0.04, x2: P.x2 - pw * 0.04, y1: ankle, y2: P.y2 + 0.012 }),
  };
}

/**
 * A zone's place on the figure, and how far the figure's left and right edges are from it (in % of the zone's
 * width): with room beside the figure, the zone's name sits left of the figure and the chosen piece right of it.
 */
const pct = (b: FigureBox) => {
  const w = b.x2 - b.x1;
  return (
    `left:${(b.x1 * 100).toFixed(2)}%;top:${(b.y1 * 100).toFixed(2)}%;width:${(w * 100).toFixed(2)}%;height:${((b.y2 - b.y1) * 100).toFixed(2)}%;` +
    `--gl:${((b.x1 / w) * 100).toFixed(2)}%;--gr:${(((1 - b.x2) / w) * 100).toFixed(2)}%`
  );
};

/** The largest box of this shape that fits the stage, and whether there is room beside it for labels. */
function useFit(ratio: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, roomy: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      const w = Math.floor(Math.min(W, H * ratio));
      setSize({ w, h: Math.floor(w / ratio), roomy: (W - w) / 2 >= 104 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);
  return { ref, size };
}

/** The piece a saved outfit took from a try-on, as an item of the bar again ("Change pieces"). */
const pieceItem = (p: Outfit['pieces'][number]): TryonItem => ({
  id: p.tryonId,
  resultUrl: p.imageUrl ?? '',
  garmentImageUrl: p.garmentImageUrl,
  productUrl: p.productUrl,
  name: p.name,
  site: p.site,
  createdAt: 0,
});

/** The AI-is-drawing gradient over the figure, with the time so far. */
function Imagining() {
  const s = t();
  const started = outfitRun.value?.startedAt ?? Date.now();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((Date.now() - started) / 1000));
  return (
    <div class="gen" aria-live="polite">
      <div class="gen-aurora" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div class="gen-sheen" aria-hidden="true" />
      <div class="gen-text">
        <span class="gen-spark" aria-hidden="true">&#10022;</span>
        <strong>{s.imagining}</strong>
        <span class="gen-time">{`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}</span>
        <span class="gen-sub">{s.imaginingSub}</span>
      </div>
    </div>
  );
}

/** The figure, sized to the stage: the photo with its drop zones, or an outfit in its place. */
function Stage({
  api,
  photo,
  outfit,
  children,
}: {
  api: CabinApi;
  photo: string;
  outfit?: Outfit | null;
  children?: preact.ComponentChildren;
}) {
  const [ratio, setRatio] = useState(2 / 3);
  const { ref, size } = useFit(ratio);
  const running = !!outfitRun.value?.running;
  const src = outfit ? api.imageUrl(outfit.resultUrl) : photo;
  return (
    <div class="room-stage" ref={ref}>
      <div
        class={'fig' + (running && !outfit ? ' generating' : '') + (size.roomy ? ' roomy' : '')}
        style={size.w ? `width:${size.w}px;height:${size.h}px` : 'visibility:hidden'}
      >
        <div class="fig-clip">
          <img
            key={src}
            class={'fig-photo' + (outfit ? ' fig-reveal' : '')}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const im = e.currentTarget as HTMLImageElement;
              if (im.naturalWidth && im.naturalHeight) setRatio(im.naturalWidth / im.naturalHeight);
            }}
          />
        </div>
        {children}
        {running && !outfit && <Imagining />}
      </div>
    </div>
  );
}

export function CabinRoom({ api }: { api: CabinApi }) {
  const s = t();
  const items = tryons.value ?? [];
  const slots = outfitSlots.value;
  const run = outfitRun.value;
  const view = roomView.value;
  const saved = outfits.value;
  const me = profiles.value.find((p) => p.id === activeProfileId.value);
  const version = me?.avatarUrl?.split('?v=')[1] ?? me?.id ?? '';
  const [picked, setPicked] = useState<TryonItem | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<OutfitSlot | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // Where the person stands (once per photo) and the saved outfits (once per panel life).
  const figFor = useRef('');
  useEffect(() => {
    if (!me?.hasPhoto || figFor.current === version) return;
    figFor.current = version;
    void api.figure().then((f) => (figure.value = f));
  }, [version, me?.hasPhoto]);
  useEffect(() => {
    if (outfits.value === null) void api.listOutfits().then((o) => (outfits.value = o));
  }, []);

  if (!me?.hasPhoto) {
    return (
      <div class="cabin-empty">
        <span class="cabin-empty-d" aria-hidden="true">&#10209;</span>
        <p>{s.needPhoto}</p>
        <a class="cabin-who-link" href={api.profilePage()} target="_blank" rel="noopener">{s.addPhoto}</a>
      </div>
    );
  }

  const photo = api.photoUrl(version);
  const zones = zonesFor(figure.value);
  const filled = SLOTS.filter((k) => slots[k]);
  const used = new Set(filled.map((k) => slots[k]!.id));

  const assign = (slot: OutfitSlot, it: TryonItem) => {
    outfitSlots.value = { ...outfitSlots.value, [slot]: it };
    setPicked(null);
    if (outfitRun.value?.error) outfitRun.value = null;
  };
  const unassign = (slot: OutfitSlot) => {
    const next = { ...outfitSlots.value };
    delete next[slot];
    outfitSlots.value = next;
  };

  const imagine = async () => {
    const pick = outfitSlots.value;
    const ids = Object.fromEntries(SLOTS.filter((k) => pick[k]).map((k) => [k, pick[k]!.id]));
    if (!Object.keys(ids).length || outfitRun.value?.running) return;
    outfitRun.value = { running: true, startedAt: Date.now() };
    try {
      const o = await api.createOutfit(ids);
      outfitRun.value = null;
      outfits.value = [o, ...(outfits.value ?? []).filter((x) => x.id !== o.id)];
      shownOutfit.value = o;
      roomView.value = 'outfit';
    } catch (e) {
      outfitRun.value = { running: false, startedAt: 0, error: (e as Error).message };
    }
  };

  const showOutfit = (o: Outfit) => {
    shownOutfit.value = o;
    setConfirmDel(false);
    roomView.value = 'outfit';
  };
  const deleteOutfit = async (o: Outfit) => {
    try {
      await api.removeOutfit(o.id);
    } catch {
      return;
    }
    outfits.value = (outfits.value ?? []).filter((x) => x.id !== o.id);
    shownOutfit.value = null;
    setConfirmDel(false);
    roomView.value = 'saved';
  };
  const changePieces = (o: Outfit) => {
    const next: Partial<Record<OutfitSlot, TryonItem>> = {};
    for (const p of o.pieces) next[p.slot] = items.find((x) => x.id === p.tryonId) ?? pieceItem(p);
    outfitSlots.value = next;
    roomView.value = 'dress';
  };

  const cur = view === 'outfit' ? shownOutfit.value : null;

  return (
    <div class="room">
      <div class="room-main">
        <div class="room-switch" role="tablist">
          <button class={view === 'dress' ? 'on' : ''} onClick={() => (roomView.value = 'dress')}>
            {s.dressUp}
          </button>
          <button class={view !== 'dress' ? 'on' : ''} onClick={() => (roomView.value = 'saved')}>
            {s.myOutfits}
            {!!saved?.length && <span class="cabin-tabs-n">{saved.length}</span>}
          </button>
        </div>

        {view === 'saved' ? (
          <div class="room-saved">
            {saved === null ? (
              <div class="cabin-list-load">
                <span class="cabin-spinner-sm" />
              </div>
            ) : !saved.length ? (
              <p class="room-note">{s.noOutfits}</p>
            ) : (
              <div class="saved-grid">
                {saved.map((o) => (
                  <button class="saved-card" key={o.id} onClick={() => showOutfit(o)}>
                    <img src={api.imageUrl(o.resultUrl)} alt="" loading="lazy" />
                    <span>{`${o.pieces.length} ${o.pieces.length === 1 ? s.piece : s.piecesN}`}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : cur ? (
          <>
            <Stage api={api} photo={photo} outfit={cur}>
              <span class="fig-badge">{`${s.outfitSaved} ✓`}</span>
            </Stage>
            <div class="room-foot room-foot-outfit">
              <p class="room-cap">{s.pieces}</p>
              <ul class="pieces">
                {cur.pieces.map((p) => {
                  const body = (
                    <>
                      <img src={api.imageUrl(p.imageUrl) ?? p.garmentImageUrl} alt="" />
                      <span class="piece-text">
                        <span class="piece-slot">{s.slots[p.slot]}</span>
                        <span class="piece-name">{p.name ?? p.site}</span>
                        {p.productUrl && <span class="piece-link">{`${s.viewProduct} · ${p.site} ↗`}</span>}
                      </span>
                    </>
                  );
                  return (
                    <li key={p.slot}>
                      {p.productUrl ? (
                        <a class="piece" href={p.productUrl} target="_blank" rel="noopener" title={p.name ?? s.viewProduct}>
                          {body}
                        </a>
                      ) : (
                        <span class="piece">{body}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div class="room-actions">
                <button class="cabin-ghost" onClick={() => changePieces(cur)}>{s.changePieces}</button>
                <button
                  class="cabin-ghost"
                  onClick={() => {
                    outfitSlots.value = {};
                    roomView.value = 'dress';
                  }}
                >
                  {s.newOutfit}
                </button>
                {confirmDel ? (
                  <button class="cabin-ghost cabin-danger" onClick={() => void deleteOutfit(cur)} onMouseLeave={() => setConfirmDel(false)}>
                    {s.confirmRemove}
                  </button>
                ) : (
                  <button class="cabin-ghost cabin-danger" onClick={() => setConfirmDel(true)} aria-label={s.deleteOutfit} title={s.deleteOutfit}>
                    &#10005;
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <Stage api={api} photo={photo}>
              {!run?.running &&
                SLOTS.map((slot) => {
                  const it = slots[slot];
                  return (
                    <div
                      key={slot}
                      class={
                        'zone zone-' + slot + (it ? ' filled' : '') + (over === slot ? ' over' : '') + (dragging || picked ? ' live' : '')
                      }
                      style={pct(zones[slot])}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                        if (over !== slot) setOver(slot);
                      }}
                      onDragLeave={(e) => {
                        if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setOver((o) => (o === slot ? null : o));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer?.getData('text/plain');
                        const hit = items.find((x) => x.id === id);
                        if (hit) assign(slot, hit);
                        setOver(null);
                        setDragging(false);
                      }}
                      onClick={() => picked && assign(slot, picked)}
                    >
                      <span class="zone-label">{s.slots[slot]}</span>
                      {it && (
                        <span class="zone-chip">
                          <img src={api.imageUrl(it.resultUrl)} alt="" draggable={false} />
                          <button
                            class="zone-x"
                            onClick={(e) => {
                              e.stopPropagation();
                              unassign(slot);
                            }}
                            aria-label={s.remove}
                          >
                            &#10005;
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
            </Stage>
            <div class="room-foot">
              {run?.error ? (
                <p class="room-err">
                  <strong>{s.outfitFailed}</strong>
                  <span>{run.error}</span>
                </p>
              ) : (
                <p class="room-note">{picked ? s.pickedHint : s.dressHint}</p>
              )}
              <div class="room-go-row">
                <button class="cabin-add room-go" disabled={!filled.length || !!run?.running} onClick={() => void imagine()}>
                  {run?.running ? (
                    <span class="cabin-spinner-sm room-go-spin" />
                  ) : (
                    <span class="room-go-spark" aria-hidden="true">&#10022;</span>
                  )}
                  {run?.running ? s.imagining : s.imagine}
                </button>
                {!!filled.length && !run?.running && (
                  <button class="cabin-ghost room-clear" onClick={() => (outfitSlots.value = {})}>
                    {s.clear}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <aside class="room-bar" aria-label={s.tabTryons}>
        {tryons.value === null ? (
          <div class="cabin-list-load">
            <span class="cabin-spinner-sm" />
          </div>
        ) : !items.length ? (
          <p class="room-bar-empty">{s.noPieces}</p>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              role="button"
              tabIndex={0}
              class={'bar-item' + (picked?.id === it.id ? ' picked' : '') + (used.has(it.id) ? ' used' : '')}
              draggable
              title={it.name ?? it.site}
              onDragStart={(e) => {
                e.dataTransfer?.setData('text/plain', it.id);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
                setPicked(null);
                setDragging(true);
                if (roomView.value !== 'dress') roomView.value = 'dress';
              }}
              onDragEnd={() => {
                setDragging(false);
                setOver(null);
              }}
              onClick={() => {
                setPicked(picked?.id === it.id ? null : it);
                if (roomView.value !== 'dress') roomView.value = 'dress';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPicked(picked?.id === it.id ? null : it);
                }
              }}
            >
              <img src={api.imageUrl(it.resultUrl)} alt={it.name ?? ''} loading="lazy" draggable={false} />
            </div>
          ))
        )}
      </aside>
    </div>
  );
}
