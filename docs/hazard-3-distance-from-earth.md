# Hazard 3: Distance from Earth

- **Sol Check hazard code:** `SC-EXMC-01`
- **NASA Human Research Program element:** Exploration Medical Capability (ExMC)
- **Associated factors:** Communication Latency (20-min one-way / 40-min round-trip), Autonomous Crew Triage, Absence of Real-Time Ground Guidance, Resource Scarcity, Zero Cloud/LLM Runtime Dependency (`Lane F / Docs`)
- **Design baseline:** Sol Check — Frozen Design Contract v1

> **Scope and Legitimacy Disclaimer (Not a diagnosis):** Sol Check is a research-informed software prototype designed to assist a non-physician astronaut on the surface of Mars in monitoring personal physiological variations against their own rolling baseline. It is not an FDA-approved medical device, does not provide clinical diagnoses, treatments, or prescriptions, and carries no formal NASA endorsement.

---

## 1. Hazard Overview & Operational Premise

During interplanetary missions to Mars, electromagnetic communications between Earth and Mars experience an inescapable physical propagation delay ranging from 3 to 22 minutes depending on orbital geometry, modeled in Sol Check as **up to 20 minutes one-way (40 minutes round-trip)**.

This latency fundamental completely invalidates the real-time telemedicine model used aboard the International Space Station (ISS), where astronauts communicate synchronously with Mission Control flight surgeons in Houston or Munich. On the surface of Mars:
1. **Real-time consultation is physically impossible:** In an acute physiological shift or sudden symptom flare, waiting 40 minutes for an initial query and response is operationally unacceptable.
2. **The crew consists of non-physician astronauts:** Without published definitive clinical cutoffs for healthy individuals living in Martian partial gravity (0.38 g) and closed artificial habitats, an astronaut cannot easily distinguish transient adaptive noise from meaningful physiological trends.
3. **No resupply or emergency medical evacuation:** The crew must strictly ration medical supplies and manage health issues autonomously with onboard tools.

Sol Check translates these operational realities into an **offline-first, zero-cloud autonomous health monitoring architecture** executing entirely on-device without external server calls, cloud dependencies, or black-box LLMs.

---

## 2. Claim-versus-Evidence Matrix

Sol Check maintains strict scientific traceability. Every feature, metric, and threshold in the prototype is mapped to peer-reviewed NASA publications and standards, while explicitly documenting what each source **does not support**:

| Reference Source | Supported Sol Check Component | What the Source Scientifically Proves (Supports) | Prohibited Clinical Boundaries (Does Not Support) |
| :--- | :--- | :--- | :--- |
| **NASA Hazard: Distance from Earth**<br>`NASA HRP Human Spaceflight Hazards` | Simulated Delay Clock (`P0-4 / F12`), Hazard Risk Badges | Mars communication latency reaches up to 20 minutes one-way (40 minutes round-trip), necessitating autonomous onboard monitoring. | Does not define any clinical treatment, diagnosis, or drug management protocol. |
| **NASA-STD-3001 Vol 1 Rev C**<br>`Space Flight Human-System Standard` | Daily 60-Second Check-in (`P0-1`), 7 Frozen Core Metrics | Mandates in-mission monitoring of vital signs, sleep duration, and behavioral health (§3.1.4, §3.1.5), and establishes the Crew Medical Officer (CMO) role (§3.1). | Does not publish normative clinical cutoffs (e.g., HR, BP, temperature, glucose, mood thresholds) for healthy astronauts in space. |
| **NASA Human System Risks**<br>`Human Research Roadmap (HSRB)` | Health Domain Classification (`P0-6`), Rule Categorization | Documents systemic spaceflight risks: sleep loss, behavioral health deterioration, cardiovascular deconditioning, and metabolic shifts across 30 HRP risks. | Does not provide decisive clinical criteria to classify an individual astronaut's health state as "safe" or "pathological". |
| **NASA EIMO ConOps (2024)**<br>`Earth-Independent Medical Operations` | Product Architecture, 3-Tier Escalation Ladder | Sets NASA's strategic direction for onboard clinical decision-support and progressive crew autonomy during deep space missions. | Does not constitute a clinical endorsement or official certification of the Sol Check software. |
| **RadLab MSL-RAD-Surface**<br>`NASA OSDR / Curiosity MSL RAD (2017)` | Radiation Replay Stream (`P0-5`), Contextual Association Alert | Actual archival Mars surface absorbed dose rate (`µGy/hour`) recorded by Curiosity, capturing the September 11, 2017 Solar Particle Event. | Does not measure crew absorbed dose, habitat shielding efficacy, or clinical symptoms, and cannot be compared to cumulative career limits (e.g., 600 mSv). |

