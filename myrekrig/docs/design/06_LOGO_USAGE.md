# Logo 01 — Three Segments

## Selected direction

Three unequal solid oval segments climb diagonally; two fine antenna strokes complete the abstraction. No legs, eyes, frame or additional symbol. The wordmark reads **Ants 51**. `reference/selected-logo-concept-01.png` is the exact selected rough sketch; production SVGs are a clean vector redraw of that concept, with small optical/lettering differences rather than a raster trace.

## Assets

| Asset | Use |
|---|---|
| `ants-51-on-black.svg` | Cream wordmark/segments with warm gold antennae on Obsidian |
| `ants-51-on-cream.svg` | Near-black wordmark/segments with bronze antennae on Champagne |
| `ants-51-mono-dark.svg`, `ants-51-mono-light.svg` | One-colour reproduction |
| `ants-51-mark-*.svg` | Icon-only equivalents |
| `favicon.svg`, `favicon-32.png`, `favicon.ico` | Browser tab; deliberate dark tile preserves contrast |
| `app-icon-192.png`, `app-icon-512.png` | Optional square application icons; no manifest included |
| `*.png` matching wordmark/icon variants | Transparent fallbacks; prefer SVG on the web |
| `catalog.html` | Side-by-side asset inspection |

SVG wordmarks contain outlined text paths, so they do not depend on installed fonts or font loading. Keep `alt="Ants 51"` on a linked logo; use empty alt when genuinely duplicated by adjacent accessible text. Icon-only home links need an accessible name.

Use approximately 156–180 CSS px width for a desktop header wordmark, maintaining aspect ratio. Avoid full wordmark widths below about 125px; switch to the symbol plus accessible brand text if space is tighter. Icon-only minimum is approximately 24px; favicon is the intentional smaller exception. Inspect favicons at actual 16/32px sizes before final release.

Maintain clear space at least the height of the smallest oval around the mark at its displayed size. No stretching, skew, bevel, shadow or outer glow. Do not recolour it to match the leading race or animate the antennae during battle alerts. Switch logo colour variant only with the page theme. The selected concept's bronze antenna accent is decorative branding, not race or victory status.

The proof PNG is for design reference, not a header asset. Do not crop its large background and concept caption into production.
