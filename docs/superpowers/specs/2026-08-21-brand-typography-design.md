# Uno Digit — Brand Typography & Touch Refinement

**Date:** 2026-08-21
**Status:** IMPLEMENTED 2026-08-21. Entries marked (as built) record where the
build diverged from the design.
**Scope:** A custom brand typeface asset (`Uno Sans` / `Uno Mono`) self-hosted across
every Uno Digit web surface, plus a mobile/touch refinement pass.

---

## 1. Problem

### 1.1 The brand has no typographic identity — it has two

`apps/web/app/globals.css:59` leads the font stack with `-apple-system`:

```css
--font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display',
  'Inter', 'Helvetica Neue', 'Segoe UI', system-ui, sans-serif;
```

A visitor on macOS or iOS reads the site in **SF Pro**. A visitor on Windows, Android
or Linux reads it in **Inter**. These are different typefaces with different rhythm,
different letterforms and different digit widths. For a site whose entire proposition
is engineering precision, sold to C-suite buyers, the brand voice changing with the
visitor's hardware is the largest branding defect in the system.

A brand that does not own its typeface does not control its own voice.

### 1.2 Google Fonts is on the critical path

`globals.css:18`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

Three separate problems:

- **Serialised round trips.** A CSS `@import` is discovered only after the importing
  stylesheet has been fetched and parsed. The browser then fetches Google's CSS, parses
  *that*, and only then discovers the `.woff2`. Two blocking round trips to a third
  party ahead of first paint — directly against the PRD's "Lighthouse > 95, LCP < 2.5s".
- **Third-party dependency.** Every visitor's IP is disclosed to Google, and the site's
  ability to render its own brand depends on a domain nobody here controls.
- **Weight, not value.** Four static weights totalling **444.6 KB** (measured), with no
  optical sizing and no weight between the four cut points.

### 1.3 One surface cannot use webfonts at all

`apps/ba-bot-api/src/admin/dashboard.ts` ships from a *different* Worker, with
`default-src 'none'` CSP and **no build step**. It can neither import `globals.css` nor
fetch from Google, so it already runs on the bare system stack. Any solution that
depends on `next/font` or on a cross-origin fetch cannot reach it.

### 1.4 Touch surfaces have specific, narrow gaps

The codebase is *already* strong here — BaBot is a genuine bottom sheet that tracks
`window.visualViewport` to stay above the on-screen keyboard, 44px targets are enforced
in the token layer, `overscroll-behavior: contain` is set on both scrollers. The gaps
are precise, not systemic. They are enumerated in §6.

---

## 2. Decisions taken

| # | Decision | Rationale |
|---|---|---|
| D1 | Brand-tuned superfamily derived from an OFL source, plus a drawn wordmark | Delivers owned assets at real quality. Drawing a full Latin variable family from scratch is months of type-design work and would ship worse. |
| D2 | Inter 4.1 as the skeleton | Closest widely-available match to SF Pro, which is what the entire token layer was tuned against. Keeps every existing type role optically correct. |
| D3 | Brand font leads on **all** platforms, including Apple | The point of owning a typeface is one voice everywhere. Made safe by D6. |
| D4 | Checked-in binaries + a reproducible build script | CI needs no Python and no network; provenance is preserved for future re-tuning. |
| D5 | Hand-written `@font-face`, not `next/font/local` | `next/font` hashes binaries into `_next/static/media/`, which the admin Worker cannot reach. One set of files, three consumers. |
| D6 | `size-adjust: 93.02%` on the brand face | See §4.1. This is the decision that makes D3 safe. |
| D7 | One variable file carrying both `wght` and `opsz` | The display cut is a *usage*, not a second file. Removes a file from the critical path. |

### 2.1 Recorded tension

The `apple-design` skill advises keeping `-apple-system` ahead of any webfont so Apple
devices still render SF. **D3 deliberately reverses that**, and the repo-root
`CLAUDE.md` documents the current SF-first behaviour as intentional. The reversal is justified only
because D6 makes the substitute metrically equivalent; without D6 the skill's advice
should win. If D6 is ever removed, D3 must be revisited. `CLAUDE.md` must be updated to record the new
behaviour, including this rationale, so the next reader does not "fix" it back.

---

## 3. Licensing

