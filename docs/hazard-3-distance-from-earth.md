# Hazard 3 · Distance from Earth

Open **Distance from Earth** at `#/hazards/distance`. The Sol 43 scenario models **20 minutes one way** and **40 minutes for a round trip before ground review time**. The demonstration focuses on what a crew member can record and review locally during that delay. NASA discusses light-time delay, resupply limits and the need for crew autonomy in its hazard overview and Earth-Independent Medical Operations work. [NASA HRP, *Hazard: Distance From Earth*](https://www.nasa.gov/hrp/hazard-distance-from-earth/) · [Parker et al. (2024), *Earth-Independent Medical Operations (EIMO) Concept of Operations (ConOps)*](https://ntrs.nasa.gov/citations/20240001402)

## Rehearse the workflow

1. In **Sol check-in** (`#/check-in`), select **Fill demo readings**, continue through the steps and save the Sol 43 check-in. The core set is heart rate, systolic and diastolic blood pressure, temperature, glucose, sleep and mood. The eight core symptom options are headache, dizziness, fatigue, nausea, shortness of breath, chest discomfort, digestive discomfort and muscle ache. Later optional fields extend that core.
2. In **Assessment**, expand the combined sleep and mood finding and select **Why this finding?**. Maya Chen's mock readings are 4.5 hours of sleep versus a 7.5-hour baseline and mood 2 out of 5 versus a baseline of 4. Four of the last five sols meet the drop rule on both metrics. The engine recommends onboard Crew Medical Officer review.
3. Review the finding and its follow-up through **CMO console** (`#/cmo`). The CMO role can record a resolution or choose **Request ground review**. The automatic engine selects self-care or onboard review. Ground review is a manual demo action.
4. In **Assessment → Follow-up tasks and ground handoff**, prepare a copyable ground summary or download the JSON handoff and Markdown briefing. Start a local delay rehearsal and, if using JSON, check the exported file against the schema and its FNV-1a-32 value. The rehearsal simulates waiting and the package remains a local draft.

## Interpret the evidence

A personal baseline uses the median of usable readings from the preceding 14 sols and needs observations from at least five distinct sols. A sustained core trend requires a usable current observation and deviations in the same direction on at least three of the most recent five sols. The numerical deltas are demo heuristics. Missing readings and failed data checks have their own status. [Rule definitions](../src/engine/rules.ts)

The synthetic shelter event on Sols 41–42 and the real September 2017 Curiosity replay meet on the same timeline. Sol Check treats the timing as contextual evidence. The archived readings describe the Mars surface near Curiosity, so they cannot establish crew dose or explain a health change. [Curiosity radiation replay](real-datasets-and-citations.md#curiosity-radiation-replay)

NASA's crew health references describe medical care and Crew Medical Officer responsibilities in mission context. Sol Check uses that context for the prototype workflow. Clinical interpretation and treatment decisions belong to qualified personnel. [NASA, *3.0 Health and Medical Care*](https://www.nasa.gov/reference/3-0-health-and-medical-care/) · [NASA-STD-3001 Volume 1, Revision C](https://standards.nasa.gov/node/238)

[المرجع العربي](مرجع-البعد-عن-الأرض-والمراقبة-الصحية-Sol-Check-Contract-v1.md)
