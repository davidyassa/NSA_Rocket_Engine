<context>
Run this in Claude Code with Claude Opus 5.5 and High effort selected. Work in /Users/ahmedelazab/Desktop/Nasa Rocket Engine.

Sol Check is a React, TypeScript, Vite, Zustand, Zod, Recharts, Three.js and Workbox app for the NASA Space Apps astronaut health monitoring challenge. It is a static offline-first prototype using a synthetic Mars crew profile, personal baselines, deterministic findings, a local Earth handoff and a bundled Curiosity RAD archive. The latest workspace passed 114 tests and type checking before this task. Run your own baseline checks. The worktree already contains substantial tracked and untracked changes. Inspect and preserve them.

Read README.md, docs/build-plan.md, docs/source-review.md, docs/submission-handoff.md, docs/3d-model-integration.md, package.json, vite.config.ts and the modules touched by your work. The app already has a 2D body map, a 3D crew viewer, check-in reminders, export, timeline replay, a cognitive lab, a hazards explorer, an evidence passport, CMO and follow-up workflows, a local delay rehearsal and Vital Camera SDK with FacePhys. Trace each feature from its normal route through state, storage and export before deciding what needs implementation. Treat claims in the two research lists, existing README and prior reports as leads to verify.
</context>

<objective>
Build the strongest complete judging release of Sol Check. Review every reference below and use the best applicable ideas to strengthen measurement trust, crew follow-up, offline handoff and the live demo. Implement missing behavior, repair regressions and verify the resulting app. The main demo should let a judge start with a recorded observation, see exactly how it became a finding, record a crew action, prepare an offline handoff and inspect the original Mars archive evidence. Keep experimental measurements easy to try on a separate path.
</objective>

<reference_review>
Review all sources below. Start with AstroBone, Cosmic Shield and Asstra. For each project, inspect the original repository, relevant implementation or paper, and the exact license for any proposed code, model, dataset or asset reuse. Record the commit or version, license, idea examined, what Sol Check actually adopted, and why any proposed integration was deferred. Use source links in the submission credits. A short entry per source is enough. Public access alone does not grant redistribution rights.

Competition and related projects:

- AstroBone — https://github.com/mysunatislam/astrobone-space-apps-2026 — study hardware comparison, signal quality, digital twin and offline evidence presentation.
- Cosmic Shield — https://github.com/mahadindotnet/cosmic-shield — study alert review, test coverage and the evidence-to-action workflow.
- Asstra — https://github.com/MdMusfiqurRahmanAkib/asstra — study cognitive measurement, individual baselines and disciplined use of NASA datasets.
- AstroHealth — https://github.com/Ridwanulkarim/nasa-challenge-Create-Health-Monitoring-Software-for-Astronauts-on-Space-Missions — study the communications blackout and crew-to-ground workflow.
- VITA — https://github.com/Nav33dCodes/vita-astronaut-health-monitor — study acknowledgement, action history, simulated telemetry and report design.
- AstroByte — https://github.com/meahadi-hasan10/AstroByte-Health-Monitor — study fast scenario switching, explanation design and RadLab presentation.
- Hypnos — https://github.com/bleeyy/Hypnos — study sleep, cognition, mood and crew task UX.
- Storm Shield — https://github.com/shajidul-sobuj/storm-shield — study how to connect an archive event to a crew briefing with visible evidence limits.
- Demify — https://github.com/Duesi09/Demify---Health-Monitoring-Software-for-Astronauts — compare onboarding and visual health review.
- VITALS — https://github.com/noor-hossain13/vitals-astronaut-health-monitor — compare hazard and dashboard presentation.
- Space Health — https://github.com/AnNguyenGia/nasa-challenge — study offline recovery and edge deployment patterns.
- Autonomous AstroHealth Guardian — https://github.com/mahirrace-del/autonomous-astrohealth-guardian — study reproducible simulated telemetry and alert test cases.

Measurement projects:

