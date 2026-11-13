# Hazard 1: Space Radiation Health Monitoring — Deep-Space Transit Specification

> **Operational Standard:** NASA-STD-3001 Universal 600 mSv Career Ceiling  
> **Route in Application:** `#/hazards/radiation`  
> **HRP Element:** Space Radiation (SR) · Reference ID: `SC-RAD-01`

---

## 1. Overview & Dosimetric Foundations

* **Primary Units of Measurement:**
  * **Effective Dose:** Millisieverts ($\text{mSv}$)
  * **Dose Rates:** Millisieverts per hour ($\text{mSv/h}$) and Millisieverts per day ($\text{mSv/day}$) where $\text{Rate}_{\text{day}} = \text{Rate}_{\text{h}} \times 24$
* **Universal Career Effective Dose Limit:** $600\text{ mSv}$ per crew member (universal limit per NASA-STD-3001).
* **Rolling Window Tracking:**
  * Continuous tracking of daily dosages per crew member.
  * **Rolling 30-day cumulative sum** ($\text{Limit} = 250\text{ mSv}$; safe baseline $< 105\text{ mSv}$).
  * **Mission-to-date cumulative sum** added to astronaut's pre-mission career baseline.

---

## 2. Spacecraft Compartment Navigation Graph & CARN Telemetry

To manage spatial radiation variance across deep-space vehicles, Sol Check maintains a dynamic navigation graph of spacecraft modules:

### Node Attributes
* `Room_ID`: Unique compartment identifier (e.g., `flight-deck`, `airlock`, `habitation`, `storm-shelter`, `galley`, `equipment-bay`).
* `Room_Name`: Human-readable module name.
* `Shielding_Factor`: Water-equivalent thickness in $\text{g/cm}^2$ (e.g., Central Storm Shelter = $48\text{ g/cm}^2$; Airlock = $6\text{ g/cm}^2$).
* `Adjacent_Rooms`: Edges for Dijkstra lowest-dose evacuation pathfinding.
* `Is_Storm_Shelter`: Boolean flag indicating maximum-shielded core zone surrounded by potable water tanks and food stores.

### CARN Sensor Binding
* Each compartment is paired with a dedicated **CARN (Cosmic & Ambient Radiation Node) Sensor**.
* Streams real-time dose rates ($\text{mSv/h}$) and particle flux telemetry ($\text{protons/cm}^2\text{s}$) at 1-minute intervals.
* Rolling time-series logging at 1-minute, 1-hour, and 24-hour resolutions.

### Directional Event Localization
* Comparing delta spikes across outer-hull versus core CARN nodes determines the incident directional vector (e.g., *Sunward Vector +X, Bearing 045° Front-Starboard*).
* Calculates localized severity and module attenuation ratios ($\text{Peak Outer Rate} / \text{Core Shelter Rate} \ge 20\text{x}$).

---

## 3. Personalized Room Access & Dynamic Lockdown Rules

Rather than applying a static, vehicle-wide closure, Sol Check calculates room safety **individually per crew member** based on remaining permissible dose budgets:

$$\text{Remaining Career Budget}_i = 600\text{ mSv} - \text{Total Career Dose}_i$$
$$\text{Remaining 30-Day Budget}_i = 250\text{ mSv} - \text{Rolling 30-Day Dose}_i$$

A room $R$ is flagged as **`RESTRICTED`** for crew member $i$ if:
1. **Acute Rate Breach:** CARN sensor in Room $R$ reads $> 2.1\text{ mSv/h}$ (projected $> 50\text{ mSv/day}$), triggering immediate closure for **all** crew.
2. **Personalized Budget Threat:** Projected exposure for a standard 8-hour shift ($\text{Rate} \times 8$) exceeds **5% of remaining 30-day budget** OR **2% of remaining career budget**.
3. **Hard Career Ceiling:** Crew member total career dose $\ge 450\text{ mSv}$ ($75\%$) or $\ge 600\text{ mSv}$ ($100\%$), automatically locking out all non-core, lightly shielded outer compartments for that individual.
4. **Beacon Alarm:** If a crew member's last recorded location beacon enters a restricted room, an active alarm is raised.

---

## 4. Cumulative Career Dose Milestone Tiers

$$\text{Total Career Dose} = \text{Pre-Mission Baseline} + \sum \text{Daily Mission Doses}$$

