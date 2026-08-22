# Uno Digit — marketing collateral

Everything in this folder is **generated**. No file in `dist/` or `qr/out/` is
hand-made, and none should be hand-edited — change the source and re-run, or
your edit disappears on the next build.

```bash
python3 marketing/links.py           # 1. UTM matrix     -> links.json, links.md
python3 marketing/qr/make_qr.py      # 2. branded QR set -> qr/out/*.svg|png
python3 marketing/qr/verify_qr.py    # 3. GATE: symbols decode, module-exact
python3 marketing/render.py          # 4. artwork        -> dist/
python3 marketing/verify_artwork.py  # 5. GATE: finished artwork carries the right URL
```

Steps 3 and 5 are gates, not formalities — see *Verification* below.
`render.py` takes optional slugs (`python3 marketing/render.py roller-banner`)
to rebuild one asset while iterating; a selective run leaves the other outputs
alone, only a full run clears `dist/`.

## Layout

| Path | What |
|---|---|
| `brand.json` | Colours, type, logo geometry and campaign copy. Mirrored by hand from `apps/web/app/globals.css` and `apps/web/lib/site.ts` — **those remain the source of truth**. |
| `links.py` → `links.json`, `links.md` | The UTM link matrix, one row per asset. |
| `staff.json` | Personal contact facts for named cards. Same rule as `lib/site.ts`: **nothing invented**, every value supplied by its owner. |
| `vcard.py` | Builds the vCard payload a staff card's QR encodes. |
| `qr/make_qr.py` | The branded QR renderer. segno supplies the matrix; all the visual design is ours. |
| `qr/verify_qr.py` | Decodes every code under degradation and checks it module-by-module. |
| `verify_artwork.py` | Decodes the QR back out of every finished asset, PNG and PDF, and checks it carries that asset's own tagged URL. |
| `qr/out/` | 17 assets × 3 themes = 51 codes, SVG (vector, for print) + PNG 2048px. |
| `brandcss.py` | The shared style layer, with the brand fonts base64-inlined. |
| `layouts.py` | One function per artwork archetype (`poster`, `strip`, `card`, `story`, `channel`, `namecard`, `signature`), plus the procedural `lattice()` and the font-metric type fitter. |
| `render.py` | The asset table + the headless-Chrome driver. |
| `gemini/` | Background art generated with Gemini (see *Imagery*). |
| `dist/` | The deliverables. `dist/proof/` holds scaled PNGs of the print pieces plus `*-guides.png`, which overlays trim (cyan) and safe margin (violet). |

## The hostname is `www`, and that is not cosmetic

Everything here — encoded and printed — uses **`https://www.unodigit.com.au`**.

Verified 2026-08-22 against the authoritative nameservers: the apex
`unodigit.com.au` returns **NODATA** for A, AAAA and CNAME, and
`curl https://unodigit.com.au/` fails with "Could not resolve host". Only `www`
resolves (CNAME to `uno-digit.pages.dev`, HTTP 200). Apex MX and SPF are intact,
so mail is unaffected — it is only the web host that does not exist.

A QR code is a permanent artefact. There is no way to fix five hundred flyers
after the fact, so the printed and encoded hostname is the one that has been
shown to answer, not the one that looks tidier.

**The same bug existed on the website**, where `apps/web/lib/site.ts` set
`SITE_URL` to the apex — putting every canonical, `og:url`, sitemap `<loc>` and
JSON-LD `@id` on a host that does not resolve. That is being corrected in
`apps/web/` separately; this folder does not depend on it either way, since it
carries its own copy of the business facts in `brand.json`.

The durable fix is to give the apex a record at OnlyDomains. Note that a CNAME
at the apex is not an option — `@` already carries Zoho MX, and RFC 1034/2181
forbid a CNAME coexisting with other records, so it would stop incoming mail.

## The UTM convention

Values are **case-sensitive**; `LinkedIn` and `linkedin` become two separate
channels in GA4 and stay that way forever. So all values are lowercase and
generated, never typed.

- `utm_source` — the platform the click came from.
- `utm_medium` — the *vehicle*: `qr` for anything scanned off a physical
  surface, `profile` for a static bio/banner link, `social` for a post,
  `signature` for email. Keeping `qr` separate from `social` matters: scan
  traffic and feed traffic behave nothing alike and you want to segment them.
- `utm_campaign` — `brand26`. Deliberately short: every character becomes QR
  modules, and a longer campaign name pushes the symbol up a version, which
  means smaller modules and a worse scan at distance.
