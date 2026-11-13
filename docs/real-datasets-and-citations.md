# Sol Check data and citations

Sol Check uses two public NASA-hosted datasets. The Curiosity archive supplies a historical environmental replay in **Timeline**. The Inspiration4 blood counts support a separate comparison of personal change and laboratory reference intervals in **Demo and data**. The fictional Sol 43 crew, its habitat readings, and the compartment radiation-monitor presets are simulated. The [source registry](../src/content/index.ts) records what each reference supports and where its applicability ends.

## Official NASA references

### Challenge and hazard framework

| Citation | Use in Sol Check |
| --- | --- |
| NASA International Space Apps Challenge (2026). [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/). | Challenge brief for crew self-assessment, visual health indicators, and actionable guidance. |
| NASA Human Research Program (HRP). [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/) and [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/). | Hazard explorer and evidence context. The `SC-…` identifiers belong to Sol Check. |
| NASA HRP. [Human Research Roadmap evidence reports](https://humanresearchroadmap.nasa.gov/evidence/). | Source library for the evidence passport and links between findings and spaceflight risks. |
| NASA HRP. [Hazard: Distance From Earth](https://www.nasa.gov/hrp/hazard-distance-from-earth/). | Context for crew autonomy and communication latency. The Mars scenario uses a fixed 20-minute one-way delay, so the simulated earliest possible signal round trip is 40 minutes before handling time. |
| NASA HRP. [Hazard: Isolation and Confinement](https://www.nasa.gov/hrp/hazard-isolation-and-confinement/). | Context for the sleep, mood, vigilance, and routine-planning demo. |

The [challenge Resources tab](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources) lists the Five Hazards and Risks pages alongside [Ongoing HRP Research in Space](https://www.nasa.gov/hrp/ongoing-hrp-research/). RadLab and OSD-569 are additional open-science sources used by the project.

### Standards, evidence reports, and operations

| Citation | Use in Sol Check |
| --- | --- |
| NASA Office of the Chief Health and Medical Officer (OCHMO). [NASA-STD-3001 Volume 1, Crew Health](https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1), Rev C (2023). | [§3, Health and Medical Care](https://www.nasa.gov/reference/3-0-health-and-medical-care/) identifies Crew Medical Officer and Flight Surgeon roles (V1 3000) and covers sleep, vital signs, and behavioral health monitoring (V1 3003–3004). [§4, Human Performance](https://www.nasa.gov/reference/4-0-human-performance/) places the spaceflight career effective-dose limit below 600 mSv (V1 4030), which informs the radiation simulator. [§6, Medical Operations](https://www.nasa.gov/reference/6-0-medical-operations/) discusses store-and-forward private medical communication when a mission has a delay, in the rationale for V1 6002. |
| NASA OCHMO. [NASA-STD-3001 Volume 2, Human Factors, Habitability, and Environmental Health](https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2), Rev F (2026), and [Carbon Dioxide, OCHMO-TB-004](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf), Rev D (2026). | V2 6004 limits mean one-hour habitat CO₂ partial pressure to 3 mmHg. The app uses 3 mmHg as a reference line for simulated readings and pairs coincident headaches with environmental context. This is a prototype rule applied to simulated readings. |
| Parker, M., Krihak, M., Laing, C., Bardina, J., & Anderson, A. (2024). [Earth-Independent Medical Operations (EIMO) Concept of Operations (ConOps)](https://ntrs.nasa.gov/citations/20240001402). NASA HRP Investigators’ Workshop presentation, NTRS 20240001402. | Informs onboard decision support and the delayed handoff workflow. The export schema and routing rules are project-defined. |
| NASA Human Health and Performance. [Behavioral Health Risk](https://www.nasa.gov/directorates/esdmd/hhp/behavioral-health-risk/). Dev, S. I., et al. (2025). [Evidence Report on Adverse Cognitive or Behavioral Changes and Psychiatric Disorders](https://humanresearchroadmap.nasa.gov/evidence/reports/HRP-ER-BMED-HFBP-20250210.pdf). NASA Johnson Space Center. | Context for isolation and the onboard support card. Mood and voice markers are prototype tracking inputs. |
| Flynn-Evans, E., Gregory, K., Arsintescu, L., & Whitmire, A. (2016). [Evidence Report on Sleep Loss, Circadian Desynchronization, and Work Overload](https://humanresearchroadmap.nasa.gov/evidence/reports/Sleep.pdf). NASA Johnson Space Center. | Context for sleep logging and alertness. |
| NASA TechPort. [Psychomotor Vigilance Test (PVT) on ISS, project 23201](https://techport.nasa.gov/projects/23201) and [ISS Dynamic Lighting Schedule, project 23237](https://techport.nasa.gov/projects/23237). | Precedents for the vigilance demo and lighting planner. Sol Check uses its own interaction and scoring workflow. |
| Fortney, S. M., Seinmann, L., Young, J. A., Hoskin, C. N., & Barrows, L. H. (1994). [Fluid-loading solutions and plasma volume: Astro-ade and salt tablets with water](https://ntrs.nasa.gov/citations/19940019071). NASA-TP-3456. | Historical countermeasure context for the stand-test review card. The study concerns Shuttle-era fluid-loading research. |
| NASA (2025). [Exercise, Research, and Computer Upgrades Keep Crew Busy on Tuesday](https://www.nasa.gov/blogs/spacestation/2025/09/23/exercise-research-and-computer-upgrades-keep-crew-busy-on-tuesday/). | Background for ISS exercise and the app’s exercise log. |
| NASA Johnson Space Center. [Safety Decision Support](https://www.nasa.gov/reference/jsc-safety-decision-support/) and [Risk of Injury and Compromised Performance from Extravehicular Activity (EVA)](https://www.nasa.gov/reference/risk-of-injury-and-compromised-performance-from-extravehicular-activity-eva/). | References linked in Ask Sol for mission planning and EVA risk. |

The [isolation guide](hazard-2-isolation-and-confinement.md) collects NASA’s supporting material on [sleep practices](https://www.nasa.gov/missions/station/seven-ways-astronauts-improve-sleep-may-help-you-snooze-better-on-earth/), [space gardening](https://www.nasa.gov/humans-in-space/can-space-gardening-help-astronauts-cope-with-isolation/), [NEK and SIRIUS analog studies](https://www.nasa.gov/about-nek-sirius/), and the [NASA podcast on isolation](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/hazard-2-isolation/). Sol Check’s alert thresholds, questionnaires, action cards, simulations, and handoff are prototype workflows for evaluation and demonstration. They have no established clinical or flight qualification.

### NASA visual assets

- NASA Visualization Technology Applications and Development (VTAD). (2019). [International Space Station 3D Model](https://science.nasa.gov/resource/international-space-station-3d-model/). The [3D integration guide](3d-model-integration.md) records the packaged station asset and its credits.
- NASA/JPL-Caltech/MSSS. [Curiosity Looks Downslope From the Sulfate Unit](https://science.nasa.gov/photojournal/curiosity-looks-downslope-from-the-sulfate-unit/). Credit for the bundled Gale Crater photograph.

## Curiosity radiation replay

**Dataset citation.** NASA Open Science Data Repository, [RadLab Portal](https://visualization.osdr.nasa.gov/radlab/gui/overview/), Mars Science Laboratory Curiosity Radiation Assessment Detector, [`MSL-RAD-Surface` instrument record](https://visualization.osdr.nasa.gov/radlab/gui/knowledgebase/MSL-RAD-Surface). Absorbed dose rate, September 4–17, 2017. Retrieved November 12, 2026. The latest version listed in the [RadLab release history](https://visualization.osdr.nasa.gov/radlab/gui/knowledgebase/Release_history) is 1.1.2. The import manifest records the query and retrieval date.

- **Input and aggregation.** The [exact NASA API query](https://visualization.osdr.nasa.gov/radlab/api/?instrument=MSL-RAD-Surface&timestamp%3E=2017-09-04&timestamp%3C2017-09-18&absorbed_dose_rate&format=csv) supplies 1,220 readings. The [importer](../scripts/nasa/import-radlab.mjs) retains their original timestamps and calculates 330 UTC hourly medians. Six empty hours remain gaps. The [API reference](https://visualization.osdr.nasa.gov/radlab/gui/data-api/) defines `absorbed_dose_rate` in µGy/hour.
- **Timestamp check.** RadLab accepts ISO and Unix filters. Queries for `2017-09-11T08:01:51` and Unix time `1505116911` return the same row, which records 15.384445 µGy/hour. The import uses UTC for binning. [Timestamp documentation](https://visualization.osdr.nasa.gov/radlab/gui/knowledgebase/timestamp) · [ISO query](https://visualization.osdr.nasa.gov/radlab/api/?instrument=MSL-RAD-Surface&timestamp=2017-09-11T08%3A01%3A51&absorbed_dose_rate&format=csv) · [Unix query](https://visualization.osdr.nasa.gov/radlab/api/?instrument=MSL-RAD-Surface&timestamp=1505116911&absorbed_dose_rate&format=csv)
- **Event context.** The September 11 replay anchor is mapped to fictional Sol 41. The highest raw sample in the imported window was 23.182808 µGy/hour at 15:23:41 UTC. The timeline preserves the recorded units and labels the real archive alongside the simulated shelter event and crew history. The archive measures the rover’s environment. Crew dose, habitat shielding, and individual health effects are outside its scope. [NASA JPL event report, September 29, 2017](https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/) · [Ehresmann et al. (2018), *Geophysical Research Letters*, 45, 5305–5311](https://doi.org/10.1029/2018GL077801)
- **Provenance.** [Raw CSV](../src/data/nasa/msl-rad-surface-2017-09.csv) · [Manifest and hourly fixture](../src/data/nasa/radlab-fixture.json). CSV SHA-256 `b89f828afea5a06a90c9d7ab22c9187ae28523a5fbf7194e4ae24efe9b4ad785`.

## Inspiration4 blood counts

**Dataset citation.** Mason, C. E., Overbey, E. G., Grigorev, K., Nelson, T. M., & Garcia Medina, J. S. (2024). *Whole Blood Measurements from the SpaceX Inspiration4 Mission (RNA-seq, epitranscriptome, WGS, clonal hematopoiesis, CBC).* Version 4, NASA GeneLab, OSD-569, DOI `10.26030/e0rx-sh52`. Sol Check retrieved the complete blood count (CBC) file on November 13, 2026. [NASA OSDR study](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) · [Dataset DOI](https://doi.org/10.26030/e0rx-sh52) · [NASA CSV download](https://osdr.nasa.gov/geode-py/ws/studies/OSD-569/download?source=datamanager&file=LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv)

The [importer](../scripts/nasa/import-osdr-cbc.mjs) selects 140 rows from 553 source rows. They cover four crew members, five analytes, and seven points before launch or after return (`L-92`, `L-44`, `L-3`, `R+1`, `R+45`, `R+82`, `R+194`). The [analysis](../src/data/nasa/inspiration4.ts) builds a separate baseline for each crew member and analyte from the median of at least two eligible preflight samples. Two source values remain visible as plausibility exclusions and are left out of the calculations. Their cause is undetermined.

The CBC explorer uses a reference change value (RCV) of `1.65 × √2 × √(CV_A² + CV_I²)`. It takes within-person variation `CV_I` from the published meta-analysis and models analytical imprecision `CV_A` as half of `CV_I`. The multiplier corresponds to a nominal two-sided 90% threshold under the usual two-measurement model. Here, Sol Check applies it to changes relative to a preflight median as an exploratory screen. This calculation is specific to the CBC explorer. The daily check-in has its own baseline and rule logic. [Coskun et al. (2020, published online 2019), *Clinical Chemistry and Laboratory Medicine*, 58(1), 25–32](https://doi.org/10.1515/cclm-2019-0658) · [EFLM copy](https://www.eflm.eu/upload/docs/2019-ClinChemLabMed-Coskun-et-al.pdf)

| Analyte | Within-person variation | Reference change threshold |
| --- | ---: | ---: |
| Haemoglobin | 2.71% | 7.07% |
| Platelets | 7.10% | 18.52% |
| Total white blood cells | 10.01% | 26.11% |
| Lymphocytes | 10.13% | 26.43% |
| Neutrophils | 13.61% | 35.51% |

**Result.** At the day-after-return visit, all 20 values were within the source lab’s population reference ranges. Four exceeded the prototype’s personal-change threshold, and all four were within their threshold at the next sampled visit, 45 days after return. This illustrates how the two comparisons can surface different signals in a small, short-duration orbital dataset. It does not establish a clinical diagnosis, cause, or accuracy for later missions. [Analysis tests](../src/data/nasa/inspiration4.test.ts) · [Overbey et al. (2024), Inspiration4 biospecimen collection, *Nature Communications*, 15, 4964](https://www.nature.com/articles/s41467-024-48806-z)

**Provenance.** [Raw CSV](../src/data/nasa/osd-569-cbc.csv) · [Manifest and selected rows](../src/data/nasa/inspiration4-cbc.json). CSV SHA-256 `10a878b009eb2ea11a13fe92ad698098858639e8ed02f5ee849431313b9457d3`.

## Supporting measurement research

These references informed the prototype’s measurement methods and review language. See the [validation notes](validation/README.md) for bench results and the scope of testing.

| Method | Reference |
| --- | --- |
| Optical breathing-rate fusion and heart-rate variability | Karlen et al. (2013), [Multiparameter respiratory rate estimation from the photoplethysmogram](https://pubmed.ncbi.nlm.nih.gov/23399950/). Shaffer & Ginsberg (2017), [An Overview of Heart Rate Variability Metrics and Norms](https://pubmed.ncbi.nlm.nih.gov/29034226/). |
| Microphone-based heart and breathing checks | Springer, Tarassenko, & Clifford (2016), [Logistic Regression-HSMM-based Heart Sound Segmentation](https://doi.org/10.1109/TBME.2015.2475278). Nam, Reyes, & Chon (2016), [Estimation of Respiratory Rates Using the Built-in Microphone of a Smartphone or Headset](https://doi.org/10.1109/JBHI.2015.2480838). |
| Speech markers | Low, Bentley, & Ghosh (2020), [Automated assessment of psychiatric disorders using speech](https://doi.org/10.1002/lio2.354). De Cheveigné & Kawahara (2002), [YIN pitch estimator](https://doi.org/10.1121/1.1458024). De Jong & Wempe (2009), [Automatic syllable-nuclei detection](https://doi.org/10.3758/BRM.41.2.385). |
| Stand-test context | Freeman et al. (2011), [Consensus statement on orthostatic hypotension, neurally mediated syncope and postural tachycardia syndrome](https://doi.org/10.1007/s10286-011-0119-5). |
| Vigilance task | Jones et al. (2022), [Sleep deficiency and neurobehavioral performance aboard the ISS](https://pmc.ncbi.nlm.nih.gov/articles/PMC8919197/), *Sleep*, 45(3), zsac006. The app’s three-minute mode uses the paper’s 355 ms lapse threshold. Its shorter modes are demo variants. |
| Nutrition and urinary symptoms | Zwart et al. (2014), [Body mass changes during long-duration spaceflight](https://doi.org/10.3357/ASEM.4005.2014). Pietrzyk et al. (2007), [Renal stone formation among astronauts](https://pubmed.ncbi.nlm.nih.gov/17511294/). |

## Verify the bundled data

From the repository root, rebuild the fixture structures from the bundled CSVs and compare them to the checked-in versions. Both commands work without network access.

```sh
node scripts/nasa/import-radlab.mjs --verify
node scripts/nasa/import-osdr-cbc.mjs --verify
```

Expected summaries are 1,220 raw readings, 330 hourly medians, and 6 empty hours for RadLab, followed by 140 selected rows for OSD-569. These checks establish consistency with the bundled CSVs. To independently compare the source downloads, hash the files returned by the NASA API and OSDR download links and compare them with the SHA-256 values above.