| Milestone Tier | Threshold Condition | System Warning Message | Watchlist: Potential Health Risks | Automated Software Actions & Countermeasures |
| :--- | :--- | :--- | :--- | :--- |
| **Baseline** | $< 150\text{ mSv}$ ($< 25\%$) | *"STATUS NORMAL: Career radiation exposure within nominal limits."* | Nominal background cellular stress. | No special intervention required. Full compartment access. |
| **Tier 1 Warning** | $\ge 150\text{ mSv}$ ($25\%$ of $600\text{ mSv}$) | *"CAUTION [25% LIMIT]: Crew member [ID] has reached 150 mSv career exposure. Initiate dose-budgeting review."* | Early cumulative DNA damage; minor elevation in lifetime carcinogenesis risk. | • Flag crew member in mission planner.<br>• Introduce baseline antioxidant dietary protocol.<br>• Apply stricter personal dose-rate thresholds for high-exposure outer compartments. |
| **Tier 2 Warning** | $\ge 300\text{ mSv}$ ($50\%$ of $600\text{ mSv}$) | *"WARNING [50% LIMIT]: Crew member [ID] has reached 300 mSv career exposure. Restrict high-exposure tasks."* | Increased risk of radiation-induced cataracts (eye lens), circulatory system stiffness, and immune dysregulation. | • Close lightly shielded outer compartments to crew member.<br>• Reassign non-essential deep-space EVAs to lower-dose crew.<br>• Schedule comprehensive eye/lens and cardiovascular check. |
| **Tier 3 Critical** | $\ge 450\text{ mSv}$ ($75\%$ of $600\text{ mSv}$) | *"CRITICAL [75% LIMIT]: Crew member [ID] approaching career limit (450 mSv). Mandatory EVA & outer-hull lockout."* | High lifetime risk of radiation carcinogenesis; accelerated degenerative tissue effects and CNS fatigue. | • **Lockout from all deep-space EVAs and unshielded modules.**<br>• Reassign sleeping quarters to most heavily shielded inner module.<br>• Maximize pharmacological/nutritional radioprotection. |
| **Hard Limit** | $\ge 600\text{ mSv}$ ($100\%$ of $600\text{ mSv}$) | *"EMERGENCY LIMIT REACHED: Crew member [ID] has reached the 600 mSv NASA career ceiling."* | Maximum permissible lifetime threshold reached. | • Permanent restriction to maximum-shielded central core zones for remainder of transit. |

---

## 5. Vehicle-Wide Alert Classification & Real-Time Actions

* **`GREEN` (Safe Baseline):** All CARN sensors $\le 0.15\text{ mSv/h}$ ($\le 3.5\text{ mSv/day}$) AND crew 30-day rolling sum $< 105\text{ mSv}$. Standard transit operations.
* **`YELLOW` (Elevated Exposure):** Any CARN $0.15 < \text{Rate} \le 2.1\text{ mSv/h}$ ($3.5\text{ to }50\text{ mSv/day}$). Advisory message, localized room closure for Tier 1+ crew, dietary antioxidant protocol (freeze-dried blueberries, strawberries, kale, spinach, walnuts, lycopene tomatoes) and radioprotective supplements (Vitamins C/E, Selenium, NAC, Omega-3).
* **`ORANGE` (Active Solar Particle Event - SPE):** Projected daily dose $> 50\text{ mSv/day}$ (rate $> 2.1\text{ mSv/h}$). Immediate EVA recall, automated turn-by-turn lowest-dose crew routing to interior storm shelter.
* **`RED` (Severe Solar Storm):** Rolling 30-day dose $> 250\text{ mSv}$ OR multiple compartments $> 4.17\text{ mSv/h}$ ($> 100\text{ mSv/day}$). Full compartment lockdown, 5-minute crew accountability check in Central Storm Shelter.

---

## 6. Post-Event Monitoring & De-Escalation Workflow

1. **Continuous Polling:** 1-minute CARN timeline logging and 24-hour dosimeter prompts.
2. **Hysteresis Completion Rule:** An SPE or storm is declared **ENDED** only when **all** compartment CARN sensors verify dose rates $\le 3.5\text{ mSv/day}$ ($\le 0.15\text{ mSv/h}$) continuously for **at least 6 consecutive hours**. A single low reading will never clear warnings.
3. **Mandatory Post-Event Biometric Checks:** Prompts automated finger-prick blood/saliva lymphocyte assay at **24 hours** and **48 hours** post-event to evaluate bone-marrow recovery.
4. **Phased Room Re-Opening:** Recalculates remaining 30-day and career budgets; compartments reopen selectively per individual permissible limits.