---

## 3. Frozen Design Parameters & Strict Wording Rules (Contract Sections 5 & 7)

### 3.1 Model Engineering Parameters (`demo_heuristic`)
- **Personal Baseline Window (`F04`):** Calculated as the mathematical **median** of the astronaut's own previous valid readings within a rolling **14-sol window**, requiring a minimum of **5 distinct measured sols**.
- **Insufficient History Guard:** If fewer than 5 valid readings exist in the 14-sol lookback, the status is strictly set to `baseline_not_established` (never default, assumed, or labeled "normal").
- **Sustained Trend Rule:** Defined as a qualifying deviation in the same direction on at least **3 of the last 5 mission sols** (including the current check-in sol, as demonstrated in the Sol 43 scenario).
- **Frozen P0 Scope:** Restricted to a maximum of 8 deterministic rules evaluated over the **7 frozen core metrics**:
  1. `heart_rate` (bpm)
  2. `bp_systolic` (mmHg)
  3. `bp_diastolic` (mmHg)
  4. `body_temp` (°C)
  5. `blood_glucose` (mg/dL)
  6. `sleep_duration` (hours)
  7. `mood` (1–5 self-report score)
- **Fixed Core Symptoms (8 options):** `headache`, `dizziness`, `fatigue`, `nausea`, `shortness_of_breath`, `chest_discomfort`, `digestive_discomfort`, `muscle_ache`.

### 3.2 Strict Wording Rules (Mandatory Clinical Restraint)
To eliminate clinician liability and prevent false confidence:
- **Banned Adjectives:** Absolute prohibition of clinical evaluations such as `normal`, `healthy`, `safe`, `dangerous`, `diseased`, or `high risk`.
- **Enforced Frozen Vocabulary:** Health domains and metrics must exclusively report one of six frozen states:
  1. `no_change_detected`
  2. `change_from_baseline`
  3. `sustained_trend`
  4. `baseline_not_established`
  5. `check_entry`
  6. `not_measured`
- **ActionCard Governance:** Action cards (`ActionCard`) in `src/content` are strictly limited to general self-care guidance, how-to-measure instructions, and escalation protocols. **Zero medication names, pharmaceutical dosages, or therapeutic prescriptions** may be rendered.

---

## 4. Software Monitoring & Architecture Logic Matrix

The table below maps each operational facet of the **Distance from Earth** challenge directly to Sol Check's software architecture and pure TypeScript engine:

