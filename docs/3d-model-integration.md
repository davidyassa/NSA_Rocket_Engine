# 3D model integration

Both viewers use bundled binary glTF files and three.js. Keep each web model within the [15 MiB service-worker precache limit](../vite.config.ts) so it is available after the production web app is cached.

## Dashboard astronaut

The dashboard loads [the astronaut GLB](../assets/astronaut/astronaut_sol_check.glb) directly. Edit the [Blender scene](../assets/astronaut/astronaut_sol_check.blend) or regenerate the procedural suit from the repository root with Blender 4.0 or later. The flags in this example also save the editable scene and render a preview. [Generator](../assets/astronaut/generate_astronaut.py)

```sh
blender -b --python assets/astronaut/generate_astronaut.py -- \
  --output-dir assets/astronaut --save-blend --render
```

For a manual export, use glTF Binary, **+Y Up** and **Custom Properties**. Include normals and apply modifiers as needed. Leave Draco compression off because the viewer uses `GLTFLoader` without a Draco decoder. In Blender, the suit faces −Y and its left side points toward +X. The viewer scales the figure to 1.8 m, grounds it and fits the camera to its bounds. [Viewport implementation](../src/features/dashboard/twin/astronautViewport.ts)

Place an Empty at each region, just outside the suit. Use the listed node name, or a `Hotspot_*` name with a `domain` or `solcheck_domain` property set to the domain. Recognized named anchors take precedence over the fallback positions calculated from the model bounds. Add the same `solcheck_domain` property to a mesh or its parent for clickable suit geometry. [Hotspot contract](../src/features/dashboard/twin/hotspots.ts)

| Node name | Region | Destination |
| --- | --- | --- |
| `hotspot_behavioral` | Head | Mood trends |
| `hotspot_sleep` | Visor | Sleep duration trends |
| `hotspot_cardiovascular` | Chest | Heart rate trends |
| `hotspot_temperature` | Torso | Body temperature trends |
| `hotspot_metabolic` | Abdomen | Blood glucose trends |
| `hotspot_symptoms` | Limbs | Assessment |

On the dashboard, verify all six markers by mouse and keyboard. Check the rotate, zoom and reset controls, the optional auto-rotation, and the health cards when WebGL is unavailable. The marker labels include their reading and status. Scroll-wheel zoom is disabled so the page can scroll normally.

## International Space Station

The ISS viewer in **Demo and data → Mission media** and the **Radiation monitor** use the same [ISS GLB](../assets/iss/international-space-station.glb). The radiation view overlays simulated compartment sensors, corridors, crew locations and incident direction. Its room labels describe the demo spacecraft.

Edit the [Blender scene](../assets/iss/international-space-station.blend), then export the **ISS | NASA VTAD** collection as a binary glTF with **+Y Up** and **Custom Properties** enabled. The checked-in GLB uses `KHR_mesh_quantization`. Preserve the six module node names in `ROOM_ANCHORS` so the radiation overlay can place the sensors and focus the associated compartments. [Room anchors](../src/features/radiation/RadiationStationMap.tsx)

The station model is credited to NASA Visualization Technology Applications and Development. The station presentation references Studio Lab's ISS scene. [NASA Science model](https://science.nasa.gov/resource/international-space-station-3d-model/) · [Studio Lab reference](https://sketchfab.com/3d-models/international-space-station-iss-b7d40d89fcbd4c998462380545f391b6)

After either export, run `npm run build` and preview the app. Confirm the astronaut on Dashboard and the station in both Mission media and Radiation monitor, including navigation from a sensor marker to its compartment.