- `utm_content` — which asset. This is what tells you the roller banner
  outperformed the flyer.

## The QR codes

Three themes per link:

| Theme | Use | Notes |
|---|---|---|
| `mono` | **All shipping artwork.** | Near-black on white. Maximum compatibility. |
| `brand` | Light backgrounds, digital use | Cyan→violet gradient, brand finder eyes. |
| `brand-dark` | Decorative only — **verify before shipping** | Inverted (light on dark). See the caveat below. |

Design decisions, each of which is load-bearing:

- **Finder patterns are restyled, never re-shaped.** A decoder locates a symbol
  by scanning for the 1:1:3:1:1 run-length signature through the three corner
  eyes. Rounding and recolouring preserve it; turning the eyes into circles or
  splitting them into dots destroys it.
- **Modules are full-size with corner rounding, not inset dots.** The dots
  style throws away ~21% of every dark module's area and leaves white gutters
  between neighbours. Rounding only the corners that face light neighbours
  gives the same look at no cost in scan margin.
- **The logo knockout is an error budget.** The plaque is 0.22 of the canvas
  side, which destroys ~7.5% of the symbol area — well inside level H's 30%
  recovery, leaving headroom for a scratch, a fold or a bad print. Enlarging it
  spends real reliability.
- **The quiet zone is painted, never assumed.** A code dropped onto an unknown
  background with a transparent margin fails intermittently.

### Two bugs this design already survived

Both are recorded because both were invisible on screen:

1. **A 1.75-module corner fillet on the finder eyes put the corner module's
   centre 0.018 modules outside the ink.** A decoder samples at module centres,
   and those particular modules are where the timing patterns begin — so all
   **255** decode attempts failed, with no clue why. The fillet is now derived
   from `|0.5 − k|·√2 ≤ k`, not chosen by eye.
2. **OpenCV rejects any eye fillet past k = 1.0**, while zxing-cpp reads them
   happily. Colour, rounded modules and the logo bother neither. `k = 1.0` is
   the largest value that keeps both, so it is what ships.

### Verification

`verify_qr.py` runs two checks because they catch different failures:

- **Module exactness** — rasterise, sample every module centre, compare against
  segno's matrix. This localises a fault to a coordinate instead of just saying
  "no read". It must threshold *locally*, the way a decoder does: brand cyan
  `#06b6d4` has a luma of 132.8, so an absolute cutoff of 128 scores it as
  *light* and reports the whole cyan corner as broken artwork.
- **Decode under degradation** — 1200px, 400px, 250px, 180px and blurred.
  180px across a 65-module symbol is under 3 pixels per module, roughly a phone
  at arm's length from a business card.

zxing-cpp is the primary oracle (it is the lineage most phone scanners descend
from). OpenCV runs advisory-only and is passed if it reads at *any* scale — on
one fixed symbol it decoded at 600px, failed at 900 and 1200, then decoded
again at 1600. Useful signal, unreliable gate.

`verify_artwork.py` then closes the loop the symbol-level check cannot reach.
It decodes the QR back out of each finished asset — including rasterising the
print PDFs — and compares it against the tagged URL that asset is supposed to
carry. That catches the wrong code being wired to the wrong asset, a code laid
out too small to survive at final size, a scrim or shadow damaging it, and any
breakage in Chrome's PDF vector conversion. A code that scans but carries the
flyer's `utm_content` on the banner is a silent analytics failure, and this is
the only place it would be caught.

Current state: **51/51 symbols pass** module-exact across all five degradation
cases, and **16/16 finished assets** carry the correct tagged URL.

### Caveat: inverted codes

Every `brand-dark` variant fails OpenCV while every `brand` and `mono` passes.
That is not noise — light-on-dark QR symbols genuinely are not universally
supported. iOS Camera reads them; plenty of Android and kiosk scanners built on
OpenCV do not. **All sixteen artworks therefore put the code on a white plaque
using the `mono` variant.** The inverted set is kept for decorative use only.

## Imagery

`gemini/` holds background art generated with Google Gemini (Pro, account
`bowensyd@gmail.com`), prompted to a strict two-hue rule so the output uses the
brand's cyan and violet and nothing else.

Gemini's native output is **1024px on the long edge**. That is fine for social,
where it lands at 0.9–1.9× scale, and useless for print: across an 850mm banner
it works out to 17 dpi, and a mesh of hairline glowing filaments is the worst
possible subject to upscale. So:

