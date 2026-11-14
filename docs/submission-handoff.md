# Sol Check judging and submission guide

Sol Check was built for the 2026 NASA Space Apps astronaut health monitoring challenge. The challenge lists NASA HRP’s **5 Hazards of Human Spaceflight** resource. Sol Check uses its framework in the Hazards explorer and credits it alongside the mission standards and public research datasets. [Official challenge resources](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources) · [NASA sources and provenance](real-datasets-and-citations.md)

## Live demo

From the repository root, run `npm ci`, `npm run build` and `npm run preview`. Open [http://localhost:4173](http://localhost:4173). Use the default **Sol 43, after the storm** scenario. To rehearse without a network connection, first confirm **Ready to run offline** in **Demo and data**.

| Show | What to say |
| --- | --- |
| **Sol check-in → Fill demo readings → Review & save → Save and assess check-in** | Maya has just spent two sols in storm shelter. Her 4.5-hour sleep entry is well below her 7.5-hour personal baseline. With simultaneous sustained declines in sleep and mood, the demo recommends review by the onboard Crew Medical Officer. |
| **Assessment → Why this finding? → CMO console** | The reviewer can trace the finding to readings, the baseline, the rule, and its source. The follow-up queue gives the crew a place to acknowledge findings and document what happens next. |
| **Assessment → Follow-up tasks and ground handoff** | The scenario uses 20 minutes one way and a 40-minute round-trip light-time. Prepare a local summary or download the handoff. The simulator rehearses the delay and verifies an imported JSON payload using a non-cryptographic FNV-1a-32 checksum. |
| **Timeline → Sol 41** | Curiosity’s archived radiation measurements retain the original UTC dates and units. The chart aligns the 11 September 2017 event with the fictional shelter timeline as context. |
| **Demo and data → Tested on real astronaut data** | For 20 day-after-return comparisons from the Inspiration4 study, none fell outside the lab reference ranges. Four exceeded the app’s personal change threshold. Three were back within it on day 45 and the fourth on day 82. Two implausible source entries were excluded from the analysis. |

### Optional stops

- In **Radiation monitor**, switch from a nominal replay to an event. Show the simulated compartment readings, localization, and suggested shelter path.
- In **Hazards → Isolation and confinement**, run and save a vigilance check, save a countermeasure plan, and advance the demo to inspect follow-up on the next sol.
- In **Ask Sol**, use text or voice to ask “How am I doing today?” or draft a check-in. Voice needs microphone permission and the first-use model load in the web build.
- In **Sol check-in**, try the optional camera flow after confirming device permission and a clear signal. Use the seeded values or manual entry if the estimate is unavailable. Review the [sensor validation scope](validation/README.md) before describing accuracy.
- In **Demo and data**, load **Routine sol** to show a sparse glucose baseline or **Bad entry** to show the reversed blood-pressure guard. Use **Reset demo** to restore the default synthetic scenario for the next presenter.

## Spoken pitch

> It’s Sol 43 on Mars. Maya slept four and a half hours after two sols in a storm shelter. If she asks a doctor on Earth what to do, the signal alone takes forty minutes to make the round trip.
>
> Sol Check lets Maya and the onboard crew review her check-in together. It spots repeated changes from her own usual readings, explains which rule fired and why, and keeps follow-up in one place. If the crew needs help from Earth, they can prepare a handoff while still offline.
>
> We also tried the personal-baseline idea on published Inspiration4 blood counts. Four of twenty day-after-return values crossed a personal change threshold even though all twenty were inside the lab’s reference ranges. It’s a small example of what a personal history can reveal.
>
> Sol Check gives us a way to prototype the same workflow for teams in isolated settings on Earth. They can keep recording, reviewing, and preparing handoffs when a connection is out of reach.

## Credits

- **Team** · Ahmed Shacker, Ahmed Sherif, Andrew Sameh, David Michael, Hassan Mohsen, Ziad AbdElhaleem
- **Coach** · Mariam Mohamed
- **Local lead** · Dr. Moatasem Mahran

The team used OpenAI Codex for the initial offline app, local records, baseline logic, and RadLab processing. Google Gemini and Antigravity assisted with camera integration, replay, exports, and browser verification. Anthropic Claude assisted with the flight-console interface, three.js viewer, and measurement guides. These are development credits. The running app’s health rules are deterministic and its local speech models handle transcription and playback.

The team authored the Blender astronaut. NASA / VTAD is credited for the ISS model used as the basis for the viewer. [3D asset integration and credits](3d-model-integration.md) · [NASA and research citations](real-datasets-and-citations.md) · [Vendor license](../public/vendor/LICENSE) · [Vendor notices](../public/vendor/NOTICE)
