# Test log

Runs of 2026-10-12. Everything below was executed, not estimated. Where something could not be tested here, it says so.

**Headline:** the full pipeline (real MediaPipe hand tracking → features → matcher → gate → cast → recording) works end to end in a browser, driven by photographs of real hands standing in for the four signs. **Real hand-sign training and recognition with the actual Jujutsu Kaisen signs, on a real webcam, is unverified.** Nobody performed the signs on camera for these tests; that test is Holly's (see the end of this file).

## Environment

| | |
|---|---|
| Machine | cloud sandbox, Linux x86_64, 2 vCPU Intel Xeon @ 2.10 GHz, no GPU, no camera, no microphone |
| Network | npm registry only; `storage.googleapis.com` blocked, so the official segmentation model could not be downloaded |
| Node / npm | 22.22.0 / 10.9.4 |
| Browser | Chromium 153.0.8010.0, headless shell, single process, SwiftShader WebGL, driven by puppeteer-core 25.13.0 |
| Media checks | ffprobe / ffmpeg 6.1.1 |
| App | Vite 8.3.4, @mediapipe/tasks-vision 0.10.35, hand model `public/models/hand_landmarker.task` (7,819,105 bytes) on the CPU delegate |

## Install and build

- `npm install`: installs pinned versions from `package-lock.json` and copies the MediaPipe WASM runtime (SIMD and no-SIMD variants) into `public/mediapipe/wasm`.
- `npm run dev`: serves http://localhost:5173.
- `npm run build`: about 0.3 s. JS 308.7 kB (100.8 kB gzip), CSS 15.5 kB. `dist/` is 30 MB, nearly all of it the WASM runtime (21.6 MB) and the hand model (7.8 MB).
- `npm run preview`: the final browser run below used this production build.
- Fresh clone: see the last section.

## Unit tests (`npm test`)

82 tests in 10 files, all passing. They run on synthetic hands from the procedural hand model, never on a real person.

| File | What it checks |
|---|---|
| `features.test.js` | documented vector sizes; empty frames; scale invariance (near and far); small rotations; a mirrored hand gives the same shape with the other chirality; two-hand order independence; overlap and wrist gap |
| `matcher.test.js` | all four signs learned with per-sign thresholds; fresh frames accepted from every view; neutral poses and fists rejected; one sign never accepted as another; wrong hand count rejected; hand-order and label swaps survived; swapped roles rejected for the asymmetric Higuruma sign; handedness gate; scale and rotation; one animation per sign; untrained signs never fire; signs trained one at a time; deleted signs stop firing; a deliberately confusable Megumi that copies the Sukuna seal is flagged ("resembles … in k/12 tries"); hidden or merged captures flagged; neutral poses named when they are the confusion |
| `gate.test.js` | 0.7 s hold; single noisy frames never fire; 150 ms dropout tolerance; hold resets on sign change; cooldown; release before re-arm; a release seen during the animation counts; a sign held through cast and cooldown never recasts; every new cast starts a fresh release check |
| `capture.test.js` | 0.4 s stable capture with three vectors; missing or extra hands; independent captures; merged detections refused; same-label hands flagged; a pose held across a prompt change is not stored under the next prompt |
| `challenge.test.js` | 5 seeded random trials per sign; ready badges; confusions withhold ready from both signs; misses; false positives during rests; a hold that runs past the end of a trial is not a false positive |
| `storage.test.js` | IndexedDB and fallback stores: store, list and delete by sign; numbers and metadata only, never images; export and re-import; foreign or outdated exports refused |
| `domains.test.js` | exactly four domains, one animation each; distinct draw calls and palettes; same seed gives an identical replay, a new seed changes it; reduced motion still transforms the scene; overlay mode and low effects render; no image is ever loaded into the canvas; the excluded character's name appears nowhere in the repository |
| `geometry.test.js` | 640×480 → 9:16 crop; landmarks land exactly on the transformed video pixel; mirrored exactly once |
| `sample-vectors.test.js` | `tests/fixtures/sample-vectors.json` matches its generator, holds only labels and numbers, imports, exports and trains |
| `native-logs.test.js` | MediaPipe INFO/warning chatter goes to `console.debug`; real errors stay errors |

## Browser tests on the production build (`npm run test:e2e -- --base http://localhost:4173`)

30 of 30 checks passed.

