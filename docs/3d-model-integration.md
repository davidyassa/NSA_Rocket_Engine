# 3D astronaut model: Blender hand-off

The dashboard's 3D view (`src/features/dashboard/CrewBody3D.tsx`) shows exactly one model:
**`assets/astronaut/astronaut_sol_check.glb`**, imported directly by
`src/features/dashboard/twin/astronautViewport.ts`. There is no copy, manifest or
placeholder. If the file cannot load, the dashboard switches to the 2D body map and says why.

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
- If WebGL is unavailable or the context is lost, the figure switches to the
  accessible 2D body map and says why.
