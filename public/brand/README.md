# si-rebyu brand assets

Simang's cream wool, floppy ears, happy eyes, pink cheeks, and tulip connect these vector assets to the app's plush lamb mascot.

- `simang-mark.svg`: transparent 64 × 64 lamb mark for the interface.
- `app-icon.svg`: 512 × 512 strawberry app icon with a rounded background.
- `logo-light.svg`: transparent horizontal logo with matcha lettering.
- `logo-dark.svg`: transparent horizontal logo with strawberry lettering.
- `/favicon.svg`: simplified lamb face for browser tabs, without the small tulip detail.
- `app-icon-192.png` and `app-icon-512.png`: app icons referenced by the web manifest.
- `/apple-touch-icon.png`: opaque 180 × 180 icon for iOS home-screen bookmarks.
- `/favicon-16.png`, `/favicon-32.png`, and `/favicon.ico`: small browser-tab fallbacks.

Colors: strawberry `#F9D1D9`, matcha `#838F58`, cream wool `#FFF8EC`, and deep olive outlines `#586638`.

These are editable SVG graphics, not generated bitmap images. Regenerate them from the shared vector source with `node scripts/generate-brand-assets.mjs`. The standalone logos use Inter with system sans-serif fallbacks; the app's BrandLogo component uses its installed Inter font and theme text colors.

To export the PNG and ICO versions, run `node scripts/export-brand-png.mjs "<path to Chrome or Chromium>"` after regenerating the SVGs. The exporter renders the vectors using an isolated headless browser profile. No additional npm dependency is required. The manifest supplies app identity and icons; it does not add offline support.
