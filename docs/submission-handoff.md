# Sol Check — Submission Handoff & Judging Guide

## 1. Project & Challenge Summary
* **Project Name:** Sol Check
* **Challenge:** 2026 NASA Space Apps Challenge — *Create Health Monitoring Software for Astronauts on Space Missions*
* **Architecture:** 100% client-side, offline-first static web application built with React 19, TypeScript, Vite, Tailwind CSS, Hash Routing, Zustand, Zod, Recharts, and Workbox Service Worker (`vite-plugin-pwa`).
* **Design Premise:** A synthetic Mars crew member on Sol 43 monitors vitals, behavioral indicators, and symptoms following a major solar particle storm. Because deep-space communication with Earth involves a 20-minute one-way delay (40-minute round trip), the software empowers autonomous, local health evaluation with full clinical evidence transparency.

---

## 2. NASA Source Verification & Eligibility Status
* **Challenge Resources Page:** `https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources`
* **Organizer Source Requirement Discussion:** `https://github.com/nasa/spaceapps/discussions/1827`
* **Current Status:** The Resources tab on the 2026 challenge page currently displays a placeholder prior to the hackathon window. The Global Awards source requirement is therefore marked **MANUAL PENDING** until the official list is finalized by organizers.
* **Verified NASA Data Source:**
  * **Repository:** NASA Open Science Data Repository (OSDR) RadLab (`https://visualization.osdr.nasa.gov/radlab/gui/`)
  * **Instrument:** Mars Science Laboratory (MSL) Curiosity Rover Radiation Assessment Detector (`MSL-RAD-Surface`).
  * **Dataset Period:** 4–17 September 2017 solar particle event (1,220 raw surface observations, 330 hourly medians, 6 missing hours).
  * **Event Anchors (Sol 41):**
    * Single-point event reading: `15.384445 µGy/hour` at `2017-09-11 08:01:51 UTC` (raw).
    * Raw peak reading: `23.182808 µGy/hour` at `2017-09-11 15:23:41 UTC` (raw).
    * Hourly medians range: `8.03–21.82 µGy/hour` on Sol 41.
  * **Where Sol Check Uses It:**
    * Bundled in `src/data/nasa/radlab-fixture.json` and `src/data/nasa/msl-rad-surface-2017-09.csv`.
    * Displayed in Lane 3 of the aligned Mission Timeline (`#/timeline`).
    * Full metadata, citation, and direct CSV download available in the NASA archive provenance modal.
    * Correlated with the Sol 41 crew shelter event via the explainable `archive-replay-context` rule.

---

## 3. Explainable Clinical Logic & Personal Baselines
* **Rolling Median Baseline:**
  * Personal baselines are computed as a **rolling median** over the prior 14 sols (requiring at least 5 distinct measured sols).
  * Deviations are compared against metric-specific demo deltas: heart rate (8 bpm), systolic BP (10 mmHg), diastolic BP (8 mmHg), body temp (0.4 °C), blood glucose (12 mg/dL), sleep duration (1.0 h), and mood (1.0 point).
* **Explainable Demo Rule IDs (`src/engine/rules.ts`):**
  1. `entry-quality`: Validates physiological ranges and enforces relational rules (e.g., systolic pressure must strictly exceed diastolic pressure).
  2. `combined-sleep-mood`: Escalates recommendation to Crew Medical Officer (CMO) when both sleep duration and mood demonstrate sustained lower trends.
  3. `sustained-trend`: Flags repeat changes in the same direction over the 5-sol comparison window (requiring 3+ qualifying readings).
  4. `baseline-change`: Highlights an individual sol reading differing from the rolling median baseline by at least the demo delta.
  5. `reported-symptoms`: Records current symptoms (e.g. Fatigue) and detects recurring symptoms across the lookback window.
  6. `archive-replay-context`: Contextual association linking lower sleep/mood during shelter protocol with the aligned Curiosity RAD radiation event.
  7. `data-unavailable`: Discloses unmeasured metrics or insufficient history (< 5 sols) preventing baseline calculation.