| Check | Result |
|---|---|
| Landing, 1440 px | no horizontal scroll (1440/1440), stage 404×718 (exactly 9:16), 4 cards with official links, no control under 44 px, 0 console errors, 0 third-party requests |
| Landing, 390 px | no horizontal scroll (390/390), stage 351×625, same checks |
| Camera errors | permission denied, no camera, camera busy, insecure page, no WebAssembly, hand model failed to load: each shows its own message and a Retry button |
| Simulation, normal and reduced motion | the four animations `unlimited-void`, `malevolent-shrine`, `chimera-shadow-garden`, `deadly-sentencing` all play under a "SIMULATION · NO HAND RECOGNITION" banner with the controls locked |
| Settings | mute, low effects and reduced motion survive a reload |
| Keyboard | Tab order starts at the skip link and header tools, every focused control shows a 2 px+ outline, Enter opens simulation |
| Recording (simulation) | Higuruma and Gojo clips: MP4, H.264 720×1280 plus an Opus audio track, 8.6 s each (ffprobe 8.57 s and 8.50 s); file extension matches the container |
| PNG | 720×1280 |
| Fake camera device | Chromium's `--use-fake-device-for-media-stream`: 640×480, tracker ran at about 51 ms per frame, mirrored; Stop camera released the tracks |

## Real MediaPipe pipeline with stand-in photos

**Setup.** A canvas "camera" replaced `getUserMedia` and showed photographs of real hands, so the actual HandLandmarker, feature extraction, matcher, gate and recorder all ran in the app as shipped. The photos are 40 gesture images from MediaPipe's own Model Maker test data (`mediapipe/model_maker/python/vision/gesture_recognizer/testdata/raw_data/{call,four,none,rock}`), of which 29 had hands big enough to use. They were used only inside the test sandbox and are not in this repository.

No photo shows a Jujutsu Kaisen sign, so each sign was taught as a stand-in made of those shapes:

| Sign | Stand-in |
|---|---|
| Gojo | one "rock" hand (index and pinky up) |
| Sukuna | two "rock" hands |
| Megumi | two "four" hands |
| Higuruma | a "rock" hand and a "four" hand |

