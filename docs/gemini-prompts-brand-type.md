# Gemini prompt pack — Uno Digit brand type & graphics

## Read this first: what Gemini can and cannot do here

**It cannot make the font.** A typeface needs closed vector contours with correct
winding, one consistent stem width across 82 glyphs, sidebearings, 121 kerning pairs
and real vertical metrics. An image model renders *pictures of letters* — pixels that
look like type at a glance and fall apart the moment you set them at 8pt, kern a pair,
or hand them to a printer. Tracing generated images back into outlines reproduces every
inconsistency as a permanent defect.

`Uno Display` already exists as real binaries (`tools/fonts/uno-display/masters/`), drawn
from a parametric system. Use these prompts for everything *around* it.

| Use Gemini for | Do not use Gemini for |
|---|---|
| Poster and specimen art direction | Producing glyph outlines |
| Marketing key visuals, social templates | Kerning or spacing decisions |
| Exploring a **direction** before drawing | Anything going to a printer as type |
| Critiquing the specimen (text model — the best use) | Logotype final artwork |

---

## 1. The highest-value prompt: critique, not generation

Use a **text/vision** model, attach `tools/fonts/uno-display/masters/specimen.png`.
This is worth more than any image generation below, because it turns Gemini into a
second pair of eyes on work that already exists.

> You are a senior type designer reviewing a first release of a proprietary display
> typeface for a Sydney AI consultancy. The brand promise is "futuristic
> professionalism" and the audience is C-suite enterprise buyers.
>
> The face is a geometric grotesque, 1000 UPM, cap height 700, x-height 512,
> monolinear stem 82 at Regular, with these four intentional signatures:
> (1) square dots on i j ! ? rather than round; (2) flat-cut apexes on A M V W;
> (3) U drawn as the company's logo mark; (4) figure 1 with a full flat foot and
> figure 0 with a square node in its counter.
>
> Attached is the specimen. Assess it as you would a student portfolio — direct, no
> encouragement padding. For each point give the specific glyph and what is wrong:
>
> 1. Which glyphs are inconsistent in weight, width or rhythm with their neighbours?
> 2. Where does the spacing fail? Name the specific pairs that look too tight or loose.
> 3. Are the optical corrections doing their job — do O and o look the same size as
>    H and n, or heavier/lighter?
> 4. Does the lowercase have a consistent x-height and arch shape across a n m u h?
> 5. Does the face deliver "futuristic professionalism", or does it read retro,
>    generic, or novelty? Be specific about which letterforms drive that read.
> 6. Rank the five most damaging problems in order.
>
> Do not suggest a different typeface. Critique this one.

**Do not feed the answers straight back.** Verify each claim against
`glyphs.py` first — see the field note below. Then apply only what survives,
rebuild, re-render the specimen, and run the **round-2 prompt** (section 1b),
not this one again.

### Field note — a full six-round loop, 2026-08-21/22

The loop was run to completion: critique, verify, fix, re-render, repeat, until
the model reported no remaining defects. It works, but only with the discipline
below. Round-by-round:

| Round | Prompt | Outcome |
|---|---|---|
| 1 | Open critique (section 1) | 5 ranked problems. **2 fabricated, including #1.** 2 real. |
| 2 | Grounded, perception-only (1b) | **0 fabrications.** Confirmed the overshoot fix; found the letterfit collapse. |
| 3 | Same, after refit | Confirmed "Bold now comfortable", "one cohesive family". Flagged `U-N`. |
| 4 | Challenged the `u` with evidence | **Conceded** the `u` was genre-appropriate. Verdict flipped to shippable. |
| 5 | After `I-T` kern + `W` narrowing | "**None**" remaining. Reported 2 sheet "typos" — both OCR noise. |
| 6 | Blind transcription (section 1c) | Numerals read correctly. Legibility risk ruled out. |
| 7 | After enlarging the sheet's own captions | Box 04 read correctly. **New fabrication**: claimed `f` and `u` collide in "future". |
| 8 | Sent the measurement + a 2x crop | **Conceded**: "There is clear space between the f and u; they do not touch." Returned `NO NEGATIVE FEEDBACK`, unconditional. |

**Final tally: 7 real defects found and fixed, 5 fabrications rejected.**
`f`/`u` was measured at 87 units of clear space (5.22 px at the rendered size);
a collision needs <= 0. It conceded immediately when shown the number and the crop.

Everything real came from rounds 2 onward, i.e. after grounding. Fabrications
still appeared as late as round 7, after five rounds of correction — the rate
drops with grounding but never reaches zero, so **every claim needs checking, in
every round.**

Three rules the loop earned:

1. **Verify every claim against `glyphs.py` before acting.** Two of round 1's five
   ranked problems did not exist in the font at all.
