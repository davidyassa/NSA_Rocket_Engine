# 3D astronaut model: Blender hand-off

## International Space Station

The dashboard’s **Explore the ISS in 3D** link opens the station viewer in Mission media.
The **Radiation monitor** places simulated CARN sensors, corridors, crew beacons, and
the incident direction on the same 3D model.
[Open the editable Blender scene](../assets/iss/international-space-station.blend) to edit the
station assembly, orbital camera, lighting, or Earth backplate. The scene contains packed textures.

Export the **ISS | NASA VTAD** collection as a binary glTF with **+Y Up** and
**Custom Properties** enabled. Put the result at
`assets/iss/international-space-station.glb`. Keep the GLB below the service worker’s
15 MiB precache limit. The current export uses texture deduplication and mesh quantization.
Preserve the module node names used in `RadiationStationMap.tsx` so the sensor positions
follow the model after re-export. Run `npm run build` to package the model.

Station geometry and textures are from
[NASA Visualization Technology Applications and Development](https://science.nasa.gov/resource/international-space-station-3d-model/).
The orbital scene uses the project's existing Earth imagery and follows the
[Studio Lab reference](https://sketchfab.com/3d-models/international-space-station-iss-b7d40d89fcbd4c998462380545f391b6).

## Dashboard astronaut

The dashboard's 3D view (`src/features/dashboard/CrewBody3D.tsx`) shows exactly one model:
**`assets/astronaut/astronaut_sol_check.glb`**, imported directly by
`src/features/dashboard/twin/astronautViewport.ts`. There is no copy, manifest or
placeholder. If the file cannot load, the dashboard reports the error and keeps the health links available.

## Drop-in steps

1. Export from Blender: **File → Export → glTF 2.0**
   - Format: **glTF Binary (.glb)**
   - Include: **Custom Properties** ✔ (carries `solcheck_domain` tags)
   - Transform: **+Y Up** ✔
   - Geometry: Apply Modifiers ✔, Normals ✔; Compression: **off** (no Draco; the app
     does not ship a Draco decoder, to keep everything self-hosted offline)
   - Materials: Principled BSDF exports as PBR. A gold visor reads best as
     Metallic 1.0, Roughness ≈ 0.1, Base Color ≈ #D9A441.
2. Overwrite `assets/astronaut/astronaut_sol_check.glb` (keep the name) or rerun
   `generate_astronaut.py`, which writes it there.
3. `npm run build`. The service worker precaches `*.glb`, so the model works offline.
   Keep the file **under 15 MB** (precache limit); aim for under 5 MB and about 100k triangles.

The toolbar badge shows the file name once the model has loaded.

## Orientation and scale

- Units do not matter: the host scales the figure to 1.8 m and stands it on the ground.
- The astronaut must **face −Y in Blender** (front view, numpad 1, shows the visor).
  With +Y Up export this becomes +Z in three.js, which faces the default camera.
- The astronaut's **left** side should be on **+X** in Blender.

## Hotspot anchors (6 empties)

Add an **Empty** for each region, placed on or just in front of the suit surface.
Either name it `hotspot_<domain>` exactly, or name it `Hotspot_*` with a custom
property `domain = "<domain>"` (what `generate_astronaut.py` does, e.g.
`Hotspot_Chest_Heart`, domain `cardiovascular`):

| Empty name               | Region  | Routes to                         |
| ------------------------ | ------- | --------------------------------- |
| `hotspot_behavioral`     | Head    | `#/trends?metric=mood`            |
| `hotspot_sleep`          | Visor   | `#/trends?metric=sleep_duration`  |
| `hotspot_cardiovascular` | Chest   | `#/trends?metric=heart_rate`      |
| `hotspot_temperature`    | Torso   | `#/trends?metric=body_temp`       |
| `hotspot_metabolic`      | Abdomen | `#/trends?metric=blood_glucose`   |
| `hotspot_symptoms`       | Limbs   | `#/assessment`                    |

Blender's `.001` suffixes are tolerated. A missing empty falls back to a
bounding-box position (`FALLBACK_ANCHORS` in `src/features/dashboard/twin/hotspots.ts`).

## Clickable suit parts (optional, recommended)

Select a mesh (or its parent) → **Object Properties → Custom Properties → +**:
name `solcheck_domain`, type String, value one of
`behavioral`, `sleep`, `cardiovascular`, `temperature`, `metabolic`, `symptoms`.

Tagged parts highlight in the accent colour on hover or when the matching list row
is focused. A click opens the region's details. Untagged parts are decorative and
still rotate with the model.

## What the host provides

- Orbit by mouse, touch or pen with damping (inertia), pitch limits and no zoom,
  so the dashboard never hijacks page scroll.
- Idle auto-rotation resumes 4 s after interaction. It is off when the OS asks for
  reduced motion and can be paused from the toolbar.
- Double-click or **Reset view** eases back to the framed three-quarter view.
  **Rotate left/right** buttons orbit for keyboard users.
- Camera framing is computed from the model bounds for any aspect ratio.
- Six real `<button class="figure-region-target">` markers are projected onto the
  anchors each frame. They are focusable, show status by icon, colour and label,
  and dim when the anchor is behind the suit. The chest marker pulses at the
  latest heart rate (static ring under reduced motion).
- A HUD pill shows region, reading and status for the hovered or focused region.
- Lighting: warm low sun with soft shadows, cool sky / rust-ground hemisphere
  fill, a cyan rim light, ACES tone mapping and an in-memory room environment
  for PBR reflections (no external HDR files).
- Rendering pauses when the view is off-screen or the tab is hidden. All GPU
  resources are disposed on unmount.
