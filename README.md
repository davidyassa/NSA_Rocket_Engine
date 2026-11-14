# Sol Check

**Crew health monitoring when Earth is minutes away.** Sol Check is an offline-first research prototype for a simulated Mars mission. A crew member can log a check-in, see what changed from their personal baseline, inspect the evidence behind each finding, and leave an actionable record for the onboard Crew Medical Officer (CMO). If Earth’s input is needed, the crew can prepare a handoff locally.

Built for the 2026 NASA Space Apps astronaut health monitoring challenge. [Challenge brief](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)

## Explore the Sol 43 demo

Maya Chen has just spent two sols in storm shelter. She logs **4.5 hours of sleep**. The demo compares that with her **7.5-hour personal baseline**, finds a sustained drop in sleep and mood, and recommends onboard review. The scenario uses a 20-minute one-way light-time delay to Earth.

1. Open **Sol check-in**, select **Fill demo readings**, and save from **Review & save**.
2. In **Assessment**, expand **Why this finding?** on the sleep and mood finding. Use the **CMO console** to review follow-up tasks, or open **Follow-up tasks and ground handoff** in Assessment to prepare a local draft.
3. In **Timeline**, inspect **Sol 41** to see how the real Curiosity radiation archive is aligned with the simulated shelter event. Open **Demo and data** to compare personal and population reference ranges on real Inspiration4 crew data.