Inter 4.1 `LICENSE.txt` declares SIL OFL 1.1 with **no Reserved Font Name**. Verified:
the copyright line reads `Copyright (c) 2016 The Inter Project Authors` with no
"with Reserved Font Name" clause; the only match for that phrase in the file is the
OFL's own boilerplate *definition* of the term at line 32.

Consequences:

- Renaming to `Uno Sans` is permitted (and not required, but desirable for branding).
- The derivative **must remain under OFL 1.1** and **must be distributed with the
  licence**. Serving `.woff2` publicly is distribution.
- Therefore `apps/web/public/fonts/OFL.txt` ships alongside the binaries, and the
  `name` table carries the licence in name IDs 13 (licence description) and 14
  (licence URL).
- The same applies to JetBrains Mono (OFL 1.1) for `Uno Mono`.

`apps/web/public/use.txt` gains an attribution line naming both upstream projects.

---

## 3b. Uno Display — a drawn typeface (as built)

The design originally proposed one family, derived from Inter. Mid-build the
requirement changed: the brand needed letterforms it *owns*, usable in print
marketing, not a calibrated derivative. That produced a second, different asset.

**Uno Display is original work.** 82 glyphs — A-Z, a-z, 0-9 and 19 punctuation
marks — drawn from a parametric construction system in
`tools/fonts/uno-display/glyphs.py`. Not derived from any typeface, so it carries
no OFL obligation; its name table declares Uno Digit as designer and owner and
`fsType` is 0 (installable embedding, so it embeds in PDFs freely).

### Why the family splits in two

A drawn *text* face is 400+ glyphs plus kerning, hinting and optical corrections
across sizes — specialist work measured in months, and a poor text face damages a
brand more than a well-calibrated licensed one. A drawn *display* face is where
brand identity actually lives: logotype, headlines, posters, decks. So:

| Face | Origin | Role | Axes |
|---|---|---|---|
| **Uno Display** | drawn, 82 glyphs | hero, H1, wordmark, print | 4 static weights |
| **Uno Sans** | Inter-derived, calibrated | body, UI, everything else | `wght 100-900` + `opsz 14-32` |

This division is normal for a brand type system.

### The four signatures

1. **Square node** — dots on `i j ! ?` are squares. Descends from the two violet
   nodes in the logo, and matches the `ss07` substitution frozen into Uno Sans.
   The two faces agree, which is what makes them a system rather than two fonts.
2. **Flat apex** — `A M V W v w` are cut flat, never pointed.
3. **U is the mark** — two verticals joined by a true semicircle.
4. **The numerals carry the name** — `1` takes a full flat foot, `0` a node in its
   counter. Tabular by default.

### Why static weights, not a variable font

Variable fonts need interpolatable masters: identical contour count, point count
and point order at every weight. This face is built with **boolean operations**, so
a shape that merges at Bold stays separate at Light and the outlines are
structurally different between weights. Forcing interpolation would mean abandoning
the construction system that makes the letterforms good. Uno Sans carries the axes.

### Why CFF/OTF rather than TrueType

The construction is cubic throughout — circles are cubic beziers at the standard
0.5523 constant. CFF stores cubics natively, so nothing is approximated. Converting
to quadratic would introduce error into exactly the curves the face is built from.

### Known limitations, stated plainly

- **`&` is the weakest glyph.** Two bowls plus a leg is the hardest construction
  here, and it still reads slightly like `a-ring`.
- **No italic, no small caps, no Latin-Ext.** Latin basic only; text needing
  diacritics falls back to Uno Sans.
- **`Light` breaks up below ~24pt in print** — a 54-unit stem is display-only.
- The face was tuned by rendering a specimen and correcting what looked wrong.
  That is the right loop, but it has run three times, not thirty.
  `docs/gemini-prompts-brand-type.md` section 1 carries a critique prompt to
  continue it.

---

## 4. The font asset

### 4.1 Metric calibration — the load-bearing decision

Measured from the actual binaries on this machine:

| Face | upm | x-height | ratio |
|---|---|---|---|
| SF Pro (`/System/Library/Fonts/SFNS.ttf`) | 2048 | 1040 | **0.5078** |
| Inter 4.1 `InterVariable.ttf` | 2048 | 1118 | **0.5459** |

Inter renders **7.5% optically larger** than SF at the same `px` size. Every tracking
value in `globals.css` (`-0.022em` display, `-0.014em` snug, `+0.01em` wide) and every
size in the Apple ramp was tuned against SF. Substituting Inter naively would inflate
all type by 7.5% and de-tune the whole scale.

