// Styles injected into the widget's Shadow DOM (isolated from the host page).
export const baseStyles = `
*{box-sizing:border-box}
.cabin-ui{font-family:var(--cabin-font-sans);color:var(--cabin-text-hi)}
button{font-family:inherit}

/* ---- margin tab ---- */
.cabin-tab{
  position:fixed;right:0;top:20%;
  display:flex;flex-direction:column;align-items:center;gap:8px;
  background:var(--cabin-bg-surface);color:var(--cabin-gold-300);
  border:1px solid var(--cabin-border-gold);border-right:none;
  border-radius:12px 0 0 12px;padding:16px 9px;cursor:pointer;
  box-shadow:-6px 0 26px rgba(0,0,0,.45);z-index:2147483601;
  transition:background .25s var(--cabin-ease),color .25s var(--cabin-ease);
}
.cabin-tab:hover{background:var(--cabin-bg-elevated);color:var(--cabin-gold-100)}
.cabin-tab-word{writing-mode:vertical-rl;text-orientation:mixed;letter-spacing:.32em;
  font-size:12px;font-weight:600;text-transform:uppercase}
.cabin-tab-diamond{font-size:13px;line-height:1;
  background:var(--cabin-shine);-webkit-background-clip:text;background-clip:text;color:transparent}
.cabin-tab-badge{position:absolute;top:-8px;left:-8px;min-width:20px;height:20px;border-radius:10px;
  background:var(--cabin-gold-button);color:var(--cabin-bg-base);font-size:11px;font-weight:700;
  display:flex;align-items:center;justify-content:center;padding:0 5px;border:1px solid var(--cabin-gold-900)}

/* ---- slide-out panel ---- */
.cabin-scrim{position:fixed;inset:0;background:rgba(4,5,7,.55);backdrop-filter:blur(2px);
  opacity:0;pointer-events:none;transition:opacity .3s var(--cabin-ease);z-index:2147483602}
.cabin-scrim.open{opacity:1;pointer-events:auto}
.cabin-panel{
  position:fixed;top:0;right:0;height:100%;width:380px;max-width:92vw;
  background:linear-gradient(180deg,#15171b,var(--cabin-bg-surface));
  border-left:1px solid var(--cabin-border-gold);box-shadow:-18px 0 60px rgba(0,0,0,.6);
  transform:translateX(100%);transition:transform .34s var(--cabin-ease),width .34s var(--cabin-ease);
  z-index:2147483603;display:flex;flex-direction:column}
.cabin-panel.open{transform:translateX(0)}
.cabin-panel.wide{width:min(900px,96vw);max-width:96vw}
.cabin-panel-head{display:flex;align-items:center;justify-content:space-between;
  padding:22px 22px 14px;border-bottom:1px solid var(--cabin-border)}
.cabin-brand{font-family:var(--cabin-font-serif);font-size:26px;letter-spacing:.02em;
  background:var(--cabin-shine);-webkit-background-clip:text;background-clip:text;color:transparent}
.cabin-sub{display:block;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--cabin-text-low);margin-top:2px}
.cabin-x{background:none;border:none;color:var(--cabin-text-mid);font-size:22px;cursor:pointer;line-height:1;padding:6px}
.cabin-x:hover{color:var(--cabin-gold-300)}
.cabin-head-right{display:flex;align-items:center;gap:10px}
.cabin-lang{display:flex;align-items:center;gap:5px}
.cabin-lang span{color:var(--cabin-text-low);font-size:10px}
.cabin-lang button{background:none;border:none;color:var(--cabin-text-low);cursor:pointer;font-size:11px;letter-spacing:.06em;padding:2px 3px}
.cabin-lang button.on{color:var(--cabin-gold-300)}
.cabin-lang button:hover{color:var(--cabin-gold-100)}
.cabin-items{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.cabin-item{display:flex;gap:12px;background:var(--cabin-bg-elevated);border:1px solid var(--cabin-border);
  border-radius:12px;padding:10px;align-items:center}
.cabin-item img{width:62px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--cabin-border);background:#000}
.cabin-item-load{width:62px;height:84px;border-radius:8px;border:1px solid var(--cabin-border);background:var(--cabin-bg-inset);display:flex;align-items:center;justify-content:center;flex:none}
.cabin-spinner-sm{width:22px;height:22px;border-radius:50%;border:2px solid var(--cabin-border);border-top-color:var(--cabin-gold-500);animation:cabin-spin 1s linear infinite}
.cabin-item-meta{flex:1;min-width:0}
.cabin-item-name{font-size:13px;color:var(--cabin-text-hi);margin:0 0 4px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cabin-item-tag{font-size:11px;color:var(--cabin-gold-300);letter-spacing:.04em}
.cabin-item-site{display:block;margin-top:3px;font-size:11px;color:var(--cabin-text-low);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cabin-item-rm{background:none;border:none;color:var(--cabin-text-low);cursor:pointer;font-size:16px;padding:6px;flex:none}
.cabin-item-rm:hover{color:#c77}
.cabin-item-rm-ask{font-size:12px;color:#e3a0a0;border:1px solid #6a3434;border-radius:8px;padding:5px 9px}
.cabin-list-load{display:flex;justify-content:center;padding:26px}
.cabin-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  text-align:center;color:var(--cabin-text-mid);padding:30px}
.cabin-empty-d{font-size:30px;background:var(--cabin-shine);-webkit-background-clip:text;background-clip:text;color:transparent}
.cabin-empty p{margin:0;font-size:14px;line-height:1.6;max-width:230px}

/* ---- result modal ---- */
.cabin-modal-scrim{position:fixed;inset:0;background:rgba(4,5,7,.74);backdrop-filter:blur(4px);
  display:flex;align-items:center;justify-content:center;padding:24px;z-index:2147483604}
.cabin-modal{width:420px;max-width:94vw;max-height:92vh;overflow:hidden;
  background:linear-gradient(180deg,var(--cabin-bg-elevated),var(--cabin-bg-surface));
  border:1px solid var(--cabin-border-gold);border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.7);
  display:flex;flex-direction:column}
.cabin-modal-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;
  border-bottom:1px solid var(--cabin-border)}
.cabin-modal-title{font-family:var(--cabin-font-serif);font-size:19px;color:var(--cabin-gold-100)}
.cabin-stage{position:relative;background:var(--cabin-bg-inset);min-height:300px;
  display:flex;align-items:center;justify-content:center;overflow:hidden}
.cabin-stage img{width:100%;display:block}
.cabin-modal-foot{padding:14px 18px;display:flex;gap:10px}
.cabin-add{flex:1;height:46px;border:none;border-radius:11px;cursor:pointer;
  font-size:14px;font-weight:600;color:var(--cabin-bg-base);background:var(--cabin-gold-button);
  box-shadow:var(--cabin-gold-glow);transition:filter .2s var(--cabin-ease)}
.cabin-add:hover{filter:brightness(1.08)}
.cabin-add:disabled{opacity:.5;cursor:default;filter:none}
.cabin-ghost{height:46px;padding:0 16px;border:1px solid var(--cabin-border);border-radius:11px;
  background:transparent;color:var(--cabin-text-mid);cursor:pointer}
.cabin-ghost:hover{border-color:var(--cabin-gold-700);color:var(--cabin-gold-300)}

/* loading / error */
.cabin-load{display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--cabin-text-mid);padding:40px}
.cabin-spinner{width:46px;height:46px;border-radius:50%;
  border:3px solid var(--cabin-border);border-top-color:var(--cabin-gold-500);
  animation:cabin-spin 1s linear infinite}
@keyframes cabin-spin{to{transform:rotate(360deg)}}
.cabin-load-text{font-size:13px;letter-spacing:.03em}
.cabin-err{padding:40px;text-align:center;color:#d98;font-size:13px;line-height:1.6}

/* ---- logo ---- */
.cabin-brand-row{display:flex;align-items:center;gap:10px}
.cabin-logo{width:36px;height:36px;flex:none;display:block}
.cabin-tab-logo{width:28px;height:28px;display:block}

/* ---- who is trying clothes on: avatar + profile switcher ---- */
.cabin-tab-av{width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid var(--cabin-gold-500);display:block}
.cabin-av{width:32px;height:32px;border-radius:50%;object-fit:cover;flex:none;border:1px solid var(--cabin-border-gold);background:var(--cabin-bg-inset)}
.cabin-av-empty{display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:var(--cabin-gold-300)}
.cabin-who{padding:12px 16px;border-bottom:1px solid var(--cabin-border);display:flex;flex-direction:column;gap:8px}
.cabin-who-btn{display:flex;align-items:center;gap:11px;width:100%;background:var(--cabin-bg-elevated);border:1px solid var(--cabin-border);
  border-radius:12px;padding:8px 12px 8px 8px;cursor:pointer;color:var(--cabin-text-hi);text-align:left;transition:border-color .2s var(--cabin-ease)}
.cabin-who-btn:hover{border-color:var(--cabin-gold-700)}
.cabin-who-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.cabin-who-cap{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--cabin-text-low)}
.cabin-who-name{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cabin-who-caret{color:var(--cabin-text-low);font-size:12px}
.cabin-who-list{display:flex;flex-direction:column;gap:6px}
.cabin-who-opt{display:flex;align-items:center;gap:10px;width:100%;background:transparent;border:1px solid var(--cabin-border);
  border-radius:10px;padding:6px 10px 6px 6px;cursor:pointer;color:var(--cabin-text-mid);font-size:13px;text-align:left}
.cabin-who-opt:hover{border-color:var(--cabin-gold-700);color:var(--cabin-text-hi)}
.cabin-who-opt.on{border-color:var(--cabin-gold-500);color:var(--cabin-text-hi)}
.cabin-who-opt .cabin-av{width:26px;height:26px}
.cabin-who-optname{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cabin-who-check{color:var(--cabin-gold-300)}
.cabin-who-link{align-self:flex-start;font-size:12px;color:var(--cabin-gold-300);text-decoration:none;padding:2px}
.cabin-who-link:hover{color:var(--cabin-gold-100)}

/* ---- whole-page conversion progress ---- */
.cabin-pill{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483605;
  display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:10px 14px 10px 16px;border-radius:999px;
  background:var(--cabin-bg-surface);border:1px solid var(--cabin-border-gold);box-shadow:0 12px 40px rgba(0,0,0,.55);
  color:var(--cabin-text-hi);font-size:13px}
.cabin-pill-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cabin-pill-extra{color:var(--cabin-text-low)}
.cabin-pill-x{background:none;border:none;color:var(--cabin-text-low);cursor:pointer;font-size:17px;line-height:1;padding:0 2px}
.cabin-pill-x:hover{color:var(--cabin-gold-300)}

/* ---- tabs: Try ons | The Cabin ---- */
.cabin-tabs{display:flex;gap:4px;padding:10px 16px 0;border-bottom:1px solid var(--cabin-border)}
.cabin-tabs button{position:relative;display:inline-flex;align-items:center;gap:7px;background:none;border:none;cursor:pointer;
  padding:10px 12px 12px;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--cabin-text-low);
  transition:color .2s var(--cabin-ease)}
.cabin-tabs button:hover{color:var(--cabin-text-hi)}
.cabin-tabs button.on{color:var(--cabin-gold-300)}
.cabin-tabs button.on::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px;background:var(--cabin-gold-button)}
.cabin-tabs-n{min-width:20px;height:18px;padding:0 6px;border-radius:9px;background:var(--cabin-bg-elevated);border:1px solid var(--cabin-border);
  color:var(--cabin-text-mid);font-size:10px;letter-spacing:0;display:inline-flex;align-items:center;justify-content:center}
.cabin-tabs button.on .cabin-tabs-n,.room-switch button.on .cabin-tabs-n{border-color:var(--cabin-gold-700);color:var(--cabin-gold-100)}

/* ---- the Cabin: dressing room (centre) + the try-ons bar (right) ---- */
.room{flex:1;min-height:0;display:flex}
.room-main{flex:1;min-width:0;display:flex;flex-direction:column;padding:12px 18px 16px}
.room-switch{align-self:center;display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:var(--cabin-bg-inset);border:1px solid var(--cabin-border);margin-bottom:12px}
.room-switch button{display:inline-flex;align-items:center;gap:7px;background:none;border:none;border-radius:999px;cursor:pointer;
  padding:6px 14px;font-size:12px;color:var(--cabin-text-mid);transition:background .2s var(--cabin-ease),color .2s var(--cabin-ease)}
.room-switch button:hover{color:var(--cabin-text-hi)}
.room-switch button.on{background:var(--cabin-bg-elevated);color:var(--cabin-gold-100);box-shadow:inset 0 0 0 1px var(--cabin-border-gold)}
.room-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative}
.fig{position:relative;border-radius:16px;background:var(--cabin-bg-inset);
  box-shadow:0 0 0 1px var(--cabin-border-gold),0 22px 60px rgba(0,0,0,.5)}
.fig-clip{position:absolute;inset:0;border-radius:16px;overflow:hidden}
.fig-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;user-select:none;border-radius:16px;
  transition:filter .9s var(--cabin-ease),transform .9s var(--cabin-ease)}
.fig.generating .fig-photo{filter:blur(12px) saturate(.75) brightness(.72);transform:scale(1.06)}
.fig-reveal{animation:fig-reveal 1.3s var(--cabin-ease) both}
@keyframes fig-reveal{from{opacity:0;filter:blur(22px) saturate(1.4);transform:scale(1.05)}to{opacity:1;filter:none;transform:none}}
.fig-badge{position:absolute;left:10px;top:10px;padding:5px 10px;border-radius:999px;font-size:11px;letter-spacing:.04em;
  color:var(--cabin-gold-100);background:rgba(8,9,10,.66);border:1px solid var(--cabin-border-gold);backdrop-filter:blur(6px)}

/* drop zones, laid over the figure */
.zone{position:absolute;border-radius:12px;border:1.5px dashed rgba(231,201,119,.55);background:rgba(201,162,75,.05);
  transition:border-color .2s var(--cabin-ease),background .2s var(--cabin-ease),box-shadow .2s var(--cabin-ease);cursor:default}
.zone.live{border-color:rgba(231,201,119,.75);background:rgba(201,162,75,.08);cursor:copy}
.zone.over{border-style:solid;border-color:var(--cabin-gold-300);background:rgba(201,162,75,.24);box-shadow:0 0 0 3px rgba(201,162,75,.25),inset 0 0 30px rgba(231,201,119,.25)}
.zone.filled{border-style:solid;border-color:rgba(231,201,119,.7);background:rgba(201,162,75,.12)}
.zone-label{position:absolute;left:6px;top:6px;padding:2px 7px;border-radius:999px;font-size:9.5px;font-weight:600;letter-spacing:.12em;
  text-transform:uppercase;color:var(--cabin-gold-100);background:rgba(8,9,10,.62);border:1px solid rgba(201,162,75,.35);
  white-space:nowrap;pointer-events:none;backdrop-filter:blur(4px)}
.zone-hat .zone-label,.zone-jewelry .zone-label{top:50%;left:auto;right:calc(100% + 6px);transform:translateY(-50%)}
.zone-chip{position:absolute;right:6px;top:50%;transform:translateY(-50%);height:min(56px,calc(100% - 8px));aspect-ratio:3/4;
  border-radius:8px;overflow:visible;box-shadow:0 0 0 2px var(--cabin-gold-500),0 8px 18px rgba(0,0,0,.45);background:#000}
.zone-chip img{width:100%;height:100%;object-fit:cover;border-radius:8px;display:block}
.zone-hat .zone-chip,.zone-jewelry .zone-chip{right:auto;left:calc(100% + 6px)}
/* room beside the figure: names on its left, chosen pieces on its right, each tied to its zone by a fine line */
.fig.roomy .zone-label{top:50%;left:auto;right:calc(100% + var(--gl) + 14px);transform:translateY(-50%);font-size:10px;padding:3px 9px}
.fig.roomy .zone::before{content:"";position:absolute;top:50%;right:100%;width:calc(var(--gl) + 13px);border-top:1px dashed rgba(231,201,119,.45);pointer-events:none}
.fig.roomy .zone-chip,.fig.roomy .zone-hat .zone-chip,.fig.roomy .zone-jewelry .zone-chip{right:auto;left:calc(100% + var(--gr) + 14px);height:72px;max-height:none}
.fig.roomy .zone.filled::after{content:"";position:absolute;top:50%;left:100%;width:calc(var(--gr) + 13px);border-top:1px solid rgba(231,201,119,.7);pointer-events:none}
.zone-x{position:absolute;top:-8px;right:-8px;width:18px;height:18px;border-radius:50%;border:1px solid var(--cabin-gold-700);
  background:var(--cabin-bg-surface);color:var(--cabin-gold-100);font-size:9px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.zone-x:hover{background:#5a2b2b;border-color:#c77}

/* "Imagine Outfit": the gradient every image AI shows while it draws */
.gen{position:absolute;inset:0;overflow:hidden;border-radius:16px;display:flex;align-items:center;justify-content:center}
.gen-aurora{position:absolute;inset:-35%;filter:blur(34px) saturate(1.25);opacity:.92;animation:gen-turn 9s linear infinite}
.gen-aurora i{position:absolute;width:62%;height:62%;border-radius:50%;mix-blend-mode:screen;animation:gen-drift 5.5s ease-in-out infinite alternate}
.gen-aurora i:nth-child(1){left:6%;top:8%;background:radial-gradient(circle,rgba(231,201,119,.95),rgba(231,201,119,0) 68%)}
.gen-aurora i:nth-child(2){right:4%;top:18%;background:radial-gradient(circle,rgba(239,122,170,.85),rgba(239,122,170,0) 68%);animation-delay:-1.6s}
.gen-aurora i:nth-child(3){left:18%;bottom:4%;background:radial-gradient(circle,rgba(131,112,255,.85),rgba(131,112,255,0) 68%);animation-delay:-3.1s}
.gen-aurora i:nth-child(4){right:12%;bottom:10%;background:radial-gradient(circle,rgba(84,206,224,.7),rgba(84,206,224,0) 68%);animation-delay:-4.4s}
@keyframes gen-turn{to{rotate:360deg}}
@keyframes gen-drift{0%{translate:-8% -6%;scale:.85}50%{translate:10% 4%;scale:1.18}100%{translate:-2% 10%;scale:.95}}
.gen-sheen{position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.2) 48%,transparent 66%);
  background-size:260% 100%;animation:gen-sheen 2.6s ease-in-out infinite;mix-blend-mode:overlay}
@keyframes gen-sheen{from{background-position:120% 0}to{background-position:-60% 0}}
.gen-text{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:16px 18px;
  border-radius:16px;background:rgba(8,9,10,.38);backdrop-filter:blur(8px);max-width:86%;color:#fff;text-shadow:0 1px 10px rgba(0,0,0,.45)}
.gen-text strong{font-family:var(--cabin-font-serif);font-size:22px;font-weight:500;letter-spacing:.01em}
.gen-spark{font-size:18px;color:var(--cabin-gold-100);animation:gen-pulse 1.6s ease-in-out infinite}
@keyframes gen-pulse{50%{opacity:.35;scale:.8}}
.gen-time{font-size:12px;letter-spacing:.14em;color:rgba(255,255,255,.82);font-variant-numeric:tabular-nums}
.gen-sub{font-size:11.5px;line-height:1.45;color:rgba(255,255,255,.78)}

.room-foot{padding-top:12px;display:flex;flex-direction:column;align-items:center;gap:10px}
.room-note{margin:0;font-size:12px;line-height:1.5;color:var(--cabin-text-low);text-align:center;max-width:420px}
.room-err{margin:0;font-size:12px;line-height:1.5;color:#e3a0a0;text-align:center;max-width:440px;display:flex;flex-direction:column;gap:2px}
.room-err strong{color:#f0b6b6;font-weight:600}
.room-go-row{display:flex;gap:8px;width:100%;max-width:380px}
.room-go{display:inline-flex;align-items:center;justify-content:center;gap:9px;letter-spacing:.02em}
.room-go-spark{font-size:15px}
.room-go-spin{border-color:rgba(11,12,14,.25);border-top-color:var(--cabin-bg-base);width:16px;height:16px}
.room-clear{height:46px}
.room-cap{margin:0;align-self:flex-start;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--cabin-text-low)}
.room-foot-outfit{align-items:stretch}
.pieces{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;max-height:190px;overflow-y:auto}
.pieces li{min-width:0}
.piece{display:flex;align-items:center;gap:10px;height:100%;padding:7px 10px 7px 7px;border-radius:11px;background:var(--cabin-bg-elevated);
  border:1px solid var(--cabin-border);min-width:0;text-decoration:none;color:inherit;transition:border-color .2s var(--cabin-ease)}
a.piece:hover{border-color:var(--cabin-gold-700)}
.pieces img{width:38px;height:51px;object-fit:cover;border-radius:7px;flex:none;background:#000}
.piece-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.piece-slot{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--cabin-gold-300)}
.piece-name{font-size:12px;line-height:1.3;color:var(--cabin-text-hi);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.piece-link{font-size:10.5px;color:var(--cabin-text-low);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
a.piece:hover .piece-link{color:var(--cabin-gold-300)}
.room-actions{display:flex;gap:8px;flex-wrap:wrap}
.room-actions .cabin-ghost{height:38px;font-size:12px}
.cabin-danger{color:#d99;border-color:#5a2b2b}
.cabin-danger:hover{color:#f0b6b6;border-color:#a55}

.room-saved{flex:1;min-height:0;overflow-y:auto}
.saved-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.saved-card{display:flex;flex-direction:column;gap:6px;padding:0;background:none;border:none;cursor:pointer;color:var(--cabin-text-mid);font-size:11px;text-align:left}
.saved-card img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:12px;border:1px solid var(--cabin-border);background:#000;transition:border-color .2s var(--cabin-ease),transform .2s var(--cabin-ease)}
.saved-card:hover img{border-color:var(--cabin-gold-500);transform:translateY(-2px)}

.room-bar{flex:none;width:136px;border-left:1px solid var(--cabin-border);background:rgba(8,9,10,.35);overflow-y:auto;
  padding:12px 12px 16px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:var(--cabin-gold-900) transparent}
.bar-item{position:relative;flex:none;width:100%;aspect-ratio:3/4;border-radius:10px;overflow:hidden;cursor:grab;background:#000;
  border:1px solid var(--cabin-border);transition:border-color .2s var(--cabin-ease),transform .2s var(--cabin-ease),box-shadow .2s var(--cabin-ease)}
.bar-item:hover{border-color:var(--cabin-gold-700);transform:translateY(-1px)}
.bar-item:active{cursor:grabbing}
.bar-item img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;user-select:none}
.bar-item.picked{border-color:var(--cabin-gold-300);box-shadow:0 0 0 2px var(--cabin-gold-500),var(--cabin-gold-glow)}
.bar-item.used::after{content:"✓";position:absolute;right:5px;top:5px;width:18px;height:18px;border-radius:50%;
  background:var(--cabin-gold-button);color:var(--cabin-bg-base);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}
.bar-item:focus-visible{outline:2px solid var(--cabin-gold-300);outline-offset:2px}
.room-bar-empty{margin:0;font-size:11px;line-height:1.5;color:var(--cabin-text-low);text-align:center;padding-top:8px}

/* ---- responsive: phones -> bottom sheet ---- */
@media (max-width:640px){
  .cabin-panel{width:100%;max-width:100%;height:84vh;top:auto;bottom:0;border-left:none;
    border-top:1px solid var(--cabin-border-gold);border-radius:18px 18px 0 0;
    transform:translateY(100%)}
  .cabin-panel.open{transform:translateY(0)}
  .cabin-panel.wide{width:100%;max-width:100%;height:100%;height:100dvh;border-radius:0;border-top:none}
  .cabin-panel-head{padding:14px 16px 10px}
  .cabin-tabs{padding:6px 10px 0}
  .room-main{padding:10px 10px 12px}
  .room-bar{width:88px;padding:10px 8px 14px;gap:8px}
  .zone-hat .zone-label,.zone-jewelry .zone-label{right:auto;left:4px;top:4px;transform:none}
  .zone-hat .zone-chip,.zone-jewelry .zone-chip{left:auto;right:4px}
  .zone-label{font-size:8.5px;padding:2px 5px;left:4px;top:4px}
  .gen-text strong{font-size:18px}
  .pieces{grid-template-columns:1fr;max-height:150px}
  .room-go-row{max-width:none}
  .cabin-tab{top:auto;bottom:84px;transform:none;border-radius:12px 0 0 12px}
  .cabin-modal{width:100%;max-width:100%;border-radius:18px 18px 0 0;align-self:flex-end;max-height:94vh}
  .cabin-modal-scrim{align-items:flex-end;padding:0}
}
`;
