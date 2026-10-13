# Sources, what was reused, and where they disagree

This prototype stands on four sources. Your instructions come first, then the
sources in this order: Roomwright (ship geometry), the supplied manuscripts
(prose), the older website archive (visual identity only), and Strata
(annotation). Where sources disagree, the disagreement is listed here. Where
the visitor build had to pick one reading, it says so and does not edit the
source.

## What was reused and what was adapted

| Source | Reused as is | Adapted |
|---|---|---|
| **Roomwright** (`JellyKid-PEW/VoxHumanaSF`, branch `claude/roomwright-3d-builder-wg3v5b`, commit `966244d`, layout v34) | `maps/geometry.json`: all 478 physical records (walls, doors, stairs, floors, fixed furniture, conduits), unchanged, in `public/data/ship/geometry.json`. Object builders from `js/objects.js`, kept dimension for dimension in `public/js/ship/objects.js`. The walker rules from `js/editor.js`: ground sampler (≤0.32 m up, ≤0.45 m down), body radius and sliding along colliders. | Materials are textured (`materials.js`). Static geometry is merged per room for speed. **Closed door leaves now block**: in Roomwright's walk mode they were ignored. Doors animate by hand. The 21 `massing` records are editor diagnostics and are left out. The editor itself (panels, constraints, gizmos, tests, mannequins) stays outside the visitor flow. |
| **Production floor plan V1** | Galley fixed elements: hatch, port counter run and sink, tin shelf, heater/hydration unit, cooling unit, table, bench, cabinet, corner fan. Working half forward, lingering half aft. Camera anchors M‑A, M‑C and M‑D. | Lived-in dressing (mugs, kettle, slate, towel, cable loops, work lights) is placed relative to the fixed records and never moves them. These are all "production-flexible" items. |
| **Old website archive** (`VoxHumanaSF.com.zip`) | Console tokens and framing (`style/styles.css`), the four character colours from `scripts/voices.js` and the four seals, the Crew Rail perspective selector (concept D), the transmission-queue idiom, Listening and Dispatch panels, and compatibility with `perspectivechange` and the `voxhumana-perspective` storage key. | Faint text tokens are raised to WCAG AA. Labels are at least 11 px. Scanlines sit behind content, are off on the ship and reader, and can be turned off. The grain animation, cursor ring and boot sweep are dropped. Logos are normalised (bob/nova downscaled, the hidden checkerboard under transparent pixels removed). **None of the archive's text is reused**: dispatches, snippets, chapter blurbs, dates, status lines and taglines all stay out. `home.js` and `memory.js` are preview stubs ("DO NOT copy") and were not used. |
| **Strata** (`JellyKid-PEW/Strata`, `89b7c7d`) | The real `public/embed.js` (ReaderLayer 0.2.0) is loaded from a running Strata server, and its real API is used (`init`, `setToken`, `destroy`). | The site supplies the sign-in that the embed lacks (Strata's own `/api/auth/login` and `/register`). The chapter body renders only `<p>`/`<h2>` blocks in source order, because Strata anchors notes by block position. |
| **Manuscripts** (35 `.docx`) | Prose, verbatim. Word italic, bold, underline and caps runs, soft line breaks, the one auto-numbered paragraph (Want 03, "9."). | Display only: literal Markdown typed into the Presence drafts (`**…**`, `_…_`, leading `> `) renders as emphasis or console text. `::` ship-display lines are styled as console text. Scene-break marks are shown as written. Empty paragraphs used as spacing collapse. Every conversion is counted per chapter (`conversions` in each chapter JSON). |

## Conflicts and defects found

### 1. Roomwright's evidence quotes no longer match the supplied drafts

Of Roomwright's 175 seed constraints, **130 quote the supplied drafts
verbatim and 45 do not**. The prose has been revised since the seed was
written. Some of those quotes carry spatial decisions, for example
`med-two-beds`, `galley-island`, `dome-*` and `iri-quarters-route`. The
geometry still follows the author rulings logged in Roomwright. Whether each
ruling still has textual support in the current drafts is **for you to
check**.

| Constraint key | Source | Status in supplied drafts |
|---|---|---|
| `crossable-room` | Next-10 | not verbatim |
| `overhead-voice` | Presence-02 | found in Presence-01 instead |
| `forward-glass` | Presence-02 | not verbatim (wording revised in the draft) |
| `locker-row-hooks` | Next-10 | not verbatim |
| `vent-grid` | Next-09 | not verbatim |
| `chair-notch`, `chair-sideways` | Next-10, Next-01 | not verbatim |
| `console-under-hands` | Presence-02 | not verbatim (second sentence revised in the draft) |
| `console-mug-rim`, `console-kneehole` | Next-10, Next-01 | not verbatim |
| `jump-seat` | Next-05 | not verbatim |
| `aux-console`, `rail-between`, `two-rail-sets` | Presence-02 | not verbatim |
| `rail-worn` | Next-01 | not verbatim (punctuation revised in the draft) |
| `viewport-bench` | Presence-05 | not verbatim |
| `galley-aft` | Next-11 | not verbatim |
| `galley-tiny` | Presence-06 | not verbatim |
| `galley-island`, `galley-across` | Next-07 | not verbatim. The draft **still says "central prep counter"**, so the pending text correction has not landed yet. |
| `med-two-beds` | Next-01 | not verbatim |
| `med-deeper` | Presence-05 | not verbatim |
| `alk-main-hatch`, `alk-two-steps` | Next-04 | not verbatim |
| `alk-side-rail`, `alk-tether` | Next-06 | not verbatim |
| `eng-manifold`, `eng-toolbox`, `eng-tap`, `eng-two-steps` | Presence-01 | not verbatim |
| `eng-behind-tanks` | Next-07 | not verbatim |
| `dome-hidden`, `dome-ledge`, `dome-curve`, `dome-rim-dust` | Next-08 | not verbatim |
| `stair-lights` | Next-11 | not verbatim |
| `lower-corridor`, `cabin-row` | Next-07 | not verbatim |
| `cabin-bunk` | Next-08 | not verbatim |
| `iri-quarters-route`, `iri-worktable`, `iri-storage-hatch` | Next-09 | not verbatim |
| `cradle-clunk` | Presence-02 | not verbatim |
| `unl-narrow`, `unl-cache` | Next-09 | not verbatim |

The visitor build quotes manuscripts only through hashed references that the
build re-checks against the current drafts (`tools/lib/quotes.mjs`). A line
that stops matching is dropped from the ship and reported at build time.

### 2. Galley plants: geometry vs production plan

Roomwright v34 places **Potted plants** in the galley. Production plan V1
says "plants are later continuity, not baseline from the beginning of the
series", and Presence-11 introduces "the new plants". The visitor baseline
**leaves them out** (`public/data/ship/rooms.json` → `exclusions`). Remove
that exclusion to restore them.

### 3. Fittings whose detailed face points into the wall

Roomwright builds counters and lockers with their doors, lip and latches on
local +z. Ten exported records face that detail into the bulkhead behind
them. Footprints are symmetric, so the plan itself is correct. The visitor
build mirrors only the face details back into the room and logs every case
(`ShipWorld.facingFixes`):

- galley: counter run + sink
- galley: heating / hydration unit
- wet-service: domestic service manifold
- hygiene: vestibule wash / utility sink
- dome: viewport shutter housing
- Cabin One, Three and Six lockers
- work-spine: parts lockers
- corridor: coolant riser access

### 4. Sliding door leaves have no pockets

Roomwright animates a leaf by sliding it sideways but never models the wall
pocket it slides into. Its walker ignored leaves, so this never showed. With
leaves now physical, **18 doors slide past their wall stubs into open
floor**.

- The two hatches on the bridge → galley route (bridge hatch, galley hatch)
  are **not** affected.
- The most visible case is the **primary stair opening**: its open leaf
  overhangs the corridor elbow by about 0.45 m. The elbow keeps 0.65 m clear,
  so it is passable but tight.
- Also affected: dry hygiene branch opening, engine bay doorway (hinged),
  both skiff-bay doors, the doors of Cabins Two through Six, the domestic
  stores hatch, the flex-bay cargo hatch, the freight lock inner door, both
  main-bay doors, the unlisted access plate, and both Deck Three doors.
- The geometry is kept as exported. **Suggested fix in Roomwright:** add
  pocket stubs, or flip `slideDir` where the other side is wall. For example,
  the stair opening's leaf would pocket into the forward port wall if it
  slid forward.

### 5. Older website vs manuscripts

- Chapter titles: the archive lists Next 11 as "Destination: Optional" and
  12 as "Give Them the Sound". The manuscripts are **11 · Resonance** and
  **12 (Epilogue) · Black Box**. The archive's own chapter file links
  chapter 03 as "Stathos Arc Nine". The manuscripts are used.
- Release dates ("Released · Jun26", "Presence Nov26"), cadence ("Every
  Fortnight"), ship status ("Crew 2") and "v1.0.0" are not approved and are
  not shown.
- Character colours: `voices.js` and the sample chapter file disagree (Iri
  `#7FD6A3` vs `#72DFA3`, B.O.B. `#7FD7FF` vs `#68D8FF`, Nova `#8C82FF` vs
  `#A79EFF`). The prototype uses `voices.js`.
- Role labels disagree across four files ("Captain/Navigation/Archive/
  Unregistered Signal", "Bridge/Structural Care/Interface Presence/
  Resonance", and so on). No role labels are shown. The per-perspective
  "notices" lines are new interface copy, marked draft in
  `data/perspectives.json`.
- Nova is `selectable:false` ("Reserved") in the archive. Your instruction
  includes Nova, so Nova is selectable.
- `vox-logo-q-vox.png` is byte-identical to the master `vox-humana-logo.png`.

### 6. Manuscript titles and viewpoints

- Next and Presence carry no title inside the documents. Titles come from
  the file names, with `#U2019` decoded to ’. "DissonanceV3" (Presence 01)
  and "(review)" (Presence 08) look like version or status tags and are not
  shown.
- Want 01–08 carry no title anywhere, so the reader shows them as
  "Untitled in the manuscript". Want 09–11 have Heading 1 titles.
- **No chapter is framed as a record authored by Quenby**: all are close
  third person. "Quenby-authored viewpoint chapter" is implemented as
  `viewpointHolder: "quenby"` on chapters told mainly from Quenby's
  viewpoint. Mixed chapters (Next 09–11, Presence 08–09, Want 10) and the
  two ship-record epilogues have no holder. These assignments are
  **proposals** in `public/content/manifest.json`; edit them freely.
- Galley seating: the prose mentions a bench and a "seat"/"chair". The
  supplied drafts never say "stool". Roomwright's two stools are kept as
  movable seating, which the production plan allows.

### 7. Strata blockers (concrete)

1. **The server does not start as committed.** `src/routes/social.js:57`
   uses `await import('module')` inside a non-`async` route handler (line
   69), which is a `SyntaxError` at load.
   - **Fix:** `router.get('/likes/count', async (req, res) => {`.
2. **The embed cannot save a note as committed.**
   - Mousedown on a toolbar type hides the toolbar. The matching mouseup
     then lands on the paragraph underneath, and `_onSelectionEnd` sees an
     empty selection and calls `_hideToolbar()`, which sets
     `selectionData = null`. `_saveAnnotation` then returns without a
     request (`public/embed.js` ~641, ~668, ~783).
   - Reproduced in the browser test: no POST is sent, and the server holds
     no note.
   - **Fix (2 lines):** in `_openAnnotationInput`, keep
     `const captured = selectionData;` and restore
     `selectionData = captured;` just before `_saveAnnotation(...)`.
3. `express-rate-limit` is imported by `src/server.js` but missing from
   `package.json`.
4. `.env.example`, `DEPLOY.md` and the Dockerfile set `DATA_DIR`, but the
   code reads `DB_PATH`.
5. Embed limitations that affect a revising author:
   - Notes anchor to the n-th paragraph, not to the quoted text. Inserting
     or removing a paragraph shifts every later note.
   - The embed has no sign-in UI. The reader supplies one through Strata's
     own `/api/auth`.
   - Its Lenses tab is a placeholder.
   - `GET /api/embed/annotations` returns only the caller's own notes.
   - Selected text and note types are inserted into `innerHTML` unescaped.

**What the demonstration used:** a scratch copy of Strata `89b7c7d` with
fixes 1 and 2 applied (three changed lines). With that copy, the Vox Humana
reader mounted the real embed on Next 02 (130 paragraphs wrapped), signed a
reader up, drag-selected a sentence, chose "Insight", and saved. The server
answered `201` and the note's dot appeared on the paragraph. Your Strata
repository was not modified.
