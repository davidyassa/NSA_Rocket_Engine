# Hazard 2 · Isolation and confinement

Open **Isolation and confinement** at `#/hazards/isolation`. NASA studies how prolonged confinement, limited social contact, sleep disruption and workload may affect crew health and performance, including through isolation analogs. Sol Check illustrates how a crew might track changes and plan follow-up. [NASA HRP, *Hazard: Isolation and Confinement*](https://www.nasa.gov/hrp/hazard-isolation-and-confinement/) · [NASA, *About NEK and SIRIUS*](https://www.nasa.gov/about-nek-sirius/)

## Walk through Sol 43

1. In **Sol check-in**, fill and save the demo readings. Maya Chen records **4.5 hours of sleep** against a **7.5-hour** baseline and **mood 2/5** against a baseline of **4/5**. Sleep and mood meet the lower-trend rule on Sols 39, 40, 42 and 43. The simulated shelter period is Sols 41–42, so some of the documented change precedes shelter operations.
2. Open the combined finding under **Assessment → Findings**, then **Why this finding?**. The app uses the median of the preceding 14 sols, with five distinct measured sols required. A sustained lower trend needs a usable current reading and at least three qualifying sols among the last five. The demo thresholds are a drop of at least one hour for sleep and one point for mood. When both trends qualify, the app recommends onboard medical review. [Rule definitions](../src/engine/rules.ts)
3. In **Cognitive Lab**, run a vigilance check. The **Mission Health Action Center** also creates a sleep and vigilance task when the combined rule fires or fatigue is reported. Review saved results from the hazard screen, Assessment, the CMO console, or Trends. [Vigilance modes and baseline code](../src/features/cognitive/vigilance.ts)
4. Use the hazard page to save a local plan for sleep and wake times, lighting, Earth contact and a meaningful activity. The planner records the choices and completion marks for the simulation. After saving a check-in, **Open next simulated sol** lets you record a new set of readings and optionally copy the previous plan.

## Vigilance scoring

| Mode | Length | Lapse threshold |
| --- | --- | --- |
| Quick | 3 trials | 500 ms |
| Standard | 6 trials | 500 ms |
| Timed | 3 minutes | 355 ms |

Missed responses count as lapses and are excluded from the mean response time. The comparison uses the median of usable same-mode sessions on at least three distinct sols within the preceding 14 sols. The timed mode takes inspiration from the ISS brief psychomotor vigilance task. Sol Check's modes are demonstrations, and results depend on the device and interaction method. [Tu et al. (2021), NASA/TP-20210022966](https://ntrs.nasa.gov/citations/20210022966) · [Jones et al. (2022), *Sleep*, 45(3), zsac006](https://ntrs.nasa.gov/citations/13986557791770)

## NASA evidence for the planner

- The behavioral health and sleep evidence reports provide background for monitoring behavior, sleep and circadian schedules. [NASA HRP, behavioral health evidence report](https://humanresearchroadmap.nasa.gov/evidence/reports/HRP-ER-BMED-HFBP-20250210.pdf) · [NASA HRP, sleep and circadian evidence report](https://humanresearchroadmap.nasa.gov/evidence/reports/Sleep.pdf)
- NASA's astronaut sleep and gardening resources provide examples for the lighting and activity options. [NASA, *Seven Ways Astronauts Improve Sleep*](https://www.nasa.gov/missions/station/seven-ways-astronauts-improve-sleep-may-help-you-snooze-better-on-earth/) · [NASA, *Can Space Gardening Help Astronauts Cope With Isolation?*](https://www.nasa.gov/humans-in-space/can-space-gardening-help-astronauts-cope-with-isolation/)
- The simulated communication delay is consistent with the distance scenario. The planner records contact times and message formats locally. [Distance from Earth workflow](hazard-3-distance-from-earth.md)