- **Social ≤ 2× upscale** → the Gemini raster, behind a scrim.
- **Print, and YouTube's 2560px art** → `layouts.lattice()`, a procedural vector
  rebuild of the same art direction. Resolution-independent, locked to the exact
  brand hex values, ~29 KB. Its glow is stacked strokes rather than an SVG blur
  filter, because Chrome rasterises filter regions when printing to PDF.

`layouts.UPSCALE_LIMIT` is where that line sits.

## Type fitting

Headline sizes are **measured against the font binary**, not derived from the
canvas. `layouts.text_em()` reads advance widths out of `UnoDisplay-Bold.otf`
via fontTools and returns a string's width in em; `fit_px()` picks the largest
size at which every line clears the available width.

This exists because guessing failed twice. Sizing the headline from canvas
height put "transformation" underneath the QR panel on the 1640×664 Facebook
cover — it needed 907px in a 731px slot — and collided the headline with its
own eyebrow on the 1128×191 LinkedIn banner. Uno Display is a drawn face with
unusual advance widths; there is no rule of thumb for it.

The same principle covers vertical layout. The story and A4 layouts **derive**
their panel positions from their contents and assert no collision, after a
`padding: 6mm 0` was counted once instead of twice and six A4 service rows
silently overran the CTA panel by 31mm.

## Staff cards

`marketing/staff.json` holds the people; `layouts.staff_card(slug)` renders one.
To add someone, add a row there and a line to `PRINT` in `render.py`. The card
front and the vCard both read that one row, so they cannot drift apart.

**Only addresses that exist may be printed.** The first draft of Bowen's card
carried `bowen.li@unodigit.com.au`; there is no such mailbox, so it was replaced
with `info@unodigit.com.au` — the shared address published on the site and the
only one verifiable from this repo. A dead address on a business card is worse
than a shared one: the card cannot be corrected, and mail sent to it disappears
without a bounce anyone at the company will see. If a personal alias is created
later, change `email` in `staff.json` and re-run make_qr → render → verify.

**The reverse carries a vCard, not a website link.** Scanning a person's card
should leave you with the person — a phone offers "Add to Contacts" and the
details land in the address book. The tagged URL rides along in the vCard's
`URL` field, so link attribution survives either way.

Three decisions in that QR run *opposite* to every other code in this folder,
because a business card fails differently from a banner:

| | Banner | Staff card |
|---|---|---|
| Scanned from | ~2 m | ~15 cm |
| Dominant risk | distance → module size | wear → damage |
| Error correction | H (30%), spent on a logo knockout | **Q (25%), spent on damage** |
| Logo in the code | yes | **no** — the card is the branding |

A vCard is ~289 characters against a URL's 118, which pushes the symbol from
version 10 to version 15 — so the modules get physically *smaller on the same
85 mm card*. Measured at a 40 mm printed size:

| ECC | Version | Modules | mm per module | |
|---|---|---|---|---|
| H | 18 | 89 × 89 | 0.412 | below the practical print floor |
| Q | 16 | 81 × 81 | 0.449 | |
| **Q** | **15** | **77 × 77** | **0.471** | **chosen** (postal address dropped) |
| M | 13 | 69 × 69 | 0.519 | bigger modules, only 15% recovery |

Dropping the logo knockout is what buys the error correction back. Verified
against a wallet's worth of abuse — creases, scuffing, both together, and phone
photos at 12–25° tilt in dim light: **11/11 decoded**, plus clean prints from
600 down to 150 dpi.

Two formatting notes that matter:

- **The phone is printed and encoded differently on purpose.** The card shows
  `+61 430 830 888`; the vCard encodes `+61430830888` (E.164). A national-format
  number saved by someone on a non-AU SIM does not dial. The human and the
  machine want different formats and neither has to compromise.
- **vCard 3.0, not 4.0.** 3.0 is what address books actually implement; 4.0
  imports unevenly and can land a contact with a blank job title.

## Print specifications

| Asset | Supplied size | Notes for the printer |
|---|---|---|
| `roller-banner.pdf` | 850 × 2100 mm | Pull-up/roller cassette. **The bottom 100 mm rolls into the base and is never seen** — artwork is designed to that. Visible area is the top 2000 mm. |
| `a4-flyer.pdf` | 210 × 297 mm | No bleed required; artwork is full-bleed dark, so trim tolerance is invisible. |
| `business-card.pdf` | 91 × 61 mm, 2 pages | Generic company card. An 85 × 55 mm card plus **3 mm bleed on every edge**. Page 1 front (dark), page 2 reverse (white, carries the QR). |
| `card-bowen-li.pdf` | 91 × 61 mm, 2 pages | Staff card — Bowen Li, CTO. Same trim and bleed. Reverse carries a **vCard** QR. |