[Judging walkthrough and demo controls](docs/submission-handoff.md#live-demo)

## What Sol Check brings together

| Capability | What you can do |
| --- | --- |
| **Personal check-ins and trends** | Record pulse, cuff blood pressure, temperature, glucose, sleep, mood, and symptoms, plus optional observations such as standing vitals, fluid and food intake, exercise, body mass, breathing rate, and heart-rate variability. Explore trends from the interactive 3D astronaut or the dashboard’s keyboard-accessible health cards. Use the dashboard checklist to review what is due. The rule engine uses the preceding 14 sols and requires at least five usable measured sols for a baseline. |
| **Explainable review and follow-up** | Inspect the readings, rule, and source behind a finding. Acknowledge follow-up tasks, record actions, and review data quality and onboard supplies in the CMO console. Export a JSON handoff or Markdown briefing and rehearse a delayed ground exchange entirely on the device. |
| **Guided camera and voice checks** | Run an optional on-device face check for pulse, and a camera breathing scan that tracks chest and abdomen motion and cross-checks it with the face pulse, reporting a rate only when its quality gates pass ([architecture](docs/RESPIRATORY_ARCHITECTURE.md), [validation](docs/RESPIRATORY_VALIDATION_REPORT.md), [research](docs/RESPIRATORY_RESEARCH_COMPARISON.md)). Review and explicitly adopt estimates before saving. The optional mood voice check compares pitch variation, speaking pace, and pauses with the crew member’s own history. Raw camera and microphone recordings are processed locally and are not retained in the check-in. |
| **Ask Sol, by voice or text** | Ask about readings, follow-ups, habitat conditions, or the current page. Say “Hey Sol, log my check-in” to draft fields or “select Sol 41” to navigate hands-free. You review and save the draft. Answers use local records, curated material, and deterministic rules. With the voice assets present, Sol uses Moonshine Tiny and Piper on-device, with Whisper and Kokoro fallbacks. The full answer remains on screen while Sol speaks a shorter version. |
| **Five hazards and a radiation simulator** | Explore NASA’s five hazards through the indicators the app can review. Run and save a vigilance check, plan isolation countermeasures, and revisit results across sols. Replay simulated radiation, CO₂, and temperature by compartment on an ISS-based map with event localization, dose budgets, access restrictions, and modelled shelter routes. Browse the interactive ISS model and mission gallery in **Demo and data**. |
| **Replay, export, and reset** | Follow four timeline lanes covering crew readings, mission events, habitat air, and the Curiosity archive. Download the active scenario’s check-in history as JSON. Switch among the Sol 43, routine, and bad-entry scenarios to rehearse different outcomes. |

Sol Check demonstrates a workflow that also matters in isolated field settings on Earth. A team can record observations without a live connection, explain why a change deserves attention, and prepare a handoff that carries the evidence with it. The app is a research and demonstration prototype. Clinical and flight validation are outside the scope of this prototype.

## Real data in the demo

- **Curiosity RAD.** Sol Check bundles 1,220 Mars-surface absorbed dose-rate measurements from 4–17 September 2017. Its Timeline shows 330 hourly medians in µGy/hour, preserves six missing hours, and maps the 11 September solar particle event to Sol 41. The rover measurements provide environmental context. Crew readings, sheltering, and the separate transit radiation monitor are simulated. [NASA RadLab CSV](https://visualization.osdr.nasa.gov/radlab/api/?instrument=MSL-RAD-Surface&timestamp%3E=2017-09-04&timestamp%3C2017-09-18&absorbed_dose_rate&format=csv) · [NASA JPL event report, 29 September 2017](https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/)
- **Inspiration4 blood counts.** In the bundled analysis of four crew members and five blood-count measures, **0 of 20** day-after-return values were outside the study’s lab ranges. **4 of 20** exceeded the app’s reference-change thresholds relative to the individual’s preflight baseline. Three were back within their thresholds at the next sampled visit (day 45), and the fourth was within its threshold on day 82. Two implausible source values were excluded from the analysis. This small retrospective example illustrates what personal baselines can surface. [NASA OSDR study OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) · [Method and dataset provenance](docs/real-datasets-and-citations.md)

## Official NASA sources

| Citation | Where Sol Check uses it |
| --- | --- |
| NASA Human Research Program. [*5 Hazards of Human Spaceflight*](https://www.nasa.gov/hrp/hazards/) and [*Human Research Roadmap Evidence Reports*](https://humanresearchroadmap.nasa.gov/evidence/). | Hazard explorer and the research context for crew monitoring, including [behavioral health](https://humanresearchroadmap.nasa.gov/evidence/reports/HRP-ER-BMED-HFBP-20250210.pdf), [sleep and circadian risk](https://humanresearchroadmap.nasa.gov/evidence/reports/Sleep.pdf), and [distance from Earth](https://www.nasa.gov/hrp/hazard-distance-from-earth/). |
| NASA Office of the Chief Health and Medical Officer. [*NASA Spaceflight Human-System Standard*, NASA-STD-3001 Vol. 1, Rev. C](https://standards.nasa.gov/node/238) (2023) and [Vol. 2, Rev. F](https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2) (2026). | Crew monitoring and CMO context in [Vol. 1 §3](https://www.nasa.gov/reference/3-0-health-and-medical-care/), the career effective-dose limit referenced by the radiation simulator in Vol. 1 §4.8.2, and habitat CO₂ context in Vol. 2, requirement V2 6004. |
| NASA Office of the Chief Health and Medical Officer. [*Carbon Dioxide (CO₂)*, OCHMO-TB-004, Rev. D](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf) (2026). | Cabin-air reference line and context for reviewing reported headaches alongside simulated CO₂. |
| Parker et al. [*Earth-Independent Medical Operations (EIMO) Concept of Operations (ConOps)*](https://ntrs.nasa.gov/citations/20240001402) (2024), NASA Technical Reports Server, document 20240001402. | Onboard decision support and local handoff design under delayed Earth communications. |
| NASA OSDR. [*MSL-RAD-Surface*](docs/real-datasets-and-citations.md#curiosity-radiation-replay), RadLab. Mason et al. (2024). [*Whole Blood Measurements from the SpaceX Inspiration4 Mission*](https://doi.org/10.26030/e0rx-sh52), OSD-569, v4, NASA GeneLab/OSDR. | The two bundled datasets described above. |
| NASA Science / Visualization Technology Applications and Development. [*International Space Station 3D Model*](https://science.nasa.gov/resource/international-space-station-3d-model/). | Source model for the ISS viewer and the visual basis for the simulated compartment map. |

[Full NASA citation catalog, including the vigilance, lighting, exercise, fluid-loading, and EVA references, plus dataset manifests and source limits](docs/real-datasets-and-citations.md)

## Run locally

Use Node.js **22.12 or newer** and a workspace that includes the assistant source files and voice assets. The current working copy contains voice files that are still untracked. A clean checkout of the current commit needs those files before it can build.

```sh
npm ci
npm run build
npm run preview
```

Open [the local preview](http://localhost:4173). To rehearse offline, first wait for **Demo and data → Ready to run offline** in the production browser build. The web speech models load and cache on first use, so exercise recognition and spoken replies while the web host is reachable and the optional voice server is off if you plan to use them offline. Camera and microphone access require localhost or HTTPS and device permission. Foreground “Hey Sol” listening is enabled by default and can be turned off in voice settings. Saved check-in records stay in local app storage. Ground exchange is simulated, and exports are local files.

### Faster voice (optional)

The optional voice server runs recognition and synthesis on the development computer. It defaults to faster-whisper `small.en` and the Piper lessac voice. The setup requires Python 3.10–3.13 and a checkout with the `voice-server/` implementation and Piper model files. [faster-whisper](https://github.com/SYSTRAN/faster-whisper)

```sh
npm run voice:setup     # create the local Python environment and install dependencies
npm run voice:server    # downloads the small.en model the first time, then works offline
```

`npm run dev` and `npm run preview` proxy `/sol-voice/` to the server. When connected, voice requests send microphone audio or text over that route, and the server logs recognized text. Without a reachable server, Sol uses the bundled on-device models when available. `npm run voice:server -- --model base.en` selects the smaller recognition model.

For development, run `npm run dev`. For packaged offline builds, the Capacitor iOS and Android shells include the app and the model files present in the checkout. [Mobile build and device guide](docs/mobile-roadmap.md)

## Development and verification

```sh
npm test
node scripts/nasa/import-radlab.mjs --verify
node scripts/nasa/import-osdr-cbc.mjs --verify
```

The client uses React, TypeScript, Zustand, and Zod, with Vite and Workbox for the web build, three.js for the 3D views, and Capacitor for the native shells. [Architecture and rule flow](docs/TEAM_MISSION_ARCHITECTURE_AND_WORKFLOW.md) · [Sensor bench results and validation scope](docs/validation/README.md) · [3D model integration](docs/3d-model-integration.md)

## Team and license

- **Team** · Ahmed Shacker, Ahmed Sherif, Andrew Sameh, David Michael, Hassan Mohsen, Ziad AbdElhaleem
- **Coach** · Mariam Mohamed
- **Local lead** · Dr. Moatasem Mahran

Project code is [MIT licensed](LICENSE). See the [vendor license](public/vendor/LICENSE), [vendor notices](public/vendor/NOTICE), and [submission credits](docs/submission-handoff.md#credits) for third-party assets and AI-assisted development.
