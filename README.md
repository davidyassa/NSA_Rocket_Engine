# Sol Check

**Daily health check-ins for astronauts too far from Earth to call a doctor.** Sol Check notices when a crew member drifts from their own normal, explains it in plain words, and routes it to the right person: the crew member, the onboard medical officer, or Earth. It works fully offline on a laptop or phone. Research prototype, not a diagnosis.

**Live demo:** *add the published link here* · **60-second video:** [docs/media/sol-check-demo.mp4](docs/media/sol-check-demo.mp4) · **Pitch script:** [docs/pitch.md](docs/pitch.md)

## Sol 43

Maya Chen is a geologist at a habitat in Gale Crater, Mars. Her nearest doctor is 20 light-minutes away, so every question and answer takes at least 40 minutes.

Two sols ago a solar storm hit. That storm is real: NASA's Curiosity rover measured radiation on the Mars surface doubling on 11 September 2017, and Sol Check replays those readings as Sol 41. The crew sheltered for two days in a crowded module. Rations were short, exercise was cut, and the air grew stale.

This morning Maya says she feels fine. She does her three-minute check-in, and Sol Check notices what she doesn't:

- her sleep and her mood have both been below **her own usual** on four of the last five sols;
- her heart rate variability has dropped well below her own usual (the laptop camera can measure it, with no extra hardware);
- she has eaten too little on most recent sols, while exercise stayed short;
- her headaches came on the sols when cabin CO2 passed NASA's limit.

Sol Check doesn't diagnose. It tells Maya in plain words, and because sleep and mood are falling together, it suggests she talks to the crew medical officer today. The medical officer opens the evidence: every reading, her personal baseline, and the rule and source behind each finding. If they need Earth, Sol Check packs one complete handoff for the flight surgeon, so a single 40-minute round trip is enough.

## The demo in five steps (2 minutes)

1. **Check in** (`#/check-in`): one question per page; the camera can measure heart rate (about 15 s) and breathing and HRV (about 45 s) on the device. Tap **Fill demo readings**, then **Save and assess**.
2. **Assessment** (`#/assessment`): plain-language findings, each with its evidence passport (readings → signal quality → personal baseline → rule → source).
3. **Medical officer console** (`#/cmo`): triage, sign-off, follow-up tasks and the supplies left on board (no resupply from Earth).
4. **Timeline** (`#/timeline`): the real Curiosity radiation spike, the shelter days, Maya's sleep and mood, and cabin CO2, on one mission clock.
5. **Ground handoff**: the summary prepared for the 20-minute one-way delay.
6. **Ask Sol** (`#/assistant`): a local voice-and-text assistant. Ask "How am I doing today?", "Why does CO2 cause headaches?" or "Start a mood check". It answers only from Sol Check's cited NASA content and your own check-in, shows the source of every answer, and never diagnoses or recommends medicines.

## Why you can trust it

- **Tested on real astronaut data.** Sol Check's core idea is to compare each person with their own usual. We ran that method on the published blood counts of the four SpaceX Inspiration4 crew (NASA OSDR, study OSD-569). **None** of the 20 day-after-return values fell outside the lab's normal range, yet **4** were real changes from the crew member's own pre-flight baseline (immune-cell drops beyond the published reference change value), and all 4 were back to usual at the next visit. Sol Check also caught **2** entry errors in the published file instead of using them. See **Demo and data → Tested on real astronaut data**.
- **Every rule cites its source**: the orthostatic consensus definition, NASA's 3 mmHg CO2 limit, the ISS reaction-time thresholds, published biological variation and more. Demo-only thresholds are labelled as such.
- **Camera measurements are checked.** On test videos with a known pulse (82, 67 and 104 bpm at 24, 15 and 30 fps), Sol Check read each one exactly in about 15 seconds. A 5–10 person comparison with a fingertip pulse oximeter is set up and ready to run: [docs/validation](docs/validation/README.md).
- **It knows its limits.** Every screen says "not a diagnosis". Sol Check lists no medicines and never prescribes; treatment decisions stay with the medical officer and the flight surgeon. The Hazards page lists, for every risk, what still needs real flight hardware.