* **3D Crew Digital Twin Host & 2D Crew Figure (`src/features/dashboard/CrewBody3D.tsx`, `twin/`, `CrewBodyFigure.tsx`):**
  * **Team Blender astronaut:** lazily loaded, self-hosted three.js viewport (own chunk, precached offline) rendering `assets/astronaut/astronaut_sol_check.glb`, imported directly. Export checklist: `docs/3d-model-integration.md`.
  * **Orbit, framing, hotspots:** damped orbit with pitch limits and no scroll hijacking, idle auto-rotation (off under reduced motion), double-click / Reset view, keyboard Rotate left/right, bounds-based camera framing, and six projected `.figure-region-target` buttons with icon + colour + label status. The chest marker pulses at the latest heart rate.
  * **Toggleable View:** `[ ✦ 3D model ]` (default) and `[ ☷ 2D view ]` segmented toggle. The view falls back to 2D automatically without WebGL.
  * **Anatomical Hotspots & Routing:**
    * **Head (shortcut `"Head"`):** Navigates to `#/trends?metric=mood` (Behavioral health).
    * **Visor (shortcut `"Visor"`):** Navigates to `#/trends?metric=sleep_duration` (Sleep).
    * **Chest (shortcut `"Chest"`):** Navigates to `#/trends?metric=heart_rate` (Cardiovascular, pulsating node).
    * **Torso (shortcut `"Torso"`):** Navigates to `#/trends?metric=body_temp` (Temperature).
    * **Abdomen (shortcut `"Abdomen"`):** Navigates to `#/trends?metric=blood_glucose` (Metabolic).
    * **Limbs (shortcut `"Limbs"`):** Navigates to `#/assessment` (Reported systemic symptoms).
  * **Accessibility:** 6 invisible DOM target buttons ensure 100% screen reader accessibility and CDP automated test compliance.

---

## 3b. Advanced Clinical Intelligence & Mission Safety Features
* **Closed-Loop Mission Health Action Center (`#/assessment` & `#/cmo`):**
  * Autonomous task engine (`src/features/followups/followUpEngine.ts`) transforms findings and sensor warnings into actionable crew follow-up items with clinical state tracking (`open` → `acknowledged` → `in_progress` → `awaiting_measurement` → `awaiting_medical_review` → `resolved` / `escalated`).
  * Features a full audit trail recording timestamps, responsible crew member, and clinical rationales.
* **Interactive 6-Layer Health Evidence Passport (`src/features/assessment/EvidencePassport.tsx`):**
  * For every autonomous finding, astronauts and flight surgeons can inspect 6 distinct traceable audit layers: (1) Raw Input Observations, (2) Signal Quality & Sensor Uncertainty Gates, (3) Rolling Median & MAD Spread, (4) Deterministic Decision Rule, (5) NASA HRP Five Hazards Evidence Book mapping, and (6) Closed-Loop Follow-Up Actions.
* **Crew Medical Officer (CMO) Clinical Desk (`#/cmo`):**
  * Dedicated high-level operational console for the onboard medical officer with 4 tabs: Clinical Triage & Digital Sign-off, Action Center Queue, Sensor & Data Quality, and Interplanetary Telemetry.
* **Cognitive Performance Laboratory (`#/cognitive`):**
  * Implements the **Brief Psychomotor Vigilance Task (PVT-B)** deployed aboard the ISS by the NASA Human Research Program (HRP) Behavioral Health & Performance (BHP) element.
  * Measures sustained attention, reaction speed, vigilance lapses (>500 ms), and false starts (<100 ms).
  * Evaluates clinical psychomotor slowing against NASA fatigue thresholds and provides recommended countermeasures (sleep hygiene, rest duty cycle).
* **NASA Five Hazards Matrix & Evidence Explorer (`#/hazards`):**
  * Explicitly maps Sol Check metrics to the Five Hazards of Human Spaceflight: Space Radiation (`SC-RAD-01`, HRP element: Space Radiation), Isolation & Confinement (`SC-BHP-01`, HRP element: HFBP), Distance from Earth (`SC-EXMC-01`, HRP element: ExMC), Altered Gravity (`SC-HHC-01`, HRP element: HHC), and Hostile Closed Environments (`SC-ENV-01`, HRP element: HFBP habitability).
  * Links directly to NASA HRP Evidence Books and maps Sol 43 mission indicators to verified spaceflight countermeasures.
