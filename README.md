# Sol Check

Sol Check is a research-informed prototype for one synthetic crew member on a Mars surface mission. Not a diagnosis.

> 📖 **Team Architecture & Workflow Manual:** See [docs/TEAM_MISSION_ARCHITECTURE_AND_WORKFLOW.md](docs/TEAM_MISSION_ARCHITECTURE_AND_WORKFLOW.md) for the complete end-to-end system manual, clinical decision rules, directory catalog, and judging alignment.  
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

## Core Clinical & Spaceflight Capabilities

Sol Check implements a research-informed, offline-first medical intelligence suite designed around NASA Human Research Program (HRP) spaceflight evidence:

1. **Cognitive Performance Laboratory (`#/cognitive`)**:
   - **ISS PVT-B Sustained Attention Test**: Implements the 3-minute Brief Psychomotor Vigilance Task (PVT-B), developed by Dr. David F. Dinges and deployed aboard the International Space Station by the NASA HRP Behavioral Health & Performance (BHP) element.
   - **Microsecond Precision Reaction Timing**: Measures sustained attention, psychomotor speed, and vigilance under conditions of sleep loss, fatigue, and circadian desynchrony.
   - **Clinical Metrics**: Calculates Mean Reaction Time (RT), Median RT, Lapses (>500 ms), False Starts (<100 ms), Fastest 10% RT (optimum vigilance), Slowest 10% RT, and a calibrated Vigilance Score (0–100).
   - **NASA HRP Clinical Categorization**: Categorizes performance (Optimal, Mild Slowing, Clinically Significant Psychomotor Fatigue, or Excessive False Starts) with direct reference to ISS flight thresholds and fatigue countermeasures (caffeine, sleep hygiene, duty rest scheduling).

2. **NASA Five Hazards Matrix & Evidence Explorer (`#/hazards`)**:
   - **Reference IDs**: `SC-…` codes are Sol Check's own internal references. NASA does not publish risk codes in that form, so each hazard also names the current NASA HRP research element (Space Radiation; Human Factors and Behavioral Performance; Exploration Medical Capability; Human Health Countermeasures).
   - **Deep-Space Hazard Taxonomy**: Directly correlates crew vitals and behavioral observations to NASA's official Five Hazards of Human Spaceflight:
     1. **Space Radiation** (`SC-RAD-01`, HRP element: Space Radiation): Correlated with Gale Crater MSL Curiosity RAD surface observations and solar particle events.
     2. **Isolation & Confinement** (`SC-BHP-01`, HRP element: HFBP): Tracks behavioral shifts, mood degradation, and psychomotor vigilance lapses.
     3. **Distance from Earth** (`SC-EXMC-01`, HRP element: ExMC): Manages autonomous medical care under 20-minute one-way communication latency.
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
   - A dedicated clinical operational desk for the onboard medical officer with 4 specialized tabs: Clinical Triage & Digital Sign-off, Action Center Queue, Sensor & Data Quality, and Interplanetary Telemetry.

8. **Timeline Replay (F20)**:
   - Replay controls (Play, Pause, Restart, Step) allow user-controlled playback across the three-lane timeline (Crew Vitals, Mission Events, Curiosity RAD Radiation), advancing smoothly across mission sols to highlight the September 11, 2017 solar particle event at Sol 41. Preserves original units, archive dates, provenance, and unmeasured gaps.

9. **Measurement Reminders and Routine Checklist (F13)**:
   - Descriptive in-app reminders indicate whether the current sol check-in is pending or recorded, using simulated Gale Crater habitat mission time. An interactive routine checklist guides daily vital sign collection; checklist progress is scoped to the active scenario and sol, persisting locally and clearing upon demo reset.

10. **Local Record Export (F17)**:
   - Available under **Demo and data**, this feature exports the active scenario's check-in history into a structured, validated JSON file (`schemaVersion: 1`). The interface details exact record counts, sol ranges, and explicitly notes the inclusion of crew notes and seeded synthetic records before download.

11. **Check-in Streak (F15)**:
   - A consecutive-sol check-in counter is integrated into the dashboard mission metrics. The counter tallies each sol once, breaks sequence at any missing sol, maintains scenario isolation, and clearly identifies seeded synthetic history versus user-entered contributions.