## Beyond Mars

The problem Sol Check solves (no doctor nearby, slow or no connection, people who must look after themselves) exists on Earth today:

- **Antarctic stations**, where winter crews cannot be evacuated for months;
- **submarines, research ships and offshore platforms**, with limited bandwidth and no clinic on board;
- **remote and rural clinics**, where a nurse or health worker sees patients and a doctor is hours away or only reachable by message;
- **disaster zones**, where networks are down.

Personal baselines, plain-language explanations, routing to the right person and a single complete handoff are as useful there as on Mars.

**Local impact (Egypt).** Our team is in Egypt. Remote communities in Sinai and the Western Desert oases, and workers on Red Sea offshore platforms, have the same pattern: patchy connectivity and long distances to a doctor. Sol Check runs on an ordinary phone with no account and no internet once installed, and no health data leaves the device. Team documentation is available in Arabic in `docs/`, and the plain-language layer (`src/content/plainLanguage.ts`) keeps every user-facing explanation in one place, ready for translation.

**Global connection.** Built on open NASA science (OSDR crew and radiation data), released under the MIT license, private by design and usable without internet, so any station, ship or clinic in the world can adopt it.

> 📖 **Team Architecture & Workflow Manual:** See [docs/TEAM_MISSION_ARCHITECTURE_AND_WORKFLOW.md](docs/TEAM_MISSION_ARCHITECTURE_AND_WORKFLOW.md) for the complete end-to-end system manual, clinical decision rules, directory catalog, and judging alignment.  
> 🔬 **Real Datasets & Citations Guide:** See [docs/real-datasets-and-citations.md](docs/real-datasets-and-citations.md) for the complete catalog of real NASA datasets, biological variation models, SHA-256 hashes, and peer-reviewed citations.  
> 🖨️ **Printable PDF Team Guide:** Open `http://localhost:4173/team-guide.html` in your browser and press `Cmd + P` / `Ctrl + P` to export a publication-grade PDF.

## Run the production demo

Use Node.js 22.12 or later.

```sh
npm ci
npm run build
npm run preview -- --host 127.0.0.1
```

Open the URL printed by Vite. Visit **Demo and data** and wait for **Ready to run offline** before disconnecting. The production service worker precaches the app, fonts, charts and RadLab CSV on first load. Keep the same browser and URL for the offline rehearsal. Check-ins and the selected scenario stay in local browser storage. External source links open their original sites.

Use `npm run dev` for hot reload during development. The service worker is enabled in the production build. The built `dist` directory can be served at a static site root or a subpath.

## Appendix A · Feature reference

Sol Check implements a research-informed, offline-first medical intelligence suite designed around NASA Human Research Program (HRP) spaceflight evidence:

1. **Cognitive Lab (`#/cognitive`)**:
   - Run a 3- or 6-trial check or a three-minute timed prototype. The timed mode uses the lapse and early-response thresholds published for the ISS study. [Jones et al., 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8919197/)
   - Results save by scenario, sol, and mode and appear in Trends, Assessment, and local medical handoffs. Three usable prior sols in the same mode establish a personal baseline within the 14-sol lookback window.

