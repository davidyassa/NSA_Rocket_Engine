# Sol Check

Sol Check is a research-informed prototype for one synthetic crew member on a Mars surface mission. Not a diagnosis.

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
   - **Deep-Space Hazard Taxonomy**: Directly correlates crew vitals and behavioral observations to NASA's official Five Hazards of Human Spaceflight:
     1. **Space Radiation** (`HRP-RAD-01`): Correlated with Gale Crater MSL Curiosity RAD surface observations and solar particle events.
     2. **Isolation & Confinement** (`HRP-BHP-01`): Tracks behavioral shifts, mood degradation, and psychomotor vigilance lapses.
     3. **Distance from Earth** (`HRP-EXMC-01`): Manages autonomous medical care under 20-minute one-way communication latency.
     4. **Altered Gravity Fields** (`HRP-HHC-01`): Monitors orthostatic blood pressure variations, cardiovascular deconditioning, and vestibular changes.
     5. **Hostile Closed Environments** (`HRP-SHFH-01`): Tracks habitat environmental stressors, air quality, acoustic fatigue, and sleep disruptions.
   - **Interactive Evidence Explorer**: Detailed spaceflight pathology, operational countermeasures, and live links to official NASA HRP Evidence Books.

3. **Medical Evidence Passport & Flight Surgeon Handoff Package (`#/assessment`)**:
   - **Autonomous Delay-Tolerant Handoff**: Formats all active clinical findings, 14-sol rolling baseline comparisons, and symptom logs into an exportable, standardized JSON (v1.0.0) package and a formatted Clinical Markdown Briefing.
   - **Cryptographic Traceability**: Generates a deterministic SHA checksum verifying package integrity across interplanetary transmission.
   - **Evidence-to-Action Chain**: Provides full explainability: Observation → Signal Quality → Baseline Comparison → HRP Decision Rule → Clinical Recommendation → Flight Surgeon Burst Uplink.

4. **Interactive 2D Body Figure (F14)**:
   - An anatomical crew figure on the dashboard provides an alternative, keyboard-accessible navigation path to health domain details (Head → Mood, Visor → Sleep, Chest → Heart Rate, Torso → Temperature, Abdomen → Blood Glucose, Limbs → Systemic Symptoms). Controls feature visible focus, readable names, and text status labels that operate independently of color. All six domain cards remain fully interactive and usable on mobile.

5. **Timeline Replay (F20)**:
   - Replay controls (Play, Pause, Restart, Step) allow user-controlled playback across the three-lane timeline (Crew Vitals, Mission Events, Curiosity RAD Radiation), advancing smoothly across mission sols to highlight the September 11, 2017 solar particle event at Sol 41. Preserves original units, archive dates, provenance, and unmeasured gaps.

6. **Measurement Reminders and Routine Checklist (F13)**:
   - Descriptive in-app reminders indicate whether the current sol check-in is pending or recorded, using simulated Gale Crater habitat mission time. An interactive routine checklist guides daily vital sign collection; checklist progress is scoped to the active scenario and sol, persisting locally and clearing upon demo reset.

7. **Local Record Export (F17)**:
   - Available under **Demo and data**, this feature exports the active scenario's check-in history into a structured, validated JSON file (`schemaVersion: 1`). The interface details exact record counts, sol ranges, and explicitly notes the inclusion of crew notes and seeded synthetic records before download.

8. **Check-in Streak (F15)**:
   - A consecutive-sol check-in counter is integrated into the dashboard mission metrics. The counter tallies each sol once, breaks sequence at any missing sol, maintains scenario isolation, and clearly identifies seeded synthetic history versus user-entered contributions.

## Optional Offline Camera Pulse Check (Phase 2)

An optional on-device optical pulse estimation tool is integrated beside manual heart-rate entry in the daily check-in form:

- **Optional and Non-Intrusive**: Manual heart-rate entry remains accessible and fully editable throughout.
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

1. Open **Dashboard → Start check-in**. Open the blood pressure measurement guide, select **Fill demo readings**, mark **Fatigue**, and select **Save and assess**.
2. Open **Why this finding?** under the sleep finding. Inspect the five readings, personal baseline, rule and sources. The sleep and mood readings each meet the demo delta on four of the last five sols. The suggested route is Crew Medical Officer.
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

See the [build plan](docs/build-plan.md) and [source review](docs/source-review.md) for acceptance checks and evidence limits. OpenAI Codex assisted with initial P0 implementation; Google DeepMind Gemini / Antigravity designed and verified P1 features, offline WebAssembly camera integration, and automated CDP test suites.
