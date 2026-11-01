import { render } from 'preact';
import { tokensToCss } from '@aida/shared';
import { Widget } from './components/Widget';
import { baseStyles } from './styles';
import type { CabinApi } from './api';

/** Creates an isolated Shadow-DOM host and renders the widget UI into it. */
export function mountShadow(api: CabinApi): { host: HTMLElement; shadow: ShadowRoot } {
  const existing = document.getElementById('cabin-root');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'cabin-root';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483600';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = tokensToCss(':host') + baseStyles;
  shadow.appendChild(style);

  const mount = document.createElement('div');
  shadow.appendChild(mount);
  render(<Widget api={api} />, mount);

  return { host, shadow };
}