2. **NASA Five Hazards Matrix & Evidence Explorer (`#/hazards`)**:
   - **Reference IDs**: `SC-…` codes are Sol Check's own internal references. NASA does not publish risk codes in that form, so each hazard also names the current NASA HRP research element (Space Radiation; Human Factors and Behavioral Performance; Exploration Medical Capability; Human Health Countermeasures).
   - **Deep-Space Hazard Taxonomy**: Directly correlates crew vitals and behavioral observations to NASA's official Five Hazards of Human Spaceflight:
     1. **Space Radiation** (`#/hazards/radiation`, `SC-RAD-01`, HRP element: Space Radiation): Deep-space transit specification per NASA-STD-3001 (600 mSv universal career ceiling). Continuous CARN (Cosmic & Ambient Radiation Node) sensor streams per compartment, personalized room access and dynamic lockdown matrix based on individual permissible dose budgets, directional solar storm localization, automated turn-by-turn lowest-dose evacuation routing, 6-hour hysteresis recovery, and post-event lymphocyte assays. [Hazard 1 Specification](docs/hazard-1-space-radiation.md)
     2. **Isolation & Confinement** (`SC-BHP-01`, HRP element: HFBP): Compare sleep, mood, and vigilance, plan countermeasures, and open a later simulated sol at `#/hazards/isolation`. [Hazard 2 workflow](docs/hazard-2-isolation-and-confinement.md)
     3. **Distance from Earth** (`#/hazards/distance`, `SC-EXMC-01`, HRP element: ExMC): Explains the offline seven-reading, eight-symptom check-in, personal baselines and the simulated 20-minute one-way delay. Assessment provides a local draft for the Ground Flight Surgeon when the onboard officer requests ground review. [Hazard 3 & Contract v1 Specification](docs/hazard-3-distance-from-earth.md) · [Arabic Reference Contract](docs/مرجع-البعد-عن-الأرض-والمراقبة-الصحية-Sol-Check-Contract-v1.md)
     4. **Altered Gravity Fields** (`SC-HHC-01`, HRP element: HHC): Monitors orthostatic blood pressure variations, cardiovascular deconditioning, and vestibular changes.
     5. **Hostile Closed Environments** (`SC-ENV-01`, HRP element: HFBP habitability): Tracks habitat environmental stressors, air quality, acoustic fatigue, and sleep disruptions.
   - **Interactive Evidence Explorer**: Detailed spaceflight pathology, operational countermeasures, and live links to official NASA HRP Evidence Books.

3. **Medical Evidence Passport & Flight Surgeon Handoff Package (`#/assessment`)**:
   - **Autonomous Delay-Tolerant Handoff**: Formats all active clinical findings, 14-sol rolling baseline comparisons, and symptom logs into an exportable, standardized JSON (v1.0.0) package and a formatted Clinical Markdown Briefing.
   - **Cryptographic Traceability**: Generates a deterministic SHA checksum verifying package integrity across interplanetary transmission.
   - **Evidence-to-Action Chain**: Provides full explainability: Observation → Signal Quality → Baseline Comparison → HRP Decision Rule → Clinical Recommendation → Flight Surgeon Burst Uplink.

4. **3D Crew Digital Twin Host & 2D Body Map (F14)**:
   - **Team Blender astronaut**: a lazily loaded, self-hosted three.js viewport (separate chunk, precached offline) renders `assets/astronaut/astronaut_sol_check.glb`, imported directly with no copies, manifest or placeholder. Export checklist: [docs/3d-model-integration.md](docs/3d-model-integration.md).
   - **Orbit and framing**: mouse, touch and pen orbit with damping, pitch limits, no scroll hijacking, idle auto-rotation (off under reduced motion), double-click / **Reset view** easing, keyboard **Rotate left/right**, and camera framing computed from the model bounds.
   - **Six projected hotspots**: Head → Mood, Visor → Sleep, Chest → Heart rate (pulses at the latest heart rate), Torso → Temperature, Abdomen → Blood glucose, Limbs → Symptoms. Anchors come from Blender empties named `hotspot_<domain>`, with bounding-box fallbacks. The markers are real focusable `.figure-region-target` buttons that show status by icon, colour and label. A HUD pill shows the reading. Suit parts tagged `solcheck_domain` highlight and are clickable.
   - **Accessible fallbacks**: a `[ ✦ 3D model | ☷ 2D view ]` segmented toggle. The 2D SVG body map and the `.crew-figure-link` list provide the same six routes. The view switches to 2D automatically if WebGL is unavailable.

5. **Closed-Loop Mission Health Action Center (`#/assessment` & `#/cmo`)**:
   - An autonomous clinical task engine (`src/features/followups/followUpEngine.ts`) transforms findings and sensor warnings into structured, actionable crew follow-up tasks with state machine tracking (`open` → `acknowledged` → `in_progress` → `awaiting_measurement` → `awaiting_medical_review` → `resolved` / `escalated`) and a complete audit trail recording crew member actions, timestamps, and rationales.

