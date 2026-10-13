# Vox Humana — the Wild Huntress, inhabitable

First working prototype of the Vox Humana website. Visitors can board the
*Wild Huntress* and walk, in first person, from the bridge through the
primary corridor into the galley. Along the way they open the manual hatches
themselves, look at the things people use, settle in a seat, and listen to
the ship. Visitors who only want the chapters can go straight to reading.

```
npm run dev        # build chapters from ./manuscripts, then serve on http://localhost:8080
```

- Requirements: Node 18 or later. There are no runtime dependencies and no
  build step for the site itself. three.js r185 is vendored in
  `public/vendor/`.
- `npm start` serves without rebuilding.
- `npm run content` rebuilds the chapters only.

## Manuscripts stay out of git

The repository is public, so it carries **no chapter prose**.

1. Put the supplied `.docx` files anywhere under `manuscripts/`. This folder
   is gitignored, and any folder layout works.
2. Run `npm run content`. It writes `public/content/chapters/*.json` and
   `public/content/library.json`, both gitignored.
3. Chapters whose source file is missing are listed as **Not in this build**
   and cannot be opened. Deploying `public/` without building publishes
   titles only.

To publish chosen chapters, run
`node tools/build-content.mjs --only next-01,next-02` and deploy the
generated files.

Metadata is kept apart from prose in `public/content/manifest.json`:
- book, number and title
- subtitle
- source file name
- viewpoint(s)
- `viewpointHolder`, which drives the in-world viewpoint notice

To replace a chapter during revision, drop in the new `.docx` and rebuild.
If its file name changes, update `source` in the manifest.

The converter (`tools/lib/docx.mjs`) never edits text. Its display
conversions are listed in [docs/SOURCES_AND_CONFLICTS.md](docs/SOURCES_AND_CONFLICTS.md).

## Screenshots

`docs/screenshots/`:
- `console.png`
- `bridge.png`
- `corridor.png`
- `elbow-stair-leaf-overhang.png` (the door-pocket defect)
- `galleyMC.png` (hatch looking aft)
- `galleyWork.png` (working half)
- `galleyMD.png` and `galley-settled-bench.png` (aft corner looking forward)
- `viewpoint-notice.png`
- `touch-phone.png`

Reader, inspector and Strata screenshots show manuscript prose, so they are
produced locally by `SHOTS=1 npm test` and are not committed.

## Using the site

- **Console** (`#/`): the original Vox Humana identity, with routes to board
  the ship or read, the Transmission Queue of supplied chapters, the
  Listening panel and a reserved Dispatch channel. The perspective rail is
  here and also in the top bar.
- **Aboard** (`#/ship`):

  | Action | Controls |
  |---|---|
  | Move | <kbd>W A S D</kbd> or <kbd>↑ ↓</kbd> |
  | Turn | <kbd>← →</kbd> or drag; click to capture the mouse, <kbd>Esc</kbd> releases it |
  | Interact | <kbd>E</kbd> (or click while captured) for doors, objects and seats |
  | Map / controls | <kbd>M</kbd> / <kbd>?</kbd> |
  | Touch | left pad moves, drag looks, **Use** acts |

  **Settle…** lists the seats in the current room. Once seated, all prompts
  disappear and nothing asks for attention. Any movement key,
  <kbd>Space</kbd> or **Stand** gets up.

  Your position, facing, door states and seat are saved continuously and
  restored when you come back from reading or reload.
- **Read** (`#/read`, `#/read/<chapter-id>`):
  - text size (<kbd>+</kbd>/<kbd>−</kbd>) and a night or paper theme
  - previous / next chapter, with the saved reading position restored
  - sound controls, and a return to the exact place aboard
- **Perspectives** (Quenby, Iri-Six, Nova, B.O.B.):
  - They change the interface accent, the observations shown at objects, and
    which objects are emphasised. The ship and the prose never change.
  - Opening a chapter whose record belongs to Quenby while aboard as someone
    else shows a short in-world notice. One button opens the original text.
- **Reduced motion**: follows the system setting, with an override in the
  console footer. It stops star drift, the fan and screen pulse, and the
  settle glide.

## Sound

- All ship sound is **generated live with Web Audio**; there are no
  recordings. It starts only when the visitor asks.
