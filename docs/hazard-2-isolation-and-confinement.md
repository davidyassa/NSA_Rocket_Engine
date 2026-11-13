# Hazard 2: Isolation and Confinement

- **Sol Check hazard code** `SC-BHP-01`
- **NASA Human Research Program element** Human Factors and Behavioral Performance (HFBP)
- **Associated factors** Circadian disruption, sleep restriction, and sensory monotony

## 1. Hazard Overview

Isolation and confinement are important behavioral health challenges during long-duration space missions. Isolation refers to reduced social interaction with people outside the crew, including family, friends, and the wider community on Earth. Confinement refers to living and working for extended periods in a limited environment with a small group of people.

These conditions can limit social contact and environmental stimulation. Repeated scenery, sounds, and activities can contribute to boredom and reduced engagement. Workload, irregular schedules, and light exposure can also disrupt sleep and its timing. NASA studies these effects in spaceflight and in ground analogs such as NEK and SIRIUS. [NASA hazard overview][hazard] · [NEK and SIRIUS][sirius]

## 2. Mission Status — Sol 43

In Sol Check’s synthetic Mars scenario, mission specialist Maya Chen’s Sol 43 demo check-in follows shelter operations on Sols 41–42. The table uses the baselines calculated by **Assessment** after saving the demo readings.

| Indicator | Sol 43 demo reading | Comparison |
| --- | --- | --- |
| Sleep duration | 4.5 hours | 7.5-hour personal baseline. A decrease of 3.0 hours (40%). |
| Self-reported mood | 2/5 (Low) | Personal baseline of 4/5 (Positive). A decrease of 2 points. |
| Reaction time and lapses | No result on record | The Hazard 2 card recommends a brief vigilance check in **Cognitive Lab**. |

Sleep and mood both met the sustained lower-trend rule on **four of the last five sols** (39, 40, 42, and 43). The combined finding recommends onboard **Crew Medical Officer (CMO)** review. The radiation replay gives the shelter event a timeline reference. The recorded changes began before shelter operations, and the demo data establish neither their cause nor a diagnosis.

## 3. Potential Spaceflight Health and Performance Impacts

- **Neurobehavioral fatigue and sustained attention.** Repeated short sleep and demanding schedules can reduce alertness, slow responses, and increase attention lapses during tasks that require continuous monitoring. [NASA sleep evidence report][sleep] · [ISS reaction-time study][iss-study]
- **Circadian misalignment.** Irregular schedules and shifts in light exposure can make it harder to fall asleep at the scheduled time and stay alert during work periods. [NASA sleep evidence report][sleep]
- **Mood, motivation, and team cohesion.** Limited outside contact and prolonged confinement may contribute to loneliness, boredom, or lower morale. The effects vary by individual and can affect communication and coordination within the crew. [NASA behavioral health evidence report][behavior] · [NEK and SIRIUS][sirius]

## 4. Sol Check Monitoring Indicators

### A. Sleep Duration

**Check-in → Sleep** asks how many hours the crew member actually slept during the last sleep period. The crew member can skip the field when a reading is unavailable. **Dashboard → Recent readings** and **Trends → Sleep duration** show recorded sleep over time. Assessment uses the median of the previous 14 mission sols and requires usable readings on at least five distinct sols. Sol 43 has 14 prior readings, from Sols 29–42.

### B. Mood Score

**Check-in → Mood** records how the crew member feels at the time of the check-in. The app labels the scale **1 Very low, 2 Low, 3 Midpoint, 4 Positive, and 5 Very positive**. Assessment uses the same baseline method as for sleep. The rating is a self-report for tracking changes over time. Clinical interpretation belongs to the medical team.

### C. Reaction Time and Lapses

**Cognitive Lab** offers a three-trial quick mode and a six-trial standard mode. The crew member presses a key or taps as soon as the visual stimulus appears. The session summary displays mean reaction time and the lapse count. Sol Check counts responses of **500 ms or longer** as lapses and compares mean reaction time with a fixed **220 ms** demo reference. Results are visible during the session. A saved personal reaction-time baseline, longitudinal lapse history, and integration with Assessment are proposed additions.

NASA’s ISS Reaction SelfTest used a three-minute Brief Psychomotor Vigilance Test (PVT-B) to measure sustained attention. The published ISS study used a lapse threshold of **355 ms or longer**. Sol Check’s shorter task and scoring are prototype choices. Medical and operational decisions remain with mission authorities. [NASA Reaction SelfTest project][reaction] · [ISS reaction-time study][iss-study]

### D. Supporting Observations

**Check-in → How you feel** includes a fatigue checkbox and the option to report feeling hopeless or unable to cope. Reporting the latter independently recommends immediate CMO review, without waiting for a baseline or trend. Optional camera-estimated heart rate variability (HRV) can add recovery context when a usable estimate is available. Sleep duration, mood, and vigilance remain the primary focus for this hazard.

## 5. Proposed Countermeasures

