---
name: the-cabin-sdk
description: Add The Cabin AI virtual try-on to an online fashion store with its one-line SDK (cabin.js). Use when asked to install, integrate, move or debug The Cabin, its "Try it on" button, cabin.js, data-cabin-key, or virtual try-on on a store's product pages.
---

# The Cabin SDK — integration skill

The Cabin adds a **Try it on** button next to a store's add-to-cart button. The shopper makes a profile once (one
full-body photo, on The Cabin's own site); after that, Try it on turns the store's product photo into a photo of
the shopper wearing the piece — same background, pose and light as the store's photo, with their own face and body.

Everything — button, profile, panel, results — is loaded by **one script tag**. You do not build UI, call an API,
store images or handle customer data. Your job is to place the tag once, make sure product pages can be detected,
and verify.

## What you need from the user

- **The store key** (`data-cabin-key`). If they haven't given it, use the placeholder `YOUR_STORE_KEY` and tell
  them to replace it. Never invent a key.

## Step 1 — Find the layout every page shares

| Platform | File | Where |
| --- | --- | --- |
| Plain HTML / static site generator | the base layout or footer include | just before `</body>` |
| Shopify | `layout/theme.liquid` | just before `</body>` |
| WooCommerce / WordPress | the active theme's `footer.php` (child theme if there is one) | just before `</body>` |
| Next.js App Router | `app/layout.tsx` | inside `<body>`, after `{children}`, with `next/script` |
| Next.js Pages Router | `pages/_app.tsx` (or `_document.tsx`) | `next/script` |
| React / Vue / Svelte SPA (Vite, CRA…) | `index.html` | just before `</body>` |
| Nuxt | `nuxt.config` → `app.head.script` | body-close position |
| Magento / other server-rendered | the base page template | just before `</body>` |

Rules:
- Add the tag **once**, in the shared layout — never per product page, never twice.
- Keep `async`. Load it from `https://metaaida.pages.dev/cabin.js` — do not download, bundle or self-host
  `cabin.js` (it updates itself).

## Step 2 — Add the line

```html
<script src="https://metaaida.pages.dev/cabin.js" data-cabin-key="YOUR_STORE_KEY" async></script>
```

Next.js App Router:

```tsx
import Script from 'next/script';
// inside <body>, after {children}:
<Script src="https://metaaida.pages.dev/cabin.js" data-cabin-key="YOUR_STORE_KEY" strategy="lazyOnload" />
```

Optional attribute: `data-lang="ro"` for a Romanian widget (default `en`).

## Step 3 — Make product pages detectable

Open the **product page template** and check, in this order:

1. **Main product photo.** The script uses `<meta property="og:image">`. It must be the absolute URL of the main
   product photo (ideally a model wearing the piece, full length).
   - Missing → add it in the product template's `<head>` with the platform's own image helper
     (Shopify: `{{ product.featured_image | image_url: width: 1200 }}` prefixed with `https:`;
     WooCommerce: `wp_get_attachment_image_url( get_post_thumbnail_id(), 'large' )`).
   - Present but not the product photo (logo, banner) → put `data-cabin-image` on the main product `<img>`.
2. **Product name.** `og:title`, else the page's `<h1>`. To choose explicitly: `data-cabin-name` on the element.
3. **Add-to-cart button.** Found by its text: *Add to cart / bag / basket* or *Adaugă în coș*. Anything else
   (*Buy now*, another language, icon-only, a custom element) → add `data-cabin-cart` to the button element.
   Try it on is inserted right after it, in the same container.
4. **Custom placement** (optional): an empty `<div data-cabin-button></div>` — Try it on goes inside it instead.

Markers always win over detection:

```html
<img data-cabin-image src="/img/linen-dress-front.jpg" alt="Linen dress">
<h1 data-cabin-name>Linen midi dress</h1>
<button data-cabin-cart>Add to cart</button>
<div data-cabin-button></div>   <!-- optional: exact spot for "Try it on" -->
```

| Marker | Element | Value |
| --- | --- | --- |
| `data-cabin-image` | main product `<img>` | none — or the photo URL when placed on a non-`<img>` element |
| `data-cabin-name` | element with the product name | none — or the name itself |
| `data-cabin-cart` | the add-to-cart button | none |
| `data-cabin-button` | an empty container | none |

A page with no add-to-cart button and no `data-cabin-button` is treated as "not a product page" and left alone.
Do not add markers to listing/category pages.

## Step 4 — Single-page apps only

If pages change without a full reload, call `window.TheCabin?.refresh()` after every navigation:

```tsx
// Next.js App Router — a client component rendered once in app/layout.tsx
'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
export function CabinRefresh() {
  const pathname = usePathname();
  useEffect(() => { (window as any).TheCabin?.refresh(); }, [pathname]);
  return null;
}
```

```ts
// React Router: in a component under the router
const location = useLocation();
useEffect(() => { (window as any).TheCabin?.refresh(); }, [location.pathname]);

// Vue Router
router.afterEach(() => { nextTick(() => (window as any).TheCabin?.refresh()); });
```

Call it after the new page has rendered (the product photo and the add-to-cart button must be in the DOM).
Shopify, WooCommerce and other server-rendered stores do not need this.

| Call | Effect |
| --- | --- |
| `window.TheCabin.refresh()` | re-detects the product on the current page and moves Try it on to it |
| `window.TheCabin.open()` / `.close()` | opens / closes the shopper's Cabin panel |

## Step 5 — Content-Security-Policy (only if the site sends one)

Add `https://metaaida.pages.dev` to these directives (keep everything already there):

```
script-src  https://metaaida.pages.dev;
connect-src https://metaaida.pages.dev;
img-src     https://metaaida.pages.dev data: blob:;
```

## Step 6 — Verify (do not skip)

Run the site and open a real product page, then check:

- **Network:** `POST https://metaaida.pages.dev/v1/sdk/bootstrap` returns **200**. 401 = wrong or missing key.
- **DOM:** a `<button data-cabin="tryon-button">` with the text *Try it on* sits right after the add-to-cart
  button (or inside `data-cabin-button`), and `<div id="cabin-root">` exists at the end of `<body>`.
- **Console:** no messages starting with `[cabin]`.
- **Other pages:** home, category and cart pages show no Try it on button.
- **SPA:** navigate between two product pages — the button follows the product, never duplicates.

Report to the user: the file(s) changed, which markers you added (if any) and why, and that the key placeholder
must be replaced if you used it.

## Don't

- Don't change, wrap, restyle or move the add-to-cart button, and don't alter its behaviour.
- Don't call The Cabin's API yourself or send any customer data — the widget handles the profile, photos and results.
- Don't load the script twice (layout + page, or two layouts).
- Don't remove `async`, and don't put the tag before critical CSS in `<head>`.
- Don't copy `cabin.js` into the repository.

## Reference

- Integration guide: https://metaaida.pages.dev/sdk
- Live demo store: https://metaaida-shop-demo.pages.dev
- Script: `https://metaaida.pages.dev/cabin.js` — starts after `load` + idle, renders in a Shadow DOM, ~30 KB gzipped.