- There are five layers, each with its own slider: drive (with the aft pump
  "two beats late"), ventilation (with the port duct seam), structure (hull
  ticks and frame groans), consoles (hum, relays, rare soft chirps), and
  galley appliances (heater cycle with its off-key note, cooling unit, water
  generator, the corner fan's tick).
- Room presets: bridge, corridor, galley, lower deck and quiet. There is
  also a master volume and mute.
- **Follow the room** crossfades over about 3 s as you move. **Keep my mix**
  holds your balance; moving any slider switches to it.
- Preferences persist. One engine per page; a second tab silences the first.
- Quality was checked by measurement, not by ear: every layer is audible,
  none clips, and the levels and spectral centroids are in
  `test-results/sound-analysis.json`.
- To audition, listen to `docs/sound-samples/bridge-preset.webm` and
  `galley-preset.webm`. Regenerate them with
  `node tools/record-sound-samples.mjs` while `npm start` runs.

## Strata (reader notes)

The reader mounts **the real Strata embed** on one demonstration chapter,
Next 02 (*Filter by Honesty*, which opens in the galley). It is configured in
`public/data/strata.json` (`serverUrl`, `demoChapters`, `workIdPrefix`).
Strata lenses are reader-made note collections and are kept separate from
character perspective.

Strata needs its Node backend. As committed, Strata has **two defects that
block this**: its server does not start (a syntax error), and its embed
never saves a note (the selection is cleared before Save). Both fixes are
tiny. To run it:

```
git clone https://github.com/JellyKid-PEW/Strata && cd Strata/strata
npm install && npm install express-rate-limit
# 1) server: make the /likes/count handler async
sed -i "s/^router.get('\/likes\/count', (req, res) => {/router.get('\/likes\/count', async (req, res) => {/" src/routes/social.js
# 2) embed: keep the selection for Save — see docs/SOURCES_AND_CONFLICTS.md §7.2 (two lines)
PORT=3000 JWT_SECRET=change-me ALLOWED_ORIGINS='*' DB_PATH=./data/strata.db node src/server.js
```

- If Strata is not reachable, the reader says so and loads nothing; there is
  no imitation.
- The embed has no sign-in, so the reader provides a small form that talks
  to Strata's own `/api/auth` endpoints.
- More limitations are listed in
  [docs/SOURCES_AND_CONFLICTS.md](docs/SOURCES_AND_CONFLICTS.md) §7.

## Tests

```
npm i -D playwright@1.56.1 && npx playwright install chromium   # once
npm test                 # 16 browser checks
SHOTS=1 npm test         # also writes screenshots to test-results/
```

The suite drives real keyboard, mouse and touch input in Chromium and steps
frames deterministically. It covers:

- the bridge → galley walk, with hatches that block until opened
- collision against bulkheads and furniture
- inspection and perspective-specific observations
- settling and standing again
- the viewpoint notice
- returning from a chapter with location, perspective and sound intact
- reader position and text size
- sound start, follow/keep modes, mute and persistence, with no duplicate
  audio
- pointer-lock release
- touch
- reduced motion
- every route
- Strata

## Layout

```
public/                 deployable site (static)
  index.html            single-page shell: console, ship, library, reader
  js/app.js             routing; sound, ship and reader share one page lifetime
  js/ship/              world.js (geometry → scene, colliders, doors), explorer.js (walker),
                        lights.js, materials.js, dressing.js, hud.js, objects.js (Roomwright builders)
  js/sound/engine.js    layered generated ambience
  js/reader/            reader.js, strata.js
  data/ship/            geometry.json (Roomwright v34), rooms.json, spots.json, inspectables.json
  data/observations.json        hashed references to manuscript lines (no prose)
  data/drafts/perspective-lines.draft.json   NEW character wording — draft for author review
  content/manifest.json chapter metadata (committed); chapters/ + library.json are generated
tools/                  build-content.mjs, serve.mjs, record-sound-samples.mjs, lib/
tests/run.mjs           browser verification
docs/                   sources & conflicts, screenshots, sound samples
manuscripts/            (gitignored) your .docx sources
```

To extend the ship to another room:
1. Set it `developed: true` in `rooms.json`.
2. Add fixtures in `lights.js`, dressing in `dressing.js`, entries in
   `inspectables.json`, and seats in `spots.json`.
3. Leave the geometry alone. Regenerate it in Roomwright and drop the new
   `geometry.json` in.

## Status

**Works:**
- the continuous bridge → corridor → galley walk with manual hatches,
  collision and stairs (Roomwright's ground rules)
- 18 inspectable objects in the bridge, corridor and galley, with 51
  source-checked manuscript lines
- six places to settle
- five-layer sound with presets and both modes
- four perspectives with the viewpoint notice
- the reader with saved position
- keyboard, touch and reduced motion
- the real Strata embed: sign-in, selection toolbar, and a note saved to
  Strata (with the two documented fixes applied locally)

**Provisional:**
- Every room outside the route is Roomwright blockout, walkable and labelled
  "not yet developed".
- The draft character lines and perspective "notices" copy.
- The proposed `viewpointHolder` assignments.
- Seat and chair models are still Roomwright's block forms.
- The sound has been measured, not listened to.
- Visual tuning was done in software-rendered Chromium; check on real GPUs.

**Blockers:**
- Strata as committed: the server syntax error, and the embed's lost
  selection on Save. Two small fixes, verified working, are documented.
- The 45 Roomwright evidence quotes that no longer match the drafts, and
  the 18 door leaves without pockets ([docs](docs/SOURCES_AND_CONFLICTS.md)).