2. **Ground the prompt with measured facts** (section 1b). Fabrication went to zero
   the moment the model was told what was *not* in the font.
3. **Push back with evidence when you think it is wrong.** Told that `u` mirrors
   `n` in every geometric face, it conceded and named the counter-examples
   (Gotham, Avenir, Proxima Nova, FF Mark, Circular). It updates on evidence — it
   just will not get there alone.

**On "iterate until it has no complaints":** a model asked to critique will nearly
always find something, so this only terminates because you *reject* the
non-defects. Left unchecked it would have had you remove a brand signature (the
node in `0`) and rebuild the `u` into something that clashed with its own
alphabet. The stopping condition is "no *verified* defects remain", not "no
feedback remains".

---

## 1c. Blind transcription — the legibility test

The single most trustworthy prompt here, because it has no opinion in it. Use a
**fresh chat** — a thread that has been told what the glyphs are cannot test
whether they read.

> Transcription task only. Do not critique, do not comment on design.
>
> The attached image is a typeface specimen. Under the heading "FIGURES -
> TABULAR BY DEFAULT" there is a single row of ten characters.
>
> 1. Transcribe that row exactly, left to right, as ten characters separated by
>    spaces.
> 2. In the four bordered boxes lower down, box 04 shows two large characters in
>    cyan. Transcribe those two characters.
> 3. For any character you were not fully certain of, name it and say what you
>    might have confused it with.
>
> Nothing else.

This settled whether the square node inside `0` made it read as `8` — a real
risk for a company called Uno **Digit**. It did not: `0 1 2 3 4 5 6 7 8 9`, clean.
Run the same test on `I l 1` and `O 0` before shipping any new cut.

### Original field note — round 1 scoring, 2026-08-21

Run 1 of this prompt against Gemini Pro, specimen attached. Every claim was
checked against the source. Scored:

| Claim | Verdict |
|---|---|
| "Node forced into the counter of the **D**" — ranked #5 most damaging | **False.** `g_D` has zero `node_square` calls. Invented. |
| "**U** uncomfortably narrow, breaks text rhythm" — ranked **#1** most damaging | **False.** `U = 705`, `H = 705`. U/H = 1.000. |
| "Strictly monolinear, no thinning at the poles" | **False.** `ring()` applies `tv = t * 0.90`. |
| "No visible optical overshoot" | **Right observation, wrong cause.** `OVER` existed but at 0.90% of em vs the 1.0-1.5% norm — too small to read. Raised to 12. |
| "Sidebearings mathematically applied, not optically balanced" | **True.** `sb_flat = 88 - stem * 0.20` is one formula for every flat-sided glyph. |
| "`m` too wide" | Marginal. `m/n = 1.494` vs a 1.45-1.48 norm. |
| "Reads 1920s Art Deco, not futuristic" | Subjective, and partly built on the false `U` premise. |

**Two of five ranked problems were fabricated, including the top one.** The model
cannot see the source, so it narrates plausible-sounding type failures onto the
image. Treat it as a **perceptual instrument, never a diagnostic one**: trust it on
"this looks heavy / uneven / retro", never on "here is the mechanism". Anything it
says about *why* is a guess. Anything it says about *what it sees* is evidence.

---

## 1b. Round-2 prompt — grounded, perception-only

Use after applying fixes. Two changes from section 1: it states what is **not** in
the font so the same fabrications cannot recur, and it asks only questions an image
can actually answer.

> You are reviewing a revised release of a proprietary geometric display typeface.
> Attached is the current specimen.
>
> Ground rules — these are measured facts about the font, not opinions. Do not
> contradict them, and do not comment on them:
> - `U` and `H` have identical advance widths (705 units each at 1000 UPM).
> - There is NO node, dot or ornament inside `D`. Square nodes appear only in
>   `i j ! ? . , : ;` and inside `0`.
> - Round glyphs are thinned at top and bottom to 90% of the stem width.
> - Round glyphs overshoot the baseline and cap line by 1.2% of the em.
>
> Answer ONLY from what you can see in the image. If you cannot judge something
> from the picture, say "cannot judge from image" rather than inferring a cause.
>
> 1. Do `O` and `o` now sit optically level with `H` and `n` — same apparent
>    size — or do they still look smaller or larger? This is the specific change
>    under test.
> 2. In the word "Intelligence" at each of the four weights, is the letter rhythm
>    even? Name any gap that is visibly wider or tighter than its neighbours.
> 3. In the wordmark "UNO DIGIT", which letter pair has the worst fit?
> 4. Does `u` now look like it belongs to the same alphabet as `n`, `m` and `h`?
> 5. One sentence: what does this face say about the company setting it?
>
> No summary, no encouragement. Answer the five questions.