## Crew-health gap coverage (team review)

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
| No resupply (distance from Earth) | **Medical-kit inventory** (synthetic): every suggestion lists the kit items it needs with stock and expiry, and flags expired, low or radiation-exposed medicines after the Sol 41 solar storm ([Du et al. 2011](https://doi.org/10.1208/s12248-011-9270-0)). A full kit table sits on the Crew Medical Officer page. No dosing advice | Barcode/RFID inventory; laboratory potency testing |
| Menu fatigue and nutrition | Optional **food energy (kcal)** and **body mass**: low intake on 3 of 5 sols is a trend; weight 3% below your own usual is flagged and 5% goes to the Crew Medical Officer ([Zwart et al. 2014](https://pubmed.ncbi.nlm.nih.gov/25197887/)); poor appetite symptom. Thresholds are demo values | Metabolic blood biomarkers; body-composition scans |
| Kidney stones | Side/back pain or blood in urine goes to the Crew Medical Officer the same day, naming recent low fluid ([Pietrzyk et al. 2007](https://pubmed.ncbi.nlm.nih.gov/17511294/)). A **risk-multiplier** rule links short exercise with low food or water (bone loss + stones) | Urine/blood chemistry and ultrasound |
| Behavioral crisis far from Earth | "Feeling hopeless or unable to cope" routes straight to the Crew Medical Officer with a talk-now card, since a 40-minute round trip rules out live ground support ([NASA behavioral health risk](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-adverse-cognitive-or-behavioral-conditions-and-psychiatric-disorders)) | Validated psychological assessment by a clinician |

The Hazards page lists, for each hazard, what Sol Check tracks and what needs flight hardware. Engine version 1.4.0.

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
- **Explicit Provenance Transfer**: Once a stable estimate is obtained, the crew member can choose to click "Use as check-in heart rate" to copy the reading into the check-in input field. This action explicitly tags the field with optical provenance (`source: "camera_estimate"`, `verified: false`), maintaining clinical transparency.
- **Transparent States & Controls**: Provides explicit UI states for permission denied, camera unavailable, measuring, weak signal ("Signal too weak"), and successful estimate. Displays successful readings as "Estimated heart rate: X bpm" accompanied by "Not a diagnosis". Users can click Stop, Cancel, or Done to immediately release all camera tracks and terminate SDK workers.

### Third-Party Software Attributions & Licenses

- **VitalCamera SDK**: Copyright (c) 2024-2025 Kegang Wang, CCNU. Licensed under the MIT License ([VitalCamera License](https://github.com/KegangWangCCNU/vitalcamera-sdk/blob/main/LICENSE)).
- **FacePhys / ContrastPhys / EfficientPhys Models**: Neural rPPG architectures trained on public contactless physiological benchmark datasets.
- **Google MediaPipe**: Copyright (c) 2023 Google LLC. Licensed under the Apache License 2.0.
- **Google LiteRT**: Copyright (c) 2024 Google LLC. Licensed under the Apache License 2.0.

## Rehearse the Sol 43 demo

1. Open **Dashboard → Start check-in**. The check-in is one page per measurement (heart rate by hand or camera, blood pressure, temperature, blood sugar, sleep, mood, how you feel) with **Next**, **Skip** and **Back**. Select **Fill demo readings** to jump to **Review & save**, use **Edit** on *How you feel* to tick **Fatigue**, then select **Save and assess**.
2. Open **Why this finding?** under the sleep finding. Inspect the five readings, personal baseline, rule and sources. The sleep and mood readings each meet the demo delta on three of the last five sols. The suggested route is Crew Medical Officer.
3. Select **Prepare summary for ground**. Inspect the local draft, the simulated 20-minute one-way delay and the 40-minute earliest possible reply. **Copy summary** copies the draft to the local clipboard. Notes are opt-in.
4. In **Trends**, inspect the sleep baseline, then choose another indicator. In **Timeline**, select **Sol 41** and open **NASA archive provenance**. Confirm the original UTC date, instrument, units and coverage.
5. Reload while offline and confirm the saved check-in is still available. **Reset demo** clears local check-ins across the three scenarios and restores the original Sol 43 scenario.

To run the alternate demos, open **Demo and data** and choose a scenario:

- **Routine sol** shows readings close to the personal baseline and a glucose reading with insufficient history for comparison.
- **Bad entry** loads a reversed blood pressure pair. Saving focuses the invalid field. Enter 116 for systolic, then save to complete the corrected check-in.

## Data and verification

```sh
npm test
node scripts/nasa/import-radlab.mjs --verify
```

The bundled RadLab archive contains 1,220 Curiosity RAD readings from 4–17 September 2017. The chart shows 330 UTC hourly medians and preserves six missing hours as gaps. The 11 September solar particle event is replayed on Sol 41. The measured unit is absorbed dose rate in µGy/hour. The single-point event reading at 08:01:51 UTC is 15.384445 µGy/hour, and the raw peak reading is 23.182808 µGy/hour at 15:23:41 UTC. Raw readings and hourly medians are kept clearly labeled throughout. Its alignment with the synthetic crew history provides timeline context, with no inference about crew exposure or health effects. The original CSV, exact API query, archive timestamps and retrieval date are available in **Timeline**. To refresh the fixture during development, run `node scripts/nasa/import-radlab.mjs` with network access. [NASA RadLab instrument](https://visualization.osdr.nasa.gov/radlab/gui/knowledgebase/MSL-RAD-Surface) · [NASA JPL event report](https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/)

Rule deltas, routing and synthetic scenarios are demo heuristics. The dashboard photo shows Gale Crater as seen by Curiosity. [Photo credit: NASA/JPL-Caltech/MSSS](https://science.nasa.gov/photojournal/curiosity-looks-downslope-from-the-sulfate-unit/)

## Team

NASA Space Apps Challenge 2026 · *Create Health Monitoring Software for Astronauts on Space Missions*.
Team: Ahmed Shacker, Ahmed Sherif, Andrew Sameh, David Michael, Hassan Mohsen, Ziad AbdElhaleem. Coach: Mariam Mohamed. Local Lead: Dr. Moatasem Mahran.

See the [build plan](docs/build-plan.md) and [source review](docs/source-review.md) for acceptance checks and evidence limits. OpenAI Codex assisted with initial P0 implementation; Google DeepMind Gemini / Antigravity designed and verified P1 features, offline WebAssembly camera integration, and automated CDP test suites.