- Vital Camera SDK — https://github.com/KegangWangCCNU/vitalcamera-sdk — improve the existing local browser adapter, signal feedback and teardown.
- FacePhys — https://github.com/KegangWangCCNU/FacePhys-Release — verify model identity, output and redistribution terms for the installed version.
- FactorizePhys — https://github.com/PhysiologicAILab/FactorizePhys — examine evaluation protocol and research-license terms.
- rPPG-Toolbox — https://github.com/ubicomplab/rPPG-Toolbox — use its reference comparison and rejection-reporting patterns for the evaluation plan.
- Remote Bio-Sensing — https://github.com/remotebiosensing/rppg — compare reference alignment and reproducibility.
- Open-rPPG — https://github.com/KegangWangCCNU/open-rppg — review local model comparison options for a development benchmark.
- ME-rPPG Demo — https://github.com/Health-HCI-Group/ME-rPPG-demo — inspect browser startup, sample handling and frame-processing patterns.
- VitalLens.js — https://github.com/Rouast-Labs/vitallens.js — inspect documented local POS/CHROM support for an optional benchmark comparator.
- VitalLens API — https://www.rouast.com/api/ — compare capabilities and evidence for the research review. The deployed app uses local inference.
- Lens HRV — https://github.com/LensHRV/lenshrv-app — study artifact rejection and fingertip signal UX.
- Heart Rate Monitor — https://github.com/richrd/heart-rate-monitor — study browser fingertip capture constraints and device fallback.
- rPPG Vitals — https://github.com/Cheedofam/rppg-vitals — study how accepted and rejected windows affect reported error. Verify which respiratory outcomes were tested with a real reference.
- Respiratory Tracking — https://github.com/wendellr/respiratory_tracking — assess local optical-flow feasibility for a separate experiment.
- Somn — https://github.com/Vic-41148/somn — study overnight diary and sleep entry UX.
- DeltaSleep — https://github.com/ntufar/DeltaSleep — review overnight audio and heuristic limitations.
- pyActigraphy — https://github.com/ghammad/pyActigraphy — study recording requirements, missing intervals and rest/activity summaries.
- CoughKit — https://github.com/bagustris/coughkit — review audio event counting, recording requirements and uncertainty.
- BP-rPPG-ALIVE — https://github.com/TrishnaSaikia/BP-rPPG-ALIVE — review dataset and experimental BP validation limits. Keep cuff readings as the supported BP workflow.

Primary evidence:

- Official challenge and Resources tab — https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources
- Global Organizing Team guidance on listed NASA resources, third-party materials and attribution — https://github.com/nasa/spaceapps/discussions/1827
- Independent rPPG reliability study — https://pmc.ncbi.nlm.nih.gov/articles/PMC12678791/
- FDA blood pressure device communication — https://www.fda.gov/medical-devices/safety-communications/do-not-use-unauthorized-devices-measuring-blood-pressure-fda-safety-communication
- FDA glucose measurement communication — https://www.fda.gov/medical-devices/safety-communications/do-not-use-smartwatches-or-smart-rings-measure-blood-glucose-levels-fda-safety-communication
</reference_review>

<requirements>
1. Restore measurement isolation and audit the claims first.
   - The current Checkin and CameraPulseCheck code can copy an optical estimate into a stored check-in. This conflicts with the owner's earlier approval and decision D16. Make live FacePhys estimates view-only for the active session. Remove the write-back entry point. Keep the camera optional, with video-only access after explicit per-session consent.
   - Trace previously stored camera_estimate readings through the engine, baselines, trends, summaries, follow-up actions and exports. Preserve existing data without rewriting its origin. Clearly label legacy optical entries and exclude them from the inputs that drive baselines and escalation. Keep camera biometric values out of ground handoffs and exported records. Test existing records and ensure ordinary manual heart-rate entry still works.
   - Trace any clinical or NASA-validation claims in README, the cognitive lab, Assessment, CMO, Hazards and the submission handoff to primary evidence. Present the product as a research-informed prototype with deterministic demo rules. Report cognitive task observations in milliseconds and distinguish any demo thresholds or scores from validated PVT criteria. Remove unsupported clinical labels, operational fitness instructions, treatment advice, and claims that archive radiation caused a crew outcome. Compare the evidence passport's displayed calculations with the actual engine.

2. Improve measurement quality and evaluation.
   - Build on FacePhys and the current pulse quality code. Give the user clear positioning, warm-up, usable-signal, weak-signal and retry states. Use the same documented quality acceptance rule for live and final displays. An inadequate signal produces no BPM result. Handle consent decline, permission denial, camera unavailable, worker failure and lost frames. Stop all tracks and release workers on Stop, Cancel, route exit and failed startup, including a cancel during initialization.
   - Keep provenance, capture time, signal quality where it exists, and validation status understandable on existing check-in, trend, evidence and export surfaces. Reuse existing metadata. Preserve original units and timestamps. Keep entered device readings, self-reports, synthetic data, derived values and NASA archive data distinguishable. Explain missing, rejected and insufficient-history states without silently filling values.
   - Add a reproducible local evaluation path around the existing validation helpers. Accept a documented, consented or appropriately licensed timestamped reference fixture and aligned estimate windows. Report number of attempted and accepted windows, coverage, rejected-window reasons, mean absolute error, bias and RMSE for matched windows. Include a synthetic fixture for testing the math with a visible synthetic label. Label published numbers by author, dataset, conditions and whether reproduced. Separate actual model output from a UI mock, and a physical comparison from clinical or flight validation.
   - Evaluate extra signals from the references as isolated research work. HRV and respiratory rate may get a separate on-device, view-only experiment if signal-quality and offline checks pass and the output is labeled exploratory. Keep webcam-derived blood pressure, glucose, temperature, SpO₂ and mood inference out of the feature set. Keep the deployed app free of hosted VitalLens, background recording and microphone permission. Apply the sleep references to an optional self-reported sleep and rest log using existing inputs, without assuming that a daytime scan can recover overnight sleep. Cough detection and fingertip capture can remain documented experiments when hardware, licensing or reference data are missing.