| Distance from Earth Challenge (Hazard Facet) | Operational & Clinical Impact | Sol Check Software Architecture & Logic |
| :--- | :--- | :--- |
| **Communication Delay**<br>`20-min One-Way / 40-min Round-Trip` | Inability to receive real-time medical instructions from the terrestrial Flight Surgeon during acute physiological shifts. | • Sol calculation dynamically derived from `missionStartUtc` and `solLengthSeconds` (`88,775 s`).<br>• Simulated communication delay clock (`oneWayDelayMinutes: 20`, earliest reply at `40 min`) in the Escalation screen (`F12`).<br>• Three-tier escalation routing: `self_care` → `crew_medical_officer` → `ground_flight_surgeon`.<br>• Local store-and-forward telemetry summary generation containing recorded values only, with zero runtime network calls. |
| **Non-Physician Crew Autonomy**<br>`Crew Self-Reliance` | Difficulty in detecting subtle health degradation without published spaceflight clinical cutoffs or specialist presence. | • **Input Validation (`F02` / `data_quality`):** Enforces strict guards against physically impossible entries, setting status to `check_entry` with remeasurement guidance without health claims. Omitted fields are cleanly flagged as `not_measured`.<br>• **Personal Baseline (`F04`):** Computes rolling 14-sol median (minimum 5 sols required); displays `baseline_not_established` when data is insufficient.<br>• **Deterministic Rules Engine (`src/engine` / `evaluateCheckin`):** Pure, testable TypeScript functions executing max 8 rules across 6 families (`change_from_baseline`, `sustained_trend`, `combined trend`, `symptom_persistence`, `contextual_association`, `data_quality`). Displays transparent "Why this finding?" drawer showing `ruleId`, inputs, `SourceRecord`, and `ReviewStatus`. |
| **No Resupply & Resource Scarcity**<br>`Resource Constraints` | Absence of logistical resupply, pharmacy replenishment, or emergency evacuation options. | • Every `Finding` is paired with pre-authored `ActionCard` records in `src/content`, sourced to peer-reviewed references.<br>• Action cards restrict content strictly to general self-care, measurement verification, and escalation ladders.<br>• Complete exclusion of medication names, dosages, or clinical treatments. |
| **Compound Environmental Stress**<br>`Isolation & Environmental Context` | Multi-hazard interactions (e.g., sleep loss, mood drops, shelter protocol, space radiation) can confound observations without clinical causation. | • **Three-Stream Mission Timeline (`F08`):** Synchronizes (1) crew measurements (`user_entered` / `synthetic_demo`), (2) synthetic mission events (`MissionEvent`, e.g., Sol 41–42 `shelter_protocol`), and (3) real archival Curiosity rover radiation data (`RadLab MSL-RAD-Surface`, September 11, 2017 solar event shifted by `archiveOffsetMs`).<br>• Explicit data provenance badges (`nasa_archive` vs `synthetic_demo`).<br>• Classifies concurrent events strictly as `contextual_association` with an explicit notice: *not a proven cause*. |
| **Offline-First Operation & Auditability**<br>`Network-Disconnected Habitat` | Health monitoring and mission documentation must remain 100% operational during communications blackouts and orbital occultation. | • Runs as a 100% client-side Static SPA with zero server, zero cloud, and zero runtime LLM calls.<br>• Local data persistence via `localStorage` abstracting behind the `StorageRepository` interface.<br>• Comprehensive audit logging via `AuditEvent` records (`id`, `atUtc`, `type`, `refId`) capturing check-ins, ground draft creations, and system resets. |

---

## 5. Three-Tier Escalation Protocol

```
                        ┌────────────────────────────────────────┐
                        │              DAILY CHECK-IN            │
                        │       7 Core Metrics + 8 Symptoms       │
                        └───────────────────┬────────────────────┘
                                            │
                                            ▼
                        ┌────────────────────────────────────────┐
                        │      DETERMINISTIC RULES ENGINE        │
                        │      Rolling 14-Sol Baseline Median    │
                        └───────────────────┬────────────────────┘
                                            │
         ┌──────────────────────────────────┼──────────────────────────────────┐
         │                                  │                                  │
         ▼                                  ▼                                  ▼
┌──────────────────┐              ┌──────────────────┐              ┌──────────────────┐
│     TIER 1       │              │     TIER 2       │              │     TIER 3       │
│    Self-Care     │              │   Crew Medical   │              │  Ground Flight   │
│   (self_care)    │              │  Officer (CMO)   │              │ Surgeon (Ground) │
└────────┬─────────┘              └────────┬─────────┘              └────────┬─────────┘
         │                                 │                                 │
         │ • Recheck entry errors          │ • Sustained trend (3 of 5 sols) │ • Severe / compound risk
         │ • Hydration & sleep hygiene     │ • Combined sleep + mood drop    │ • Store-and-forward handoff
         │ • Record & monitor trend        │ • Urgent symptoms (chest/breath)│ • 20-min one-way countdown
         │ • Log countermeasure adherence  │ • Review transparent "Why?"     │ • Cryptographic FNV-1a-32
```

1. **Tier 1 — Self-Care (`self_care`):**
   - Applied when readings show `no_change_detected`, single-sol `change_from_baseline`, or input error `check_entry`.
   - The crew member reviews their personal baseline, checks entry hygiene, and follows basic operational countermeasures (rest, hydration, sleep schedule).