**Resolution:** ship the face with

```css
size-adjust: 93.02%;   /* 100 / 107.50 */
```

After adjustment the effective x-height ratio is `0.5459 × 0.9302 = 0.5078` — an exact
match to SF Pro. Three consequences, all wanted:

1. The existing token scale stays correct with **no** re-tuning.
2. Apple devices see **zero layout shift** when the brand font swaps in, because the
   fallback it replaces has identical vertical proportions.
3. Line-height is unitless throughout the token layer, so leading is unaffected.

Other measured values, used verbatim for the fallback overrides:

```
ascent-override:   96.88%   /* sTypoAscender  1984 / 2048 */
descent-override:  24.12%   /* sTypoDescender  494 / 2048 */
line-gap-override:  0.00%   /* sTypoLineGap      0 / 2048 */
```

#### The trade-off this makes, stated precisely

x-height and cap-height cannot both be matched, because the two faces have different
internal proportions:

| | SF Pro | Inter 4.1 |
|---|---|---|
| cap-height ÷ x-height | `1443 / 1040` = **1.388** | `1490 / 1118` = **1.333** |

Inter's capitals are relatively shorter against its own x-height. After
`size-adjust: 93.02%`:

| Ratio | Uno Sans (adjusted) | SF Pro | Delta |
|---|---|---|---|
| x-height | `0.507812` | `0.507812` | **exact** |
| cap-height | `0.676781` | `0.704590` | **−3.9%** |

**x-height is the correct thing to match.** It governs perceived size in running text,
which is nearly all of this site, and it is what drives the swap-time reflow that
criterion 9 tests for. The cost is that capitals render 3.9% shorter than SF did.

That cost lands on exactly two surfaces, and is acceptable on both:

- `.type-eyebrow` (`globals.css:482`) — uppercase, 13px, `+0.06em`. Slightly more
  delicate capitals at a wide-tracked small size is a neutral-to-positive change.
- The wordmark — drawn as outlines (§4.2d), so it is unaffected by this entirely.

If uppercase ever reads too light at display sizes, the correction is to raise weight
on that role, **not** to change `size-adjust` — moving `size-adjust` would break the
x-height match that everything else depends on.

### 4.2 What makes it custom

Four modifications, none of which are available by using stock Inter:

**a. Frozen brand substitutions.** `ss07` (square dots), `ss08` (square punctuation) and
`cv05` are applied permanently into the `cmap`/`GSUB` via `pyftfeatfreeze`, not
requested at runtime. Verified working on the variable font:

```
'i' i          -> i.ss07
'j' j          -> j.ss07
'!' exclam     -> exclam.ss07
'?' question   -> question.ss07
'l' l          -> l.ss02
```

The square tittle is the brand's signature: invisible in a paragraph, unmistakable in a
headline, echoing the two nodes in the logo. Because it is frozen rather than
CSS-requested, it survives into `<canvas>`, SVG export, PDF, and the admin page — every
surface where `font-feature-settings` does not reach.

**b. Rewritten `name` table.** Done with fontTools directly, not `pyftfeatfreeze`'s
`-U`/`-R` flags — those do a naive string replace and produced the mangled
`UnoSans Variable UnoSans` during the spike. Name IDs written explicitly:

| ID | Value |
|---|---|
| 1 | `Uno Sans` |
| 2 | `Regular` |
| 3 | `UnoDigit: Uno Sans: 2026` (unique ID) |
| 4 | `Uno Sans` |
| 6 | `UnoSans-Regular` (PostScript) |
| 13 | OFL 1.1 licence description |
| 14 | `https://scripts.sil.org/OFL` |
| 16 / 17 | Typographic family / subfamily |

**c. Deliberate feature retention.** The subset keeps only
`kern, liga, calt, ccmp, locl, mark, mkmk, rlig, case, tnum, zero` — everything else is
dropped. `case` is retained live (not frozen) because it must apply only to uppercase
runs; it is switched on in `.type-eyebrow`, which sets uppercase at `+0.06em` and today
mis-aligns parentheses and hyphens.

**d. Drawn wordmark.** `apps/web/public/wordmark.svg` — outlined paths, not live text:
the `U` carries the logo's terminal node, `O` takes a node-dot counter, and the `N`–`O`
pair is hand-kerned. ~10 glyphs, which is a tractable amount of real drawing.