Neutral poses were "four", "none" (relaxed) and "call" shapes, alone or in pairs. Each of the 12 captures per sign used a different photo (so a different person's hand) at a shifted, rotated or squashed view, which is a harder test than one person repeating a sign. Before teaching, each photo was shown alone at each hand position, and photos the tracker could not see were set aside, much as a person checks their framing.

**Final run (production build):**

- Hand model: the local copy, 7,819,105 bytes, CPU delegate. The official segmentation model could not be downloaded here, so the app went to effects overlay mode, as designed.
- Mirroring: raw x 427.3 px → stage x 74 (unmirrored would be 646); raw x 235.5 → 585. Mirrored exactly once.
- Teaching: 8 neutral poses and 12 captures for each sign, all four **Learned** (thresholds Gojo 0.159, Sukuna 0.208, Megumi 0.224, Higuruma 0.182). Retaking one slot kept Higuruma learned.
- **Test my signs:** Gojo 5/5, Sukuna 4/5 (cast as Gojo once), Megumi 5/5, Higuruma 5/5, no false positives. Green READY for Megumi and Higuruma. Gojo was withheld because Sukuna was once cast as Gojo; Sukuna was withheld for the same confusion. Median time from the start of a trial to the cast: 1.2 s (range 1.0–4.5 s), which includes the 0.7 s hold.
- **Live:** all four signs cast their own domain without touching a button, 1.2–1.8 s after the photo appeared. The photo was removed mid-cast each time and every sequence finished on its own.
- Holding a sign through its cast and the cooldown did not recast (gate stayed in "release"); after the hands dropped, the same sign cast again.
- Replay re-ran the same seed (1899469135).
- **Recorded live cast:** Megumi, MP4 (H.264 720×1280 + Opus), 9.3 s by ffprobe.
- Deleting all training left 0 captures and no live signs.
- 0 unexplained console errors (the one error is the blocked segmentation download), 46 requests, none to any host other than the app and Google's MediaPipe model bucket.

**Variation across runs.** The challenge order is random, so each run gives every sign different photos. Earlier runs on the dev server:

| Run | Gojo | Sukuna | Megumi | Higuruma |
|---|---|---|---|---|
| A (before the trial-end fix below) | 5/5 | 1/5, 3 missed, 1 cast as Gojo | 3/5 | 4/5 |
| B | 5/5 | 2/5, 1 missed, 2 cast as Gojo | 5/5 | 5/5 |
| Final | 5/5 | 4/5, 1 cast as Gojo | 5/5 | 5/5 |

**Why Sukuna struggles here.** In run B the test runner logged what the app saw in every trial. Every failed Sukuna trial had the tracker finding only one of the two hands. A single "rock" hand *is* the Gojo stand-in, so: when the remaining hand was the left one, the matcher's handedness check rejected it (24 frames, a miss); when it was the right one, Gojo fired (a confusion, which the challenge reported and which cost both signs their badge). The real signs don't share a shape this way, so this exact collision is an artifact of the stand-ins. The general risk is real, though: a two-hand sign whose second hand keeps dropping out can be read as a one-hand sign, and Test my signs is where it shows.

**Detector misses.** The palm detector missed a hand in many composed photos: the test runner had to show another photo 23 times during teaching and twice during the challenge. Webcam frames of a real person, with arms attached, should be easier for it than pasted photo crops, but that is unverified.

## Segmentation cutout

The official Selfie Segmenter couldn't be downloaded here. To exercise the real Image Segmenter path anyway, the run used a test-only conversion of MediaPipe's older selfie segmentation model (metadata added with MediaPipe's metadata writer). That file was never added to the repository.

- With hand tracking capped at 6 fps (`?handFps=6`), a full photo of a person as the camera: 16 masks at about 40 ms each, person covering 28% of the frame, and the person was composited in front of Malevolent Shrine at 1.5 s and 3 s into the cast.
- At the default 18 fps, hand tracking took 88–106 ms per frame on this CPU and left no time for segmentation: after 4 s with no masks the app switched itself to effects overlay mode and said why.

## Problems found by these tests and fixed

- **MediaPipe 1.0+ sends usage metrics.** The first real run logged POSTs to `odml.pa.googleapis.com` from `@mediapipe/tasks-vision` 1.1.0. Pinned 0.10.35, the last release without that code, and added a Content-Security-Policy that only allows this origin and the model bucket.
- **A held pose could be stored under the next prompt.** After "fist", holding still captured the same fist as "peace" (and the last neutral pose could become the first sign capture). Captures now require a release across prompt changes.
- **Re-arming ignored hands dropped during the animation.** Holly would have had to drop her hands again after the cooldown. A release seen any time after the cast began now counts.
- **A hold that ran past the end of a trial landed in the pause as a false positive.** Trial timeouts now require a release.
- **Segmentation silently starved on slow machines** while the status said it was on. The app now detects it and switches to overlay mode with a message; `?handFps=` lowers the hand rate for slow machines.
- **The test clock freeze also froze tracking**, which made the cutout look stale in frozen screenshots. Tracking, segmentation, gates and recording now always run on real time.
- **Arrow glyphs rendered as empty boxes** where a font lacked them; replaced with small SVG drawings.
- MediaPipe's INFO and warning lines were printed as console errors; they now go to `console.debug`.

## Not verified here

- **The real signs on a real camera.** Teaching, validation, Test my signs and live casting with Holly's own hands, webcam and lighting. Interlaced fingers (Megumi's canonical sign) and pressed palms (Sukuna's) are the hardest for the tracker; the camera-friendly variants exist for that reason.
- **The official Selfie Segmenter** (could not be downloaded) and the person cutout with a real webcam.
- **The GPU delegate.** No GPU here; the app tries GPU first and falls back to CPU.
- **Real browsers:** Chrome, Edge, Firefox and Safari on desktop, and any phone. Only headless Chromium 153 ran here.
- **Recording outside Chromium.** Chromium 153 records MP4 (H.264 + Opus). Firefox is expected to record WebM and Safari 14.1+ MP4, both untested. Where `MediaRecorder` or `canvas.captureStream()` is missing, the Record button says so and Save PNG still works.
- **Sound as heard.** The Web Audio graph runs and clips carry an Opus track, but nobody listened to it.

## Holly's camera test

1. `npm install`, `npm run dev`, open http://localhost:5173 in Chrome, start the camera.
2. Teach one sign with the camera-friendly variant in even, front-facing light, then run Test my signs.
3. Note what the verdict says, the Test my signs score, and whether anything fires during rests. If a sign keeps showing "Hands hidden" or confusions, open a wider gap between the wrists and retake.
4. Record one clip, open the file, and check picture and sound.

## Fresh clone

Checked from a clean clone of the committed repository: `npm ci`, `npm test` and `npm run build` all succeeded.
