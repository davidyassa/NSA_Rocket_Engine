# Hazard 1 · Space radiation

Open **Radiation monitor** at `#/hazards/radiation` to explore an offline simulation of a spacecraft radiation event. The app overlays six fictional transit compartments on NASA's ISS model. The markers, sensor readings, crew dose histories and shelter location are simulation data. [NASA Science, International Space Station 3D Model](https://science.nasa.gov/resource/international-space-station-3d-model/)

## Read the map

Each compartment shows radiation dose rate (mSv/h), temperature (°C) and CO₂ (mmHg). The map calculates a separate mean for each metric across the valid, recent readings and shows the number of reporting compartments. Its radiation alert uses the highest available dose rate. Radiation above **2.1 mSv/h** triggers the map's event alert even at flat temperature. Temperature rise may corroborate a simulated event. Elevated CO₂ triggers an independent air-quality watch.

The first-hit display uses timestamps of qualifying rises to group the earliest affected rooms. Where that pattern supports a sector estimate, the map projects incoming-wave markers onto the 3D view. Ambiguous patterns show **Direction uncertain**. The sector is a spatial heuristic for the demonstration. A separate detail panel summarizes the highest-reading compartment and its assigned direction.

Select **Green**, **Yellow**, **Orange**, **Red** or **Recovery** to compare conditions. Use **Aft event**, **Rad-only**, **Diffuse**, **CO₂ only** or **Sensor gap** to test the map's behavior. **Replay**, **Step** and **Reset** navigate recorded fixture frames. The optional audio alert can be acknowledged while the visual alert remains visible.

## Explore the crew response

The simulation sums each fictional crew member's daily doses and adds a pre-mission value to derive a career total. The **600 mSv** comparison value comes from NASA-STD-3001 Volume 1, Revision C, requirement V1 4030, which specifies a career effective dose from spaceflight radiation below 600 mSv. The demo's 25%, 50% and 75% warning bands, its 105 and 250 mSv rolling-dose thresholds, room-rate thresholds, and compartment restrictions are project simulation parameters. [NASA Office of the Chief Health and Medical Officer, NASA-STD-3001 Volume 1, Revision C](https://standards.nasa.gov/node/238)

- **Room access** evaluates the selected crew member's remaining budgets, a simulated eight-hour shift and high-dose compartments. It also flags a fictional location beacon in a restricted room.
- **Route to shelter** uses a fixed compartment graph and penalizes high-dose rooms. The estimate assumes one minute per room and can include high-dose rooms when the available graph requires it. Some detail panels use nominal simulation defaults when a reading is missing.
- **Recovery** presents a six-hour stabilization example and mock 24-hour and 48-hour check items. These are rehearsal controls. They do not operate spacecraft systems or collect lab results.

The monitor's displayed response text and thresholds are simulation material for software evaluation. For the referenced operational standards, see the [source register](real-datasets-and-citations.md#official-nasa-references).

## Compare with the real Mars archive

**Timeline** separately replays Curiosity's archived Mars surface absorbed dose rate in **µGy/h**. The archive supplies environmental context for Sol 41 of the fictional mission. The simulation's spacecraft mSv/h and crew mSv values come from different data and describe different quantities. [Curiosity radiation replay and provenance](real-datasets-and-citations.md#curiosity-radiation-replay)

Implementation and tests are in [the radiation feature](../src/features/radiation/).