### 4.3 Files shipped

| File | Coverage | Axes | Size | Preloaded |
|---|---|---|---|---|
| `uno-sans-latin.woff2` | Latin core | `wght 100–900`, `opsz 14–32` | **67.3 KB** (as built) | **yes** |
| `uno-display-{400,500,700}.woff2` | Latin basic, drawn | static | **4.6–4.8 KB each** | 700 only |
| `uno-sans-latin-ext.woff2` | Latin Extended | same | **115.6 KB** (measured) | no — `unicode-range` |
| `uno-sans-italic-latin.woff2` | Latin core, italic | same | target < 70 KB | no |
| `uno-mono-latin.woff2` | Latin basic | `wght 400–700` | target < 30 KB | no |
| `OFL.txt` | — | — | — | — |

Italic ships because `globals.css:716` sets `.prose-apple em { font-style: italic }`;
without a real italic the browser synthesises a skewed roman, which is visibly wrong.
Neither italic nor mono is preloaded — a browser fetches a font only when a glyph
actually needs it, so they cost nothing on pages that use neither.

**Total on the critical path: 65.8 KB, against 444.6 KB today.**

### 4.4 Loading strategy (cross-browser)

```css
/* Variable, where supported */
@supports (font-variation-settings: normal) {
  @font-face {
    font-family: 'Uno Sans';
    src: url('/fonts/uno-sans-latin.woff2') format('woff2-variations');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
    size-adjust: 93.02%;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
                   U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193,
                   U+2212, U+2215, U+FEFF, U+FFFD;
  }
}
```

- **`woff2` only.** Chrome 36+, Firefox 39+, Safari 10+ (macOS 10.12 / iOS 10), Edge 14+.
  No `woff` fallback: those browsers are below the floor Next 16 already sets.
- **Variable fonts** need Safari 11+, Chrome 62+, Firefox 62+, Edge 17+.
  **(as built)** The planned `@supports` guard plus four pinned static instances
  was DROPPED. Variable-font support is above 97%, the four extra files would be
  dead weight in the repo forever, and browsers below that floor cannot run
  Next 16's output anyway. They fall through to the metric-matched system stack,
  which is a correct experience rather than a broken one.
- **`font-display: swap`**, not `optional`. `optional` permits the browser to skip the
  brand font entirely on a slow connection, which defeats the purpose of owning it.
  Swap is safe here precisely because §4.1 removed the reflow it would otherwise cause.
- **`<link rel="preload" as="font" type="font/woff2" crossorigin>`** in `layout.tsx`
  for the latin file only. `crossorigin` is mandatory even same-origin — fonts are
  fetched in CORS mode, and omitting it causes a *duplicate* download.
- **`unicode-range`** keeps latin-ext off Australian-English pages entirely.
- **`font-optical-sizing: auto`** is already set at `globals.css:374`. With a real
  `opsz` axis it now works on every platform rather than only for Apple users on SF.

### 4.5 Metric-matched fallback

A second `@font-face` wraps the local system stack so the pre-swap frame matches:

One fallback face is emitted **per platform face**, because each needs its own
`size-adjust`. The build script computes each value as
`(0.507812 ÷ that face's x-height ratio) × 100` and writes the literal number into
`globals.css` — the emitted CSS contains only concrete percentages, never a
runtime computation:

```css
@font-face {
  font-family: 'Uno Sans Fallback';
  src: local('Segoe UI');        /* one @font-face per fallback face */
  ascent-override: 96.88%;
  descent-override: 24.12%;
  line-gap-override: 0%;
  size-adjust: /* literal, emitted by the build script */;
}
```

Source x-height ratios come from `@capsizecss/metrics`, which publishes verified
metrics for Segoe UI, Roboto, Helvetica Neue and Arial. Faces absent from that dataset
get **no** `@font-face` and simply fall through to the plain system stack — the current
behaviour. No value is ever estimated.

`ascent-override` / `descent-override` / `line-gap-override` are supported in
Chrome 87+, Firefox 89+ and Safari 17+, and are inert where unsupported, so this is
pure progressive enhancement.

Resulting stacks:

```css
--font-sans: 'Uno Sans', 'Uno Sans Fallback', -apple-system, BlinkMacSystemFont,
  'Segoe UI', system-ui, sans-serif;

--font-mono: 'Uno Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

`--font-mono` keeps `ui-monospace` ahead of the named system faces so that a platform
without `Uno Mono` loaded still resolves its own correct monospace default rather than
falling through to a hardcoded macOS face.

### 4.6 The admin dashboard

`apps/ba-bot-api/src/admin/dashboard.ts` gets a **separately built, hard-pinned subset**
inlined as a `data:` URI: `opsz` pinned to 14, `wght` clamped to 400–700, Latin basic
plus the handful of symbols the dashboard uses. Measured: **26.2 KB raw / 34.9 KB
base64.**

This needs only `font-src data:` added to that page's CSP — no CORS, no cross-origin
fetch, no network. It matches the precedent already set in that file, which inlines the
logo as SVG and the favicon as a `data:` URI for exactly the same reason.

The existing rule stands and is reinforced: **a token changed in `globals.css` must be
changed there too.** The font is now part of that contract.

### 4.7 Cache headers

New `apps/web/public/_headers` (Cloudflare Pages reads it from the uploaded directory,
same mechanism as `_worker.js` and `_routes.json`):

```
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *
```

Filenames are content-stable; a re-cut font gets a new filename rather than a
cache-bust query.

---

## 5. Build pipeline

`tools/fonts/build-fonts.py` — run manually, output committed.

```
Inter-4.1.zip (pinned, sha256 recorded)
  │
  ├─ instancer     opsz/wght clamp per output
  ├─ pyftfeatfreeze  ss07, ss08, cv05  -> baked into cmap
  ├─ fontTools     name table rewrite (IDs 1,2,3,4,6,13,14,16,17)
  ├─ pyftsubset    unicode-range split, feature allow-list, --flavor=woff2
  └─ emit          apps/web/public/fonts/*.woff2 + OFL.txt
                   apps/ba-bot-api/src/admin/font-inline.ts (base64)
```

The script pins the upstream release URL and records its SHA-256 so a rebuild is
byte-reproducible. It is **not** wired into `pnpm build` — CI stays free of Python,
network access and a 34 MB download.

Verified available on this machine: `fontTools 4.61.1`, `pyftsubset`, `brotli 1.2.0`
(required for woff2 compression), `opentype-feature-freezer`.

---

## 6. Mobile & touch refinement

Ordered by severity. Each is a real defect confirmed in the source, not a generic
recommendation.

**M1 — Safe-area insets are entirely absent.**
`grep` for `safe-area` and `env(` across `app/` and `components/` returns **nothing**,
and `app/layout.tsx:75` exports a `viewport` object that sets only `themeColor`. Add
`viewportFit: 'cover'`, then apply `env(safe-area-inset-*)` to the three fixed
surfaces: the floating navbar, the footer, and the BaBot sheet — whose
`bottom: var(--babot-kb, 0px)` currently sits *underneath* the iPhone home indicator.

**M2 — `-webkit-tap-highlight-color` is never set.**
iOS Safari paints a grey flash rectangle on every tap, on top of the deliberately
designed `:active { scale(0.97) }` press feedback. Set `transparent` on the base
reset; the existing `:active` states become the only feedback, as intended.

**M3 — Hover states stick on touch.**
8 `:hover` rules in `globals.css` and 18 `hover:` utilities across 8 components, with
**no** `@media (hover: hover)` guard anywhere. On iOS a tapped element retains hover
until something else is tapped, so `.card-interactive:hover` (`globals.css:668`) leaves
cards visibly stuck in a lifted state. Wrap all hover styling in
`@media (hover: hover) and (pointer: fine)`.

**M4 — `min-h-screen` resolves to `100vh`.**
`app/layout.tsx:90` on `<body>`. Tailwind v3's `min-h-screen` is `100vh`, which on iOS
Safari includes the collapsing URL bar and produces the classic scroll jump. Move to
`100dvh`. (`app/HomeClient.tsx:92` already uses `86svh` correctly — this is the one
place that was missed.)

**M5 — Drag-to-dismiss on the BaBot sheet.**
The sheet is currently dismissed only via its header control. Add a drag gesture using
Motion at Apple's ship spring (`bounce: 0.2`, `visualDuration: 0.3`), with velocity
projection so a fast flick dismisses from a short distance, plus rubber-banding past
the top edge. Requires `touch-action: none` on the drag handle only — not the panel,
or the transcript stops scrolling. Must honour `prefers-reduced-motion` by degrading to
an opacity crossfade, consistent with the rest of the system.

---

## 7. Files touched

| File | Change |
|---|---|
| `tools/fonts/build-fonts.py` | **new** — the pipeline |
| `apps/web/public/fonts/*.woff2`, `OFL.txt` | **new** — the assets |
| `apps/web/public/wordmark.svg` | **new** — drawn logotype |
| `apps/web/public/_headers` | **new** — immutable cache + CORS |
| `apps/web/app/globals.css` | delete the Google `@import`; add `@font-face` blocks; repoint `--font-sans`/`--font-mono`; M2, M3 |
| `apps/web/app/layout.tsx` | font preload; `viewportFit: 'cover'`; M4 |
| `apps/web/tailwind.config.ts` | bridge only — no new values |
| `apps/ba-bot-api/src/admin/font-inline.ts` | **new** — generated base64 subset |
| `apps/ba-bot-api/src/admin/dashboard.ts` | inline `@font-face`; `font-src data:` in CSP; repoint `--font-sans` |
| `apps/web/components/BaBot/BaBot.tsx` | M5 |
| `apps/web/components/{Navbar,Footer}.tsx` | M1 |
| `apps/web/public/use.txt` | OFL attribution |
| `CLAUDE.md` (repo root — the only one) | record the §2.1 reversal and the font half of the admin-sync contract |

---

## 8. Acceptance criteria

Each is mechanically checkable. No criterion is satisfied by inspection alone.

1. `grep -r "fonts.googleapis.com\|fonts.gstatic.com" apps/web/out/` returns **zero**
   matches after `pnpm build`.
2. `grep -r "@import" apps/web/app/globals.css` returns zero matches.
3. `pnpm build` succeeds and exports 21 pages; `pnpm validate:geo` passes.
4. `pnpm ws:typecheck` and `pnpm ws:test` (68 Worker tests) pass.
5. The rendered `name` table reports family `Uno Sans` — no occurrence of `Inter`
   in name IDs 1/4/6/16.
6. Rendered `i`, `j`, `!`, `?` resolve to the `.ss07` glyphs with **no**
   `font-feature-settings` present in the CSS.
7. `apps/web/public/fonts/uno-sans-latin.woff2` ≤ 70 KB.
8. `OFL.txt` present and reachable at `/fonts/OFL.txt` in `out/`.
9. Screenshot comparison at 390×844 (iPhone 14), 768×1024 and 1440×900, in **both**
   light and dark, shows no vertical reflow between the fallback frame and the loaded
   brand font.
10. Admin dashboard renders `Uno Sans` with its `default-src 'none'` CSP intact and no
    network font request.
11. `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast: more`
    all still resolve correctly after the M-series changes.
12. No `:hover` styling applies on a coarse pointer.
13. `.type-eyebrow` is visually compared against the pre-change build at 390px and
    1440px; uppercase must not read lighter than the current rendering.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Capitals render 3.9% shorter than SF (measured, §4.1) | Lands only on `.type-eyebrow`; the wordmark is outlined and unaffected. Correct by raising weight on that role, never by moving `size-adjust`. Criterion 13 checks it. |
| Losing SF's native hinting on Apple hardware | Mitigated by shipping a real `opsz` axis, which stock Inter-from-Google never delivered. Net legibility is expected to improve on non-Apple platforms and hold on Apple. |
| Frozen features are permanent — reverting means a rebuild | The build script is committed and pinned, so reverting is one flag and one re-run. |
| `@capsizecss/metrics` may lack a face in the fallback chain | Only faces with published verified metrics get an override; any other simply gets none, which is the current behaviour. Never estimate. |
| Admin dashboard drifts out of sync | Pre-existing hazard, now covering the font too. Recorded in the repo-root `CLAUDE.md`; criterion 10 checks it. |
| M5's `touch-action: none` scoped too broadly would break transcript scrolling | Applied to the drag handle only, never the panel. Explicitly called out in §6. |

---

## 10. Out of scope

- Redrawing Latin glyphs beyond the frozen substitutions and the wordmark.
- Any change to the colour system, spacing scale, radii or motion tokens.
- Non-Latin scripts (Cyrillic, Greek). Re-cut from the same script if ever needed.
- A variable *italic* axis — a discrete italic file is shipped instead.
- Replacing `lucide-react` with an icon font. Icon fonts are an accessibility
  regression and are not being introduced.