6. **Interactive 6-Layer Health Evidence Passport (`src/features/assessment/EvidencePassport.tsx`)**:
   - For every autonomous finding, astronauts and flight surgeons can inspect 6 distinct traceable audit layers: (1) Raw Input Observations & Data Origins, (2) Signal Quality & Sensor Uncertainty Gates, (3) Rolling Median & MAD Spread, (4) Deterministic Decision Rule, (5) NASA HRP Five Hazards Evidence Book mapping, and (6) Closed-Loop Clinical Follow-Up Tasks.

7. **Crew Medical Officer (CMO) Console (`#/cmo`)**:
   - A dedicated clinical operational desk for the onboard medical officer with 5 tabs: Clinical Triage & Digital Sign-off, Action Center Queue, Supplies on board (non-drug stock and expiry; no resupply from Earth), Sensor & Data Quality, and Interplanetary Telemetry.

8. **Timeline Replay (F20)**:
   - Replay controls (Play, Pause, Restart, Step) allow user-controlled playback across the four-lane timeline (Crew readings, Mission events, Habitat air, Curiosity RAD radiation), advancing smoothly across mission sols to highlight the September 11, 2017 solar particle event at Sol 41. Preserves original units, archive dates, provenance, and unmeasured gaps.

9. **Measurement Reminders and Routine Checklist (F13)**:
   - Descriptive in-app reminders indicate whether the current sol check-in is pending or recorded, using simulated Gale Crater habitat mission time. An interactive routine checklist guides daily vital sign collection; checklist progress is scoped to the active scenario and sol, persisting locally and clearing upon demo reset.

10. **Local Record Export (F17)**:
   - Available under **Demo and data**, this feature exports the active scenario's check-in history into a structured, validated JSON file (`schemaVersion: 1`). The interface details exact record counts, sol ranges, and explicitly notes the inclusion of crew notes and seeded synthetic records before download.

12. **Ask Sol: local assistant with retrieval (`#/assistant`)**:
   - Retrieval-only (no language model): BM25 ranking over Sol Check's own sources, rules, measurement guides, action cards, glossary, five-hazard content, NASA datasets and supplies, plus the crew member's own readings and findings. Every answer lists its sources; anything outside that content gets "I only answer from…".
   - Safety rules run first: crisis words → talk to the crew medical officer or a crewmate now; emergency symptoms → tell the medical officer now; medicine, dose and diagnosis requests are declined.
   - A six-question mood conversation (the check-in's mood questions) with a plain summary and routing.
   - **Voice mode (hands-free):** tap **Talk to Sol**, allow the microphone, and just speak. A voice-activity detector notices when you start and stop talking; OpenAI's Whisper tiny model turns speech into text **on the device** (WebAssembly, in a background worker, loaded only from the app's own files); Sol answers out loud and listens again. A Mars globe drops in and spins while it listens. The ~60 MB voice model downloads once when voice is first used, then works offline. Say "stop" to finish; **Type instead** is always available. Code: `src/features/assistant/`, with tests.

11. **Real astronaut data (NASA OSDR OSD-569)**:
   - **Demo and data → Tested on real astronaut data** runs Sol Check's personal-baseline method on the Inspiration4 crew blood counts, with a data-quality gate, reference change values from published biological variation (Coskun et al. 2019), the untouched source CSV and its SHA-256. Re-import or verify with `node scripts/nasa/import-osdr-cbc.mjs --verify`.

## Appendix B · Crew-health gap coverage (team review)

Added after a teammate's review against NASA's human-spaceflight risks. Every rule is deterministic, explained in the evidence passport, and cites its source.