All PDFs carry **live vector text** — the brand faces are embedded, not
outlined and not rasterised. Colour is RGB; ask your printer to convert, since
the correct CMYK profile depends on their stock and press, and converting here
would guess.

Two rules the layouts encode:

- **Type size is set by viewing distance**, roughly 1 cm of cap height per 3 m.
  A trade-show aisle is 2–3 m, so nothing on the banner below the headline
  drops under ~20 mm. An earlier draft used 9.6 mm, which looks balanced zoomed
  out on a monitor and cannot be read in the room. Screen proofs lie about this.
- **Vertical position is height above the floor**, not position in the file.
  The cassette hides 100 mm and lifts the visible edge ~150 mm, so
  `floor_height = (2000 − y) + 150`. The headline sits at 1450–1750 mm (eye
  level) and the QR at ~1090 mm — chest height, where a phone comes up
  naturally. A QR at the bottom of a banner, where it looks tidiest in a
  mock-up, sits near 400 mm and makes people crouch. They don't.
- **Bleed and safe margins are real constraints, not decoration.** The card's
  reverse is laid out against the safe box (7 mm to 84 mm), not the page. The
  first version's 43 mm QR plus a 7 mm gutter left 32 mm for a line that needed
  37 mm, so the address crossed into the guillotine's tolerance. `dist/proof/
  business-card-guides.png` is what caught it.
- **QR physical size follows the 10:1 rule** — readable distance ≈ 10 × the
  symbol's side. The banner's 190 mm code carries about 1.9 m, the width of an
  aisle.

## Social specifications

Sizes are the platforms' published dimensions; `avoid_left` in `render.py` is
the width of the platform's own avatar/chrome overlay. Designing to the file's
dimensions instead of the safe region is the most common way a header ships
with its logo behind a profile picture.

| Asset | Size | Platform note |
|---|---|---|
| `linkedin-company-banner.png` | 1128 × 191 | Page logo overlaps the lower left. |
| `linkedin-personal-cover.png` | 1584 × 396 | Avatar overlaps the lower left. |
| `linkedin-post.png` | 1200 × 627 | Feed link-post image. |
| `linkedin-doc.png` | 1080 × 1080 | Document/carousel cover. |
| `wechat-official-cover.png` | 900 × 383 | Official Account article cover. |
| `wechat-moments.png` | 1080 × 1080 | Moments share card. |
| `wechat-namecard.png` | 1080 × 1920 | Full-screen digital name card. |
| `x-header.png` | 1500 × 500 | Avatar overlaps lower left; keep the bottom 120 px clear. |
| `instagram-post.png` | 1080 × 1080 | |
| `instagram-story.png` | 1080 × 1920 | Platform UI covers ~250 px top and bottom. |
| `facebook-cover.png` | 1640 × 664 | Desktop crops to a centred 820 × 312. |
| `youtube-banner.png` | 2560 × 1440 | Four crops from one file: TV 2560 × 1440, desktop a centred 2560 × 423, **phone a centred 1546 × 423**. All readable content sits in that smallest box — the generic card layout anchors top-left and put every word outside it. |
| `email-signature.png` | 1000 × 260 | |

## Why the artwork is rendered by Chrome

`cairosvg` and Pillow are both installed here and were the obvious choice —
right up until `@font-face`. Uno Display and Uno Sans *are* the brand; a poster
that silently falls back to Helvetica is not a lesser version of this work, it
is a different company's. Chrome honours `@font-face`, does real optical
letter-spacing, and its print path emits vector text at exact millimetre
dimensions.

Every artwork file is rendered self-contained — fonts base64-inlined, QR codes
inlined as vector `<svg>`, no network at all. Chrome applies file-origin rules
to subresources, and a font that fails to load from a `file://` sibling fails
**silently**.

Two things from `globals.css` are deliberately *not* carried over:

- **`size-adjust: 93.02%`** is load-bearing on the web, where it matches Uno
  Sans's x-height to SF Pro's so Apple devices see no shift on font swap. In
  print there is no SF Pro to match and no swap to survive; all it would do is
  set the banner 7% smaller than specified.
- **`backdrop-filter`** — there is no "behind" on vinyl, and Chrome's PDF path
  does not rasterise it reliably. The glass panels are baked instead: tint,
  specular top edge, hairline rim, depth shadow.