2. **Tier 2 — Crew Medical Officer (`crew_medical_officer`):**
   - Automatically triggered when multi-sol sustained trends occur (e.g., 3 of last 5 sols lower sleep and mood), when high-priority symptoms are marked, or when a behavioral crisis is reported.
   - The crew member opens the CMO console (`#/cmo`) where the onboard medical officer reviews transparent rule logic, contributing measurements, and kit item availability.
3. **Tier 3 — Ground Flight Surgeon (`ground_flight_surgeon`):**
   - Prepared when the onboard CMO determines terrestrial specialist review is required.
   - Generates a local, self-contained handoff draft (`medicalHandoff.ts`) formatted in standardized JSON and Markdown.
   - Protects telemetry integrity with an **FNV-1a-32 checksum** and starts the 20-minute simulated countdown timer.
   - **Zero network calls occur at runtime**; the astronaut or CMO copies or downloads the payload for store-and-forward transmission through habitat comms.

---

## 6. Mission Status — Sol 43 & Offline Telemetry Handoff Workflow

In the Sol Check reference scenario, mission specialist **Maya Chen** conducts her daily evaluation on **Sol 43**, following two sols of habitat storm shelter operations (Sols 41–42) triggered by a solar particle event:

1. **Recorded Inputs:**
   - Sleep duration: `4.5 hours` (personal baseline: `7.5 hours` → 40% reduction, sustained on 4 of last 5 sols).
   - Self-reported mood: `2/5 Low` (personal baseline: `4/5 Positive` → 2-point reduction, sustained on 4 of last 5 sols).
   - Blood pressure: `116/74 mmHg` (stable).
   - Core body temperature: `36.7 °C` (stable).
   - Blood glucose: `94 mg/dL` (stable).
   - Symptoms: Transient headache noted during shelter period; resolved on Sol 43.
2. **Rule Evaluation:**
   - Rule `sustained-trend` triggers for `sleep_duration`.
   - Rule `sustained-trend` triggers for `mood`.
   - Rule `combined-sleep-mood` fires at priority 90, elevating recommended triage from `self_care` to `crew_medical_officer`.
3. **Timeline Contextualization:**
   - The mission timeline renders Curiosity's actual September 11, 2017 radiation peak (`15.38 µGy/h` raw, peaking at `23.18 µGy/h`).
   - Sol Check explicitly tags this correlation as a `contextual_association`: the shelter event coincided with the sleep/mood shift, but is not clinically established as a direct biological cause.
4. **Handoff Generation:**
   - Ground communication summary generates on-device with zero telemetry egress.
   - FNV-1a-32 checksum guarantees local file integrity before burst transmission to Earth.

---

## 7. Scientific Evidence Sources

1. **NASA Human Research Program.** [Human Spaceflight Hazards: Distance from Earth](https://www.nasa.gov/hrp/hazard-distance-from-earth/). Explains communication delays up to 20 minutes one-way and the requirement for crew medical self-reliance.
2. **NASA Office of the Chief Health and Medical Officer.** [NASA-STD-3001 Volume 1 Rev C: Space Flight Human-System Standard](https://www.nasa.gov/reference/3-0-health-and-medical-care/). Sections 3.1.4 and 3.1.5 mandate physiological, vital signs, sleep, and behavioral health monitoring during space missions.
3. **NASA Human System Risk Board.** [Human System Risks Master Evidence Reports](https://humanresearchroadmap.nasa.gov/evidence/). Catalogs risks of sleep loss, behavioral decline, cardiovascular deconditioning, and nutrition.
4. **NASA Exploration Medical Capability (ExMC).** [Earth-Independent Medical Operations (EIMO) Concept of Operations (2024)](https://ntrs.nasa.gov/citations/20240001402). Outlines clinical decision-support architectures for Mars-forward missions.
5. **NASA OSDR & Planetary Data System.** [MSL-RAD Surface Radiation Measurements at Gale Crater](https://pds-ppi.igpp.ucla.edu/). Curiosity Rover Radiation Assessment Detector archive, September 2017 solar energetic particle event.
6. **American Heart Association.** [Understanding Blood Pressure Readings](https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings). Reference for seated blood pressure measurements and paired systolic/diastolic validity.
7. **National Heart, Lung, and Blood Institute (NHLBI).** [Sleep Diary and Assessment Guidelines](https://www.nhlbi.nih.gov/resources/sleep-diary). Standardized self-reported sleep duration methodologies.