* **Exploration Medical Handoff Package & Change Detection (`#/assessment`):**
  * Creates a validated JSON (v1.1.0) medical handoff payload and clinical Markdown briefing package for the Flight Surgeon with deterministic FNV-1a-32 change-detection verification for delay-tolerant interplanetary transmission.
  * Interactive round-trip rehearsal simulator (`HandoffSimulator.tsx`) with two-sided file verification.

---

## 4. Team, AI-Use & Development Credits
**Team:** Ahmed Shacker, Ahmed Sherif, Andrew Sameh, David Michael, Hassan Mohsen, Ziad AbdElhaleem. **Coach:** Mariam Mohamed. **Local Lead:** Dr. Moatasem Mahran. The 3D astronaut model is authored by the team in Blender.

Sol Check was developed transparently using human-guided AI pair programming:
* **OpenAI Codex:** Provided the initial project scaffolding, foundational P0 offline contracts, state stores, Vite PWA configuration, NASA RadLab fixture processing, baseline logic, and initial UI layouts.
* **Google DeepMind Gemini / Antigravity:** Designed and implemented all P1 capabilities (F14 interactive 2D body figure, F20 timeline replay with Sol 41 archive event, F13 reminders & checklist, F17 local JSON export, F15 check-in streak), Phase 2 Vital Camera SDK integration with self-hosted LiteRT/MediaPipe WebAssembly runtimes, precache optimization, subpath URL resolution, and automated offline CDP verification testing.
* **Anthropic Claude:** Flight-console design system and token migration with computed WCAG contrast tests, three-channel status and origin badges, responsive rail and bottom navigation, the three.js host for the team's 3D model (orbit, framing, projected hotspots, fallbacks), structured measurement guides, and relabelling hazard IDs as internal `SC-` references mapped to NASA HRP elements.
* **Deterministic Medical Assessment:** All medical rules, baselines, and escalation tiers are deterministic, transparent TypeScript heuristics without ungrounded LLM inference.

---