---

## 7. Environmental Map Upgrade: Tri-Metric Nodes, Averages & Event Localization

The Radiation Map (`#/hazards/radiation`) overlays **three simultaneous environmental readings** on every one of the six compartment nodes:

| Metric | Unit | Role |
|---|---|---|
| Temperature | °C | **Corroborating** evidence only when it actually rises |
| Radiation dose rate | mSv/h | **Safety-critical primary** signal (existing CARN data) |
| Carbon dioxide (CO₂) | mmHg | **Independent** air-quality metric (never a solar-event signal) |

### ISS-wide averages
An averages strip inside the map card shows **Avg Temp / Avg Radiation / Avg CO₂**. Each is the **arithmetic mean of the valid readings across all six compartments (including the shelter)**, computed independently per metric. Invalid (missing) and stale readings are excluded and the node count (`N/6 reporting`) is shown; a metric with no valid samples reads `Unavailable`. Hazard **severity** still uses the **peak** affected room, never the mean.

### Event detection (`src/features/radiation/compartmentEnvironmentEngine.ts`)
A pure, independently-tested module derives the current event from a window of **timestamped** frames:

* **Radiation is the only alarm trigger** — a peak dose above the CARN acute-breach rate (`2.1 mSv/h`). A radiation-only spike with flat temperature **still alarms**.
* **Temperature corroborates** only where it actually rose in the first-hit rooms; it never triggers an alarm by itself.
* **CO₂** is surfaced as a separate air-quality `WATCH` (threshold reuses `CO2_LIMIT_MMHG = 3` from `engine/rules`) and is **never** interpreted as a radiation event.
* **First-hit ordering** comes from the earliest qualifying onset **timestamp per room**, not render order or the largest final reading.
* **Estimated exposure sector** is inferred from the earliest-hit nodes' quadrants, with `insufficient` / `low` / `medium` confidence. Single-node, diffuse, or simultaneous evidence yields **`Direction uncertain`** — no fabricated bearing.

### Map overlays
* **Red `⚠️ POSSIBLE RADIATION EVENT`** panel (`role="alert"`) with `WARN`/`CRITICAL` severity, first-hit rooms, corroboration note, estimated sector, and a `Simulated` badge.
* **Three curved incoming-wave arcs** anchored to the estimated incident side via the live Three.js camera projection — they track rotation/zoom and relocate when a different side is hit first. Hidden (replaced by `Direction uncertain`) when direction cannot be determined.
* **Bright-green `SAFETY SHELTER` beacon** pinned to the projected `storm-shelter` node. If the shelter is itself above the acute rate or the route is unavailable it shows **`SHELTER — VERIFY`** instead of a false green safe status.
* **Optional audio alarm** — explicitly user-enabled, muteable (acknowledge silences audio but **not** the visual alarm), Web Audio only (no network asset).

### Demo controls
The simulation bar exposes the five presets (`GREEN`, `YELLOW`, `ORANGE`, `RED`, `RECOVERY`) plus demonstration events: **Aft event** (different sector), **Rad-only** (no temperature corroboration), **Diffuse** (Direction uncertain), **CO₂ only** (air-quality watch, not a flare), and **Sensor gap** (missing data → `5/6 reporting`). A **Replay / Step / Reset** transport steps through each event's timestamped samples so the first-hit group and incoming-wave direction are visible as they unfold. Selecting a preset jumps straight to its full-state frame.

### Limitations (simulation, not operational ISS telemetry)
* Temperature and CO₂ values are **clearly simulated mock readings**, not NASA/ISS live sensors.
* With six sensors and minute-scale sampling the exposure sector is a **demonstration-level spatial heuristic**, not a solar-flare arrival direction, source, or celestial bearing.
* Compartment-to-ISS-node mappings place simulated transit modules on visible ISS geometry; they are **not** verified real ISS storm-shelter locations or sensor placements.
* The entire feature runs **offline** from the bundled GLB model and synthetic fixtures — no network access and no implied live data.
