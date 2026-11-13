# Sol Check validation

The repository includes automated software tests and controlled camera and microphone bench results. These checks exercise specific inputs and workflows. Accuracy and repeatability on people and on physical devices still need to be measured.

## Camera pulse check

The recorded Chrome bench played synthetic videos as its camera input. The videos varied facial colour at a known pulse rate to exercise face detection, on-device remote photoplethysmography (rPPG) and Sol Check's finer-resolution rate estimate. The three checked-in results matched their programmed rates at displayed precision. The original stimulus videos and generator are absent from the repository. [Bench results](bench-synthetic.csv)

| Programmed pulse | Video frame rate | Sol Check |
| ---: | ---: | ---: |
| 82 bpm | 24 fps | 82 bpm |
| 67 bpm | 15 fps | 67 bpm |
| 104 bpm | 30 fps | 104 bpm |

Recalculate the agreement statistics from the recorded pairs with the [camera validation script](../../scripts/validate-camera.mjs).

```sh
node scripts/validate-camera.mjs docs/validation/bench-synthetic.csv
```

The script reports mean absolute error, bias, Bland–Altman limits of agreement and the proportion of paired readings within ±3 and ±5 bpm. The CSV covers pulse only. It supplies no validation results for the camera breathing and heart rate variability estimates.

### Device comparison protocol

For an exploratory comparison, record a fingertip pulse oximeter reading during the same measurement window as the Sol Check camera estimate. Start seated after two minutes of rest, facing steady light. Repeat the capture and note the device and lighting. Use participant IDs and preserve the total number of attempts, including attempts with no estimate. Keep that count outside the script's paired-error metrics.

Copy the [paired-reading CSV template](camera-vs-oximeter-template.csv), remove its example rows, and include only rows with numeric values in both columns. Blank CSV values are read as zero by the script. Use at least two complete pairs. Alternatively, download the in-app pulse scan log after accepting an estimate and fill in each matching `referenceBpm` before running the script on the JSON file. [Scan log implementation](../../src/features/checkin/CameraPulseCheck.tsx)

```sh
node scripts/validate-camera.mjs docs/validation/camera-vs-oximeter.csv
```

## Microphone capture

The current check-in exposes a read-aloud voice check on the Mood page. It estimates pitch variation, articulation rate and time spent in pauses from a fixed 144-syllable passage. It checks for background noise, clipping and an incomplete reading. The assessment compares each marker with at least five prior readings in the preceding 14 sols and uses the results for personal trend review. [Voice analysis](../../src/features/checkin/audio/voiceAnalysis.ts) · [Assessment rule](../../src/engine/rules.ts)

The code retains two experimental microphone analyzers. One looks for repeating heart sounds in a 20-second recording, suppressing friction spikes and comparing short windows. The other uses a repeating sound pattern and a breath-cycle count from a 40-second recording, with agreement within 2 breaths per minute required. The current check-in offers camera capture and manual entry for these rates. [Heart-sound analysis](../../src/features/checkin/audio/heartSound.ts) · [Breath-sound analysis](../../src/features/checkin/audio/breathSound.ts)

### Generated-signal results

The [unit tests](../../src/features/checkin/audio/micAnalysis.test.ts) exercise synthetic heart and breath rates, voice metrics, noise rejection and incomplete readings. An earlier [Chrome bench](../../scripts/validate-mic-bench.mjs) sent generated WAVs through the microphone capture and result screens for all three modes. The checked-in CSV preserves that run. A rerun of the current build reproduced the voice row and timed out on the four heart and breath cases because their microphone controls are absent. [Archived Chrome results](mic-bench.csv)

| Test | Expected | Recorded |
| --- | ---: | ---: |
| Heart sounds | 58 and 84 bpm | 58 and 84 bpm |
| Breath sounds | 12 and 18 breaths/min | 12 and 18 breaths/min |
| Voice pitch variation | 2.13 semitones | 2.13 semitones |
| Voice articulation rate | 4.63 syllables/s | 4.60 syllables/s |
| Voice pause time | 17.52% | 16.9% |

Run the unit tests from the repository root.

```sh
npx vitest run src/features/checkin/audio/micAnalysis.test.ts
```

### Device comparison protocol

Repeat the voice passage three times with the same device, distance and room conditions. Report each participant's within-person spread and the fraction of attempts with a result. Keep numeric measurements under participant IDs and omit raw audio.

## App interaction checks

- Open the main routes at a 320 px viewport. Check the Assessment header for overflow and verify that charts scroll inside their containers when needed.
- Switch metrics on Dashboard and open the matching Trends view. Save a synthetic Sol 43 check-in and check that both Assessment and Dashboard reflect it.
- Open Mission media, switch gallery categories, and navigate the image viewer by keyboard. Escape should close the viewer and restore focus.
- Use Push to Talk or the Ask Sol text field with “Record pulse 82 bpm, blood pressure 118 over 76, and sleep six and a half hours.” Confirm the values in **Review & save** and verify that the check-in is created only after explicitly saving it. [Command handling](../../src/features/assistant/checkinCommands.ts) · [Check-in form](../../src/features/checkin/Checkin.tsx)
- Open the production web build, wait for offline readiness, then disconnect and reload. Check the saved record, evidence links within the app and the RadLab chart. See the [mobile guide](../mobile-roadmap.md#device-checks) for physical-device checks.