## 5. Third-Party Licenses for Bundled Vendor Assets
All bundled runtime models and libraries in `public/vendor/` are self-hosted with complete offline licenses:
1. **VitalCamera SDK:** MIT License with Privacy Protection Addendum (Copyright 2025 Kegang Wang). Enforces strictly local on-device inference and prohibits external transmission of biometric feeds.
2. **MediaPipe Tasks-Vision:** Apache 2.0 License (Google LLC). BlazeFace face detection.
3. **LiteRT WebAssembly Runtime:** Apache 2.0 License (The TensorFlow Authors / Google). Local neural network WASM engine.
4. **three.js:** MIT License (three.js authors). Bundled locally for the 3D model host.
5. **Fonts:** Inter, Space Grotesk and JetBrains Mono (SIL Open Font License 1.1), bundled via Fontsource.
6. **FacePhys Models:** MIT License with Privacy Addendum (`model.tflite`, `proj.tflite`, `sqi_model.tflite`, `psd_model.tflite`, `state.gz`, `blaze_face_short_range.tflite`).
7. **Notice Files:** Maintained in [public/vendor/LICENSE](file:///Users/ahmedelazab/Desktop/Nasa%20Rocket%20Engine/public/vendor/LICENSE) and [public/vendor/NOTICE](file:///Users/ahmedelazab/Desktop/Nasa%20Rocket%20Engine/public/vendor/NOTICE).

---

## 6. One-Page Live Demo Runbook (with Manual Fallback)

### Step 1: Pre-Demo Startup (Online for 10 seconds to prime cache)
```bash
npm run build
npx vite preview --port 4173
```
1. Open Google Chrome to `http://localhost:4173/`.
2. Navigate to **Demo and data** (`#/demo`).
3. Confirm the status pill displays **"Ready to run offline"**.

### Step 2: Cut Connection (Prove 100% Offline Capability)
1. Turn off laptop Wi-Fi / disconnect Ethernet.
2. *(Optional proof)* Stop the preview server process (`Ctrl+C`).
3. Reload the browser tab. Sol Check reloads instantly from the Service Worker cache.

### Step 3: Core Crew Flow Stopwatch Rehearsal (< 90 seconds)
1. **Dashboard (`#/`):**
   * Point out the **42 sols check-in streak** (with "Seeded synthetic" transparency tag).
   * Note the **Sol 43 check-in due reminder** and toggle an item in the **Measurement checklist**.
   * Click the **Chest** on the **Interactive 2D crew figure** to jump to the Cardiovascular trend view (`#/trends?metric=heart_rate`).
2. **Daily Check-In (`#/check-in`):**
   * Click **"Fill demo readings"** to populate the real Sol 43 seed values from code:
     * **Heart rate:** `68 bpm`
     * **Blood pressure:** `116 / 74 mmHg`
     * **Body temperature:** `36.7 °C`
     * **Blood glucose:** `94 mg/dL`
     * **Sleep duration:** `4.5 h`
     * **Mood:** `2 / 5`
   * Check the **"Fatigue"** symptom checkbox.
   * *(Camera option)* If demonstrating camera pulse check, see Section 7 below. Otherwise, use manual check-in as the primary dependable demo.
   * Click **"Save and assess"**.
3. **Autonomous Risk Assessment (`#/assessment`):**
   * Review the 5 generated findings.
   * Expand **"Why this finding?"** on the combined sleep/mood trend to display explainable demo rule `combined-sleep-mood` and evidence.
   * Under **Flight Surgeon Medical Handoff Package**, point out the cryptographic SHA checksum and click **"Download Handoff Package (JSON)"** or **"Download Clinical Briefing (MD)"** to demonstrate delay-tolerant interplanetary telemetry packaging.
   * Click **"Prepare summary for ground"** under Earth communication to display the simulated 20-minute one-way delay (40-minute round trip) countdown and draft message for the Flight Surgeon.
4. **Cognitive Lab (`#/cognitive`) & NASA Hazards (`#/hazards`):**
   * Open **Cognitive Lab** (`#/cognitive`) and run a quick 3-trial Psychomotor Vigilance Task (PVT-B) to demonstrate sub-millisecond reaction-time logging and NASA HRP fatigue categorization.
   * Open **NASA Hazards** (`#/hazards`) to showcase the direct mapping from Sol 43 indicators to NASA HRP Risk Evidence Books across all 5 human spaceflight hazards.
5. **Mission Timeline (`#/timeline`):**
   * Show the 3-lane aligned mission timeline (Crew Vitals, Mission Events, Curiosity Radiation).
   * Click **"Restart"** replay or select **Sol 41** under **"Inspect sol"** to show the solar particle event.
   * Highlight Curiosity's raw event readings (`15.38 µGy/hour` event reading at 08:01 UTC, `23.18 µGy/hour` peak at 15:23 UTC) and the hourly medians range (`8.03–21.82 µGy/hour`).
   * Expand **Hourly archive readings for Sol 41** and **NASA archive provenance**.
5. **Demo Reset:**
   * Click **"Reset demo"** in the top navigation, confirm **"Reset demo"** in the dialog to restore Sol 43 baseline state.

---

## 7. Optional Camera Pulse Check Demonstration & Fallback Policy
* **Posture:** The Camera pulse check is strictly an **experimental, view-only on-device estimate**.
* **Live Test Steps:**
  1. On `#/check-in`, click **"📷 Camera pulse check (optional)"**.
  2. Read the consent disclosures (strictly on-device WebAssembly processing, volatile memory only, no cloud transmission).
  3. Click **"I consent · Start camera"**.
  4. Position face within the frame under steady, even lighting.
  5. The video stream will detect the face and analyze optical pulse variations.
  6. Click **"Stop"** to finish.
  7. Notice that the estimate is labeled **"Not a diagnosis"** and **never alters the manual input field, saved medical records, personal baselines, or clinical risk assessment**.
* **Manual Fallback Rule:** If lighting conditions or camera drivers in the judging room produce a "Signal too weak" reading, click **"Close"** or **"Cancel"** and use the manual check-in field. State clearly to judges: *"The camera pulse check is an experimental opt-in tool running 100% on-device WebAssembly inference; clinical check-in retains manual sensor entry to guarantee dependability."*
* **Manual Acceptance Status:**
  * Real-camera hardware scan with live subject: **MANUAL PENDING** (perform on judging laptop).
  * Reference pulse sensor comparison: **MANUAL PENDING** (perform if pulse oximeter hardware is available).
  * First-time participant elapsed time: **MANUAL PENDING** (time live rehearsal with stopwatch).