---

## 2. Type specimen poster (image model)

Gemini renders the *poster*, not the letters. Set the real type in Figma or InDesign
using `UnoDisplay-Bold.otf` and composite it over the generated art — or generate a
background and place live type on top.

> A minimal Swiss-style type specimen poster background, A1 portrait. Deep space
> navy (#020617) field with a single soft radial glow in cyan (#06b6d4) at 30% from
> the upper left and a faint violet (#8b5cf6) bloom at the lower right. Subtle
> horizontal scanline texture at 3% opacity. Large empty negative space in the
> centre two-thirds — nothing there at all, no text, no shapes. A precise 1px cyan
> hairline grid visible only in the outer 8% margin. Flat, no perspective, no
> gradient banding, print-quality. NO text, NO letters, NO typography anywhere.

The "NO text" instruction is load-bearing — image models will otherwise fill the space
with malformed pseudo-letterforms that undermine the point of owning a typeface.

---

## 3. Brand key visual — the node motif

Derived from the logo's two violet nodes and the square-dot signature, so the imagery
and the typeface share one idea.

> An abstract 3D network of connected nodes, rendered as a precise technical diagram
> rather than an organic neural net. Small SQUARE nodes, not spheres, connected by
> thin straight cyan (#06b6d4) lines of uniform 1px weight. Nodes glow faintly
> violet (#8b5cf6). Deep navy (#020617) background. Isometric, orthographic — no
> perspective distortion. The structure reads as engineered and deliberate, like a
> circuit trace or an architectural plan, not like smoke or particles. Generous
> empty space. Restrained, premium, corporate. No text.

**Why square nodes:** the typeface's dots are square. If the imagery uses spheres the
system stops agreeing with itself.

---

## 4. Letterform *direction* exploration (before drawing, never instead of)

Only useful at the very start of a new cut — e.g. a future condensed or serif
companion. The output is a mood reference to draw *from*, not artwork to trace.

> A grid of typographic direction studies for a technology brand, presented as a
> designer's exploration board. Nine variations of a single geometric capital letter
> form, monolinear, high contrast against a deep navy field. Explore: perfectly
> circular versus slightly narrowed bowls; flat-cut versus pointed apexes; square
> versus round terminals; tight versus open apertures. Clean vector rendering,
> uniform stroke weight within each study, laid out on a strict 3x3 grid with
> generous margins. Reference-board aesthetic, technical and analytical.

Then translate what works into parameters in `glyphs.py` — `rx` for bowl width,
`flat_apex()` for apexes, `ring()`'s `tv` for terminal weight. The parameters already
exist; the board only tells you where to set them.

---

## 5. Social / campaign template backgrounds

> A 1080x1350 social post background for an enterprise AI consultancy. Deep navy
> (#020617) with a soft cyan-to-violet gradient mesh occupying the lower third,
> heavily blurred, low saturation. A single thin cyan hairline running the full
> width at the 62% mark. The upper two-thirds is completely empty flat colour,
> reserved for headline type. Premium, restrained, editorial. Absolutely no text,
> no letters, no logos, no UI elements.

Set the headline in Uno Display Bold at `-0.035em` tracking — the same values the
wordmark uses in `masters/specimen.html`.

---

## 6. What to hand Gemini as context

When asking for critique or direction, attach:

- `tools/fonts/uno-display/masters/specimen.png` — the rendered specimen
- `apps/web/public/logo.png` — the two-colour mark the signatures derive from
- The four signatures, quoted from `tools/fonts/uno-display/glyphs.py`
- Brand colours: cyan `#06b6d4`, violet `#8b5cf6`, ground `#020617`

Do **not** attach the `.otf` and ask for modifications — it cannot edit a font binary,
and any answer claiming otherwise is fabricated.

---

## 7. Print checklist (nothing to do with Gemini)

For marketing collateral, install from `tools/fonts/uno-display/masters/`:

| File | Use |
|---|---|
| `UnoDisplay-Light.otf` | Large-format only — the 54-unit stem breaks up below ~24pt |
| `UnoDisplay-Regular.otf` | Body headlines |
| `UnoDisplay-Medium.otf` | Subheads, decks |
| `UnoDisplay-Bold.otf` | Wordmark, covers, posters |

`fsType` is 0 (installable embedding), so the fonts embed in PDFs without restriction.
They carry no OFL obligation — Uno Display is original work, not a derivative, and its
name table declares Uno Digit as designer and owner. That is **not** true of Uno Sans,
which is Inter-derived and stays under OFL 1.1; if Uno Sans is ever used in print,
`apps/web/public/fonts/OFL.txt` travels with it.
