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
  transform:translateX(100%);transition:transform .34s var(--cabin-ease);
  z-index:2147483603;display:flex;flex-direction:column}
.cabin-panel.open{transform:translateX(0)}
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
.cabin-item-rm{background:none;border:none;color:var(--cabin-text-low);cursor:pointer;font-size:16px;padding:6px}
.cabin-item-rm:hover{color:#c77}
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

/* ---- responsive: phones -> bottom sheet ---- */
@media (max-width:640px){
  .cabin-panel{width:100%;max-width:100%;height:84vh;top:auto;bottom:0;border-left:none;
    border-top:1px solid var(--cabin-border-gold);border-radius:18px 18px 0 0;
    transform:translateY(100%)}
  .cabin-panel.open{transform:translateY(0)}
  .cabin-tab{top:auto;bottom:84px;transform:none;border-radius:12px 0 0 12px}
  .cabin-modal{width:100%;max-width:100%;border-radius:18px 18px 0 0;align-self:flex-end;max-height:94vh}
  .cabin-modal-scrim{align-items:flex-end;padding:0}
}
`;