- **Vigilance checks and sleep follow-up.** The existing Cognitive Lab supports a brief reaction-time check. When the crew member reports fatigue, the Mission Health Action Center creates a **Fatigue & Sleep Hygiene Protocol** task covering rest and a vigilance self-assessment. For flight use, the medical team would select the test protocol, testing schedule, and interpretation criteria. [NASA Reaction SelfTest project][reaction]
- **Structured sleep hygiene.** Protect scheduled sleep opportunities, keep sleep and wake times consistent when operations allow, reduce disturbances, and provide time to wind down. Review persistent deviations with the CMO when considering schedule changes. [NASA astronaut sleep practices][sleep-practices]
- **Dynamic habitat lighting.** Consider appropriately timed blue-enriched white light to support alertness and lower-intensity, blue-depleted light before sleep. Timing, intensity, spectrum, and exposure duration belong in the lighting plan. Implementation requires habitat lighting and a mission schedule. [NASA ISS dynamic lighting project][lighting]
- **Scheduled Earth contact.** Build in regular opportunities to exchange personal messages with family and friends. The Sol 43 scenario models 20 minutes one way, so recorded voice or video and written messages suit the simulated delay. The existing Earth communication screen supports a medical handoff draft and delay rehearsal. Personal messaging and scheduling are proposed mission operations. [NASA behavioral health evidence report][behavior] · [NASA distance-from-Earth hazard][distance]
- **Meaningful activities and sensory variety.** Offer options such as plant care, exercise, reading, creative work, and group recreation according to crew preferences and habitat resources. NASA has studied plant care as a possible source of engagement in confinement. [NASA space gardening research][gardening]

## 6. Sol Check Monitoring and Response Workflow

1. **Collect observations.** On the website, open **Sol check-in**. On the phone layout, tap **Check-in** in the bottom bar. Enter sleep hours and a mood score, add relevant symptoms, and select **Save and assess**. Use **Fill demo readings** to reproduce the Sol 43 values. Select **Fatigue** in **How you feel** to demonstrate the fatigue follow-up task.
2. **Compare with personal baselines.** In **Assessment → Findings → Why this finding?**, open the combined sleep and mood finding to see the baseline, contributing readings, rule, and evidence. The baselines use prior valid measurements and exclude the current sol.
3. **Identify a sustained change.** The lower-trend demo rule requires a usable current reading and at least three readings below the baseline by the relevant delta within the five-sol window, including the current sol. The demo deltas are **1 hour** for sleep and **1 point** for mood. When both metrics meet the lower-trend rule, Assessment recommends CMO review.
4. **Run a vigilance check if indicated.** Open **Cognitive Lab** from the website sidebar or from **More** on the phone layout. Review the session’s reaction time and lapse count. Share the result with the CMO as appropriate. The check-in, Assessment, and ground handoff currently use the saved health observations, while the vigilance summary remains in the lab session.
5. **Review and track the response.** The **Mission Health Action Center** shows the CMO review task and, when fatigue was reported, the rest and self-assessment task. **CMO console** provides the onboard review view. If ground input is needed, **Assessment** provides a draft for the ground flight surgeon and a downloadable handoff package. The prototype simulates communication delays locally.
6. **Review later measurements.** Use **Trends** to inspect the historical sleep and mood series and the Action Center to track task status. The current demo saves edits to the selected scenario’s Sol 43 check-in. Advancing to new sols and comparing saved vigilance sessions over time are proposed follow-up capabilities.

## 7. Scientific Evidence Sources

1. NASA Human Research Program. [Behavioral health evidence report][behavior]. Covers behavioral and cognitive risks, monitoring, and support for exploration crews.
2. NASA Human Research Program. [Sleep loss, circadian desynchronization, and work overload evidence report][sleep]. Covers sleep and circadian factors that affect crew performance.
3. NASA. [ISS Psychomotor Vigilance Self Test project][reaction]. See also [Jones et al., 2022, the ISS study and scoring method][iss-study].
4. NASA. [ISS Dynamic Lighting Schedule][lighting]. Describes the use of different white-light settings for visibility, alertness, and sleep preparation.
5. NASA. [Can Space Gardening Help Astronauts Cope With Isolation?][gardening] May 13, 2021.
6. NASA. [Houston We Have a Podcast, episode 58, Hazard 2: Isolation][podcast]. August 17, 2018.
7. NASA. [About NEK and SIRIUS][sirius]. Describes ground analog research on isolation, confinement, and team dynamics.

[hazard]: https://www.nasa.gov/hrp/hazard-isolation-and-confinement/
[behavior]: https://humanresearchroadmap.nasa.gov/evidence/reports/HRP-ER-BMED-HFBP-20250210.pdf
[sleep]: https://humanresearchroadmap.nasa.gov/evidence/reports/Sleep.pdf
[reaction]: https://techport.nasa.gov/projects/23201
[iss-study]: https://pmc.ncbi.nlm.nih.gov/articles/PMC8919197/
[lighting]: https://techport.nasa.gov/projects/23237
[sleep-practices]: https://www.nasa.gov/missions/station/seven-ways-astronauts-improve-sleep-may-help-you-snooze-better-on-earth/
[distance]: https://www.nasa.gov/hrp/hazard-distance-from-earth/
[gardening]: https://www.nasa.gov/humans-in-space/can-space-gardening-help-astronauts-cope-with-isolation/
[podcast]: https://www.nasa.gov/podcasts/houston-we-have-a-podcast/hazard-2-isolation/
[sirius]: https://www.nasa.gov/about-nek-sirius/