| Risk | What Sol Check now does | What still needs flight hardware |
| --- | --- | --- |
| Orthostatic intolerance | Optional **stand-up test** (seated vs 3 minutes standing). Flags a fall of ≥20 mmHg systolic or ≥10 diastolic, or a pulse rise of ≥30 bpm, and routes it to the Crew Medical Officer ([consensus definition](https://pubmed.ncbi.nlm.nih.gov/21431947/)) | Continuous ECG / tilt testing |
| Muscle atrophy and bone loss | Daily **exercise minutes**; flags below-target exercise on 3 of 5 sols as a countermeasure gap, not a muscle or bone measurement | Ultrasound, EMG, force sensors; DXA and blood/urine biomarkers |
| Dehydration | Daily **fluid intake**; flags low intake (demo minimum 2 L) | Urine and body-weight monitoring, core temperature |
| Space motion sickness | Vertigo, vomiting and balance symptoms; a two-symptom cluster rule; vomiting goes to the Crew Medical Officer | Eye-tracking camera and motion sensors (IMU) |
| SANS (fluid shift) | Vision-change and head-fullness symptoms; a vision change prompts an eye check | OCT, fundus imaging, eye ultrasound |
| CO2 exposure | **Habitat CO2 and cabin temperature** per sol (simulated life-support feed) on the dashboard and as a **Habitat air** lane on the Timeline with the limit line; headaches on sols at or above NASA's 3 mmHg limit are linked as context ([NASA OCHMO-TB-004](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf)) | Real ECLSS CO2/O2/humidity sensors |
| Breathing and recovery | **Camera breathing rate** from the same face pulse signal: three breathing effects on the pulse (baseline, strength, beat timing) are measured separately and a number is shown only when at least two agree ([Karlen et al. 2013](https://doi.org/10.1109/TBME.2013.2246160)). **Camera HRV (RMSSD)** from the SDK's clean beat intervals, compared only with the person's own 14-sol usual ([Shaffer & Ginsberg 2017](https://pubmed.ncbi.nlm.nih.gov/29034226/)). Both are optional and labelled camera estimates | ECG chest strap for clinical HRV; SpO2 needs a pulse oximeter (camera SpO2 is not reliable) |
| No resupply (distance from Earth) | The **Crew Medical Officer console** lists stock and expiry of non-drug supplies (food bars, drink pouches, urine test strips, eye-check kit). Assessment action cards cover observation, measurement and referral. Sol Check does not list, recommend or prescribe medicines | Barcode/RFID inventory |
| Menu fatigue and nutrition | Optional **food energy (kcal)** and **body mass**: low intake on 3 of 5 sols is a trend; weight 3% below your own usual is flagged and 5% goes to the Crew Medical Officer ([Zwart et al. 2014](https://pubmed.ncbi.nlm.nih.gov/25197887/)); poor appetite symptom. Thresholds are demo values | Metabolic blood biomarkers; body-composition scans |
| Kidney stones | A report of side or lower-back pain or blood in urine prompts onboard review and includes recent fluid logs. The optional exercise rule shows when short sessions coincide with lower food or fluid intake. [Pietrzyk et al. 2007](https://pubmed.ncbi.nlm.nih.gov/17511294/) | Urine/blood chemistry and ultrasound |
| Behavioral crisis far from Earth | "Feeling hopeless or unable to cope" routes straight to the Crew Medical Officer with a talk-now card, since a 40-minute round trip rules out live ground support ([NASA behavioral health risk](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-adverse-cognitive-or-behavioral-conditions-and-psychiatric-disorders)) | Validated psychological assessment by a clinician |

The Hazards page lists, for each hazard, what Sol Check tracks and what needs flight hardware. Engine version 1.6.0.

## Flight-console design system

Dark NASA flight-console palette (tokens in `src/ui/theme.css`, hex mirrors in `src/ui/tokens.ts`). Space Grotesk headings, Inter body text (16 px base) and JetBrains Mono numerals are bundled locally.

- **Contrast is computed, not assumed**: `src/ui/tokens.test.ts` checks every text and status token at ≥ 4.5:1 and control borders at ≥ 3:1 on all three surfaces. NASA Blue `#0B3D91` measures 1.7–2.0:1 on the dark surfaces, so it is used only as a fill behind light text (wordmark tile, top telemetry rule), never as text or a control boundary.
- **Status in three channels**: `STATUS_META` gives every domain status an icon, a label and a colour: Equal / No change detected, Triangle / Change from baseline, TrendingUpDown / Sustained trend, CircleDashed / Baseline not established, PencilLine / Check entry, Minus / Not measured.
- **Origin always visible**: `[Entered]`, `[Synthetic]`, `[NASA archive]` (pink `#FF7AD9`, reserved for Curiosity RAD) and `[Derived]` badges.
- **One primary action per view**: tabs and filters use a selected-state style instead of filled primary buttons. The only deliberate exception is the camera consent card, a focused sub-flow inside check-in.
- **Responsive shell**: labelled sidebar at 1024 px and wider, an icon-only 76 px rail from 768 to 1023 px, and a phone bottom bar (Dashboard, Assessment, centred Check-in, Timeline, More) below 768 px. Touch targets are at least 44 × 44 px, safe-area insets are honoured, and phone charts scroll sideways at a 480 px minimum width. Native iOS/Android plan: [docs/mobile-roadmap.md](docs/mobile-roadmap.md).
- **No NASA insignia, logotype or mission patches** appear in the app. NASA identity is expressed through colour, typography, telemetry framing and cited HRP content only.

## Optional Offline Camera Pulse Check (Phase 2)

An optional on-device optical pulse estimation tool is integrated beside manual heart-rate entry in the daily check-in form:

- **Optional and Non-Intrusive**: Manual heart-rate entry remains accessible and fully editable throughout.
- **Guided capture**: The face check coaches one instruction at a time (face in the oval, light, distance, stillness) and, when the signal stays weak, names the limiting factor (slow camera, face too small, too little light). It requests 30 fps and locks exposure and white balance where the device allows.
- **Informed Consent & Privacy First**: Requires an explicit, deliberate per-session consent action before requesting camera access. Camera requests are video-only (no audio).
- **Strictly On-Device Processing**: Powered by VitalCamera SDK (v0.6.9) with the bundled FacePhys rPPG model and BlazeFace detector. All neural network inference executes entirely on-device using local WebAssembly via self-hosted Google LiteRT and MediaPipe tasks-vision runtimes (`runtimeBaseUrls`). No video frames, face crops, or biometric signals are ever saved to disk or transmitted across the network.
- **100% Offline Precached**: All model weights (`.tflite`, `.gz`), worker scripts, and WebAssembly binaries (`.wasm`, `+esm`) are bundled locally under `public/vendor/` and precached in the service worker manifest for complete offline functionality on both root and static subpaths.
- **Volatile In-Memory Isolation by Default**: The estimated pulse reading exists strictly in volatile component state. It is never automatically persisted to `localStorage`, never recorded into stored check-in entries or personal baselines, and never included in exports, ground summary drafts, or automated escalation logic unless explicitly transferred by the user.
- **Real-Time Guidance & Motion Coaching**: An in-frame positioning reticle oval guides the crew member to center their face under steady lighting. Dynamic coaching hints ("Hold still", "Keep face within reticle", "Steady lighting") minimize motion artifacts and optical noise.
- **Explicit Provenance Transfer**: Once a stable estimate is obtained, the crew member can choose to click "Use N in my check-in" to copy the reading into the check-in input field. This action explicitly tags the field with optical provenance (`source: "camera_estimate"`, `verified: false`), maintaining clinical transparency.
- **Transparent States & Controls**: Provides explicit UI states for permission denied, camera unavailable, measuring, weak signal ("We couldn’t get a clear reading", with the most likely fix), and successful estimate. The result appears inside the face oval with its plain-language meaning and "Camera estimate, not a diagnosis". Users can click Stop, Cancel, or Done to immediately release all camera tracks and terminate SDK workers.

### Third-Party Software Attributions & Licenses

- **VitalCamera SDK**: Copyright (c) 2024-2025 Kegang Wang, CCNU. Licensed under the MIT License ([VitalCamera License](https://github.com/KegangWangCCNU/vitalcamera-sdk/blob/main/LICENSE)).
- **FacePhys / ContrastPhys / EfficientPhys Models**: Neural rPPG architectures trained on public contactless physiological benchmark datasets.
- **Google MediaPipe**: Copyright (c) 2023 Google LLC. Licensed under the Apache License 2.0.
- **Google LiteRT**: Copyright (c) 2024 Google LLC. Licensed under the Apache License 2.0.
- **OpenAI Whisper (tiny.en)**: speech recognition model, MIT License ([openai/whisper](https://github.com/openai/whisper)). Used through the ONNX conversion **Xenova/whisper-tiny.en**, Apache License 2.0 ([Hugging Face](https://huggingface.co/Xenova/whisper-tiny.en)), bundled under `public/vendor/whisper/` so voice works offline.
- **Transformers.js** (`@huggingface/transformers` 3.7.6): Apache License 2.0. **ONNX Runtime Web** (WebAssembly build bundled under `public/vendor/ort/`): MIT License.

## Rehearse the Sol 43 demo

1. Open **Dashboard → Start check-in**, select **Fill demo readings**, then **Save and assess**.
2. Open the sleep finding to inspect the readings and rule. The demo sleep value is 4.5 hours against a 7.5-hour baseline. Sleep and mood each qualify on four of the last five sols. The combined rule recommends Crew Medical Officer review.
3. Open **Hazards → Open Hazard 2**. Complete a vigilance check, save the countermeasure plan, and open the next simulated sol. **Trends → Vigilance** shows the earlier result after advancing.
4. Open **Assessment → Follow-up tasks and ground handoff** and select **Prepare summary for ground**. Inspect the local draft and the simulated 20-minute one-way delay. **Copy summary** copies the draft to the device clipboard.
5. Reload while offline to check the saved data. **Reset demo** clears local check-ins, vigilance, plans, and follow-up tasks and returns to Sol 43.

To run the alternate demos, open **Demo and data** and choose a scenario:

- **Routine sol** shows readings close to the personal baseline and a glucose reading with insufficient history for comparison.
- **Bad entry** loads a reversed blood pressure pair. Saving focuses the invalid field. Enter 116 for systolic, then save to complete the corrected check-in.

## Data and verification

```sh
npm test
node scripts/nasa/import-radlab.mjs --verify
node scripts/nasa/import-osdr-cbc.mjs --verify
node scripts/validate-camera.mjs docs/validation/bench-synthetic.csv
```

The bundled RadLab archive contains 1,220 Curiosity RAD readings from 4–17 September 2017. The chart shows 330 UTC hourly medians and preserves six missing hours as gaps. The 11 September solar particle event is replayed on Sol 41. The measured unit is absorbed dose rate in µGy/hour. The single-point event reading at 08:01:51 UTC is 15.384445 µGy/hour, and the raw peak reading is 23.182808 µGy/hour at 15:23:41 UTC. Raw readings and hourly medians are kept clearly labeled throughout. Its alignment with the synthetic crew history provides timeline context, with no inference about crew exposure or health effects. The original CSV, exact API query, archive timestamps and retrieval date are available in **Timeline**. To refresh the fixture during development, run `node scripts/nasa/import-radlab.mjs` with network access. [NASA RadLab instrument](https://visualization.osdr.nasa.gov/radlab/gui/knowledgebase/MSL-RAD-Surface) · [NASA JPL event report](https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/)

Rule deltas, routing and synthetic scenarios are demo heuristics. The dashboard photo shows Gale Crater as seen by Curiosity. [Photo credit: NASA/JPL-Caltech/MSSS](https://science.nasa.gov/photojournal/curiosity-looks-downslope-from-the-sulfate-unit/)

## Team

NASA Space Apps Challenge 2026 · *Create Health Monitoring Software for Astronauts on Space Missions*.
Team: Ahmed Shacker, Ahmed Sherif, Andrew Sameh, David Michael, Hassan Mohsen, Ziad AbdElhaleem. Coach: Mariam Mohamed. Local Lead: Dr. Moatasem Mahran.

See the [build plan](docs/build-plan.md) and [source review](docs/source-review.md) for acceptance checks and evidence limits. OpenAI Codex assisted with initial P0 implementation; Google DeepMind Gemini / Antigravity designed and verified P1 features, offline WebAssembly camera integration, and automated CDP test suites.