3. Close the crew workflow end to end.
   - Unify the existing evidence passport, Assessment, follow-up center and CMO console. Let a crew member inspect a finding's readings, origin, baseline, rule version and evidence limits, acknowledge it, log a repeat measurement or a note, and record a disposition. Show timestamps and the simulated role responsible for each action. Make transitions idempotent. Scope records to the active scenario, and verify reload, scenario switching and reset. Keep the interface clear when a finding changes after a corrected check-in.
   - Complete the offline handoff using the existing draft and import/export components. Include recorded values, evidence links and follow-up status where appropriate. Explain what is in the file before download, with notes off by default. Verify import, malformed input, and a changed checksum. Describe checksums as integrity checks without claims of authentication or clinician sign-off.
   - Add a clearly labeled communication blackout or restored-link rehearsal using the existing simulator, if that state is missing. A judge should be able to prepare a local handoff during the simulated blackout and continue crew follow-up. Keep the default hero delay 20 minutes one way and 40 minutes round trip. Keep all interactions local to the browser.

4. Improve the mission story and interface.
   - Finish the existing 3D viewer and accessible 2D fallback. Check all six hotspot destinations, WebGL unavailable and load failure, keyboard and touch, reduced motion, and offline asset loading. Keep the existing suit model and visual system. Prioritize a short, legible path on the dashboard and mobile navigation.
   - Connect the existing sleep, mood and cognitive observations through a clear review of their recorded timelines. A cognitive result should show the task version, timing limitations, interruptions or incomplete trials and the measured response-time summary. Keep experimental cognitive results separate from autonomous escalation. Use the existing task and avoid a second competing test.
   - Improve the existing three-lane RadLab replay and hazard explorer where the demo needs it. Show the original UTC timestamps and distinguish raw readings from hourly medians. Preserve the 1,220 original readings, 330 hourly medians, six missing hours, 15.384445 µGy/hour event reading, and 23.182808 µGy/hour raw peak. Treat the replay as context. Keep estimates of crew dose, sievert conversion, predictions and radiation-driven clinical flags outside the release.
   - Verify the official challenge Resources tab. Identify the exact listed NASA resource and the app feature that materially uses it. If RadLab or another existing source qualifies, cite the exact listing. If the official list is available and the existing sources fail the requirement, integrate one applicable listed source into an existing evidence view with its limits and a local fixture if needed. If the list remains unavailable, document the pending check with the URL and date. Record approved scope expansions and their reasons in the project decision log.

5. Package a working submission.
   - Update the existing README and judging handoff. Provide a short core walkthrough, optional camera and CMO demonstrations, deployment and offline-prime commands, and an accurate attribution record for code, assets, models, data and AI tools. Save the repository comparison and evaluation results in linked Markdown documents.
   - Build the static production files and exercise them on both root and nested paths with the intended host's MIME behavior. Keep the PWA and its cache scoped to the app. Measure initial and offline asset size, check for remote runtime requests, and report any new large files. Verify offline reload after stopping the server. Keep the manual check-in, seeded scenarios, RadLab and local handoff usable if camera or WebGL fails.
   - Leave a tested local release and reviewable submission materials. Public deployment and submission require separate owner authorization.
</requirements>

<constraints>
Build on the current worktree and reuse the existing schemas, routes, controls and components. Preserve existing changes, past saved records and scenario identity. Use reversible, scoped edits and add targeted tests for real regressions. Keep the core demo accessible on mobile, keyboard and reduced-motion settings. Keep runtime data and inference local. Preserve consent, privacy, evidence boundaries and the visible “Not a diagnosis” wording. Keep demo actions distinct from real treatment, live mission communications and actual clinician review. Review code and asset terms separately for the version used and retain required notices. Finish verifiable enhancements even when a reference or physical test is unavailable.
</constraints>

<verification>
Run npm test, npm run build, node scripts/nasa/import-radlab.mjs --verify, and node scripts/verify-offline-p1.mjs. Update existing browser coverage for new behavior where needed. A failed assertion must fail the script. Use a clean dependency install when necessary without overwriting unrelated work.

In production Chromium at / and /solcheck/, prime the cache, disable networking, stop the static server and reload. Walk Sol 43 through check-in, a finding's evidence, acknowledgement and follow-up, local handoff export and import, timeline provenance, alternate scenarios, and reset. Check scenario isolation, malformed and altered imports, export privacy, camera permission denial and cleanup, weak signals, existing camera-tagged records, and WebGL fallback. Confirm which checks exercised an actual SDK-generated estimate. Check the new cognitive and hazard routes and the mobile 2D path. Record browser, host, commands and results.

On the judging laptop, run a consented real-camera test and reference comparison if available. Time a first-time participant through the core path if available. Mark each missing physical test pending, and provide a manual demo fallback. Never turn synthetic evaluation results into an accuracy claim.

Deliver changed files and a short readiness report covering implemented improvements, key references adopted, tests actually run, and remaining gaps. Include the working local URL and exact rehearsal instructions.
</verification>
