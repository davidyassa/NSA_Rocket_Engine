# Sol Check build plan

Prepared on 12 November 2026 from the Stage 1 plan and Frozen Design Contract v1. This is a build sequence and verification checklist for the offline Mars crew self-check prototype. The Stage 1 documents remain the source for the product scope and frozen names. The project is on the Space Apps submission track.

## Alexandria schedule and eligibility

Use the latest Alexandria team circular and its agenda for on-site planning. The venue is AASTMT, Abu Qir. All times below are Cairo time. [Venue map](https://maps.app.goo.gl/x1XcewDmoauGUy2DA?g_st=ic)

| Day | Time | Published agenda |
| --- | --- | --- |
| Fri 13 Nov | 11:00–11:45 a.m. | Registration and check-in |
| Fri 13 Nov | 11:45 a.m.–12:15 p.m. | Opening and hackathon launch |
| Fri 13 Nov | 1:15–2:00 p.m. | Rules, judging criteria and submission briefing |
| Sat 14 Nov | 9:00–9:30 a.m. | Participant check-in |
| Sat 14 Nov | 9:30–11:30 a.m. | Final hacking and technical support |
| Sat 14 Nov | 11:30 a.m.–12:30 p.m. | Presentation preparation and pitching coaching |
| Sat 14 Nov | 1:15–2:00 p.m. | Final project review and submission check |
| Sat 14 Nov | 2:00–4:30 p.m. | Presentations and judging |

The team circular asks each team to bring a power strip and arrange its own lodging. Pack food or use the campus cafeteria. Participants must stay on campus during the hackathon and route event questions through their assigned coach.

The local message offers optional advance work of around 50%. For the submission track, confirm through the assigned coach whether the Global Organizing Team approved Alexandria's Friday start and whether the advance-work allowance covers code that will be included in a project eligible for Global Judging. These are two separate confirmations. The participant terms allow a same-week alternative start with prior written approval. The Global Organizing Team warns that working before the applicable start can lead to disqualification. Until the applicable start or early-work permission is confirmed, use the standard Saturday 9:00 a.m. local start for submission code. The global portal opens at that time and lists Sunday, 15 November at 11:59 p.m. local time as its deadline. Plan to have the local submission materials ready for Saturday's 1:15 p.m. review. Confirm pitch length and exact local submission cutoff at the rules briefing. [2026 participant terms](https://www.spaceappschallenge.org/legal/) · [Organizer guidance](https://github.com/nasa/spaceapps/discussions/1827) · [Global submission schedule](https://www.spaceappschallenge.org/2026/)

Before assigning the six workstreams, confirm the roster and review the official challenge's Resources tab when its list appears. The tab gives Friday, 13 November as the release date. The Global Organizing Team says Global Awards eligibility requires using and citing at least one NASA data source listed in that challenge's Resources. Confirm whether RadLab qualifies. If another resource is needed, document how the project actually uses it and record any resulting change to the frozen contract. Assign the local schedule and roster to the team lead, the challenge resources to the evidence owner, and the project form and deployment to the integration owner. The team can assign those roles once the roster is confirmed. [Official challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) · [Organizer guidance](https://github.com/nasa/spaceapps/discussions/1827)

## Build and integration order

| Target | Work | Exit check |
| --- | --- | --- |
| First 30 minutes of approved development | Establish shared schemas, metric metadata, mission time and fixture shapes. Scaffold the static app. Start the RadLab import and source verification in parallel. | Each lane has the contracts it needs to start. |
| Friday development sessions, if the Friday start is approved | Integrate the Sol 43 check-in, local persistence, deterministic assessment and evidence panel first. In parallel, build the NASA archive lane, provenance and reset. | A valid check-in survives reload. Its result opens the rule, supporting inputs and source. The archive shows its original dates and units. |
| Saturday 9:30–11:30 a.m. | Finish integration, run the production demo offline and freeze the build at 11:30. If Saturday is the first approved build window, use the contract's cut order immediately and assemble the core path from parallel lanes. | Check in, inspect why, inspect the NASA archive and reset in one run. Verify which P0 acceptance checks pass. Local preview is the deployment fallback. |
| Saturday 11:30 a.m.–12:30 p.m. | Rehearse the 90-second demo, capture a backup, and assemble the project and demo links, source citations and AI-use disclosure. | A first-time tester can run the demo and identify the source of each series. |
| Saturday 1:15 p.m. | Have the demo and materials ready for local review. | Check submission fields and rehearse the pitch before judging at 2:00 p.m. |

Scheduling decision, 12 November 2026. The Saturday 11:30 a.m. build freeze replaces the hour-24 target so the team can rehearse before the local review. Keep the frozen P0 acceptance checks as the full target. If the build window is too short, protect check-in through the evidence panel, the NASA archive with provenance, synthetic labels and reset. Apply the contract's five-person lane assignment and first two cuts if there are five team members. The official challenge presents the body figure as an example, so it can stay first in P1. [Official challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)

## Planned decisions for the first implementation pass

- Carry forward Stage 1's proposed median over the preceding 14 sols with five distinct measured sols required per metric. Exclude the current sol and future records from its baseline. A sustained finding requires three qualifying readings in the current and previous four sols, with missing sols contributing no qualifying readings. Label all numeric rule parameters as demo heuristics and record them with their tests.
- Preserve original RadLab timestamps and keep the archive-to-sol offset in the display mapping. The source review checked one timestamp against its UTC Unix equivalent. Validate that interpretation during fixture import. Summarize real readings in hourly medians and retain the raw archive rows and retrieval manifest. Keep gaps visible. Show absorbed dose rate in µGy/hour and keep it outside the health escalation logic.
- Present the crew and its history as synthetic, typed check-ins as user-entered, and Curiosity's measurements as NASA archive. The mission shelter event is synthetic. A temporal association can be shown alongside the crew readings, with separate provenance and explicit uncertainty.
- Treat the three escalation tiers as a simulated workflow. The draft quotes recorded readings and symptoms, links to the finding evidence, and shows the simulated 20-minute one-way delay and 40-minute earliest reply. Ground communications stay within the app's simulation.

## Acceptance checks

| Scope | Check |
| --- | --- |
| P0-1 | Enter all six indicators and one symptom in under 60 seconds. Verify measurement help, the blood-pressure pair guard, a missing value and one invalid input. |
| P0-2 | Compare each indicator to its own baseline. Check insufficient history, the exact lookback boundary, a missing sol and separate profiles. |
| P0-3 | Run routine, Sol 43 and bad-entry cases. Open a finding and inspect rule ID, inputs, baseline, review status and source. Confirm the assessment shows “Not a diagnosis.” |
| P0-4 | Open a sourced action card, verify the simulated delay, and confirm the local draft only includes recorded data. |
| P0-5 | Compare the three timeline lanes, inspect RadLab instrument, units, archive date, source and retrieval date, and confirm the September 11 mapping to Sol 41. |
| P0-6 | Verify last and next check-in and open flags. Navigate by keyboard and confirm every status is understandable by label and icon. |
| P0-7 | Run the production hero path with network access disabled. Reload and confirm persistence, then reset and confirm the original Sol 43 fixture returns. Repeat for both backup scenarios. |

The 90-second rehearsal follows Dashboard → Check-in → Assessment and Why → Prepare summary → Timeline provenance → Reset. The expected hero result is four qualifying short-sleep readings in five sols, with the coincident synthetic mission event and archived radiation rise shown in separate timeline lanes.

## Implementation decision log

| ID | Decision | Reason |
| --- | --- | --- |
| D13 | Start the Sol 43 check-in and assessment slice locally on 12 November. This supersedes D11's development timing for this slice. | The project owner confirmed that early development is eligible under the Alexandria allowance. The first slice targets check-in, explanation, the supporting dashboard and a resettable synthetic scenario. |
| D14 | Complete the remaining P0 routes and scenarios and precache the production build with a service worker. | The project owner requested the complete offline demo. The static preview remains the rehearsal entry point. |
| D15 | Complete all five P1 capabilities: interactive 2D body figure (F14), timeline replay (F20), measurement reminders and checklist (F13), local record export (F17), and check-in streak (F15). | Enhances daily crew operational workflow and dashboard accessibility while maintaining scenario isolation, deterministic scoring, and offline reliability. |
| D16 | Approve optional offline Camera pulse check using VitalCamera SDK (v0.6.9) with bundled FacePhys model. | Provides an optional on-device optical pulse estimation entry point beside manual input. Processing is strictly on-device using self-hosted LiteRT/MediaPipe WebAssembly runtimes; requires per-session deliberate consent; video and biometric estimates remain strictly in volatile memory and are excluded from local storage, baseline calculations, records, exports, ground communication drafts, and clinical escalation. |

## Production verification

The Chrome rehearsal loaded the production build at a static subpath, waited for the service worker, then disabled browser networking and stopped the test server. It reloaded from the service worker and ran the Sol 43 check-in, evidence, ground draft and clipboard, all seven metric selections, and RadLab provenance and cached CSV. It then ran the routine and bad-entry scenarios, checked persistence across reload and scenario switching, and reset to the original demo. All six routes fit a 390 px viewport during the offline run. The scripted pass verifies functionality. The 90-second live rehearsal with a first-time participant remains a separate timing check.
