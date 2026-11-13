# Camera heart-rate validation

Sol Check's camera pulse reading is an estimate. This folder holds the evidence for how close it is, and the kit to collect more.

## 1. Bench test (done): known pulse, three camera speeds

We made test videos from a public-domain NASA astronaut portrait, with the skin colour pulsing at an exact known rate, and played each one as the camera in Chrome. That runs the full pipeline (face detection, the on-device rPPG model, our fine-resolution heart-rate step), not a shortcut.

| True pulse | Camera speed | Camera model alone | Sol Check | Time to result |
|---|---|---|---|---|
| 82 bpm | 24 fps (laptop) | 83–85 | **82** | 15.5 s |
| 67 bpm | 15 fps (dim laptop) | 68 | **67** | 15.5 s |
| 104 bpm | 30 fps (phone) | 105–106 | **104** | 15.5 s |

Data: [`bench-synthetic.csv`](bench-synthetic.csv). Run `node scripts/validate-camera.mjs docs/validation/bench-synthetic.csv`.

What the bench test proves: timing, frame-rate handling and the 4-bpm rounding fix work. What it does not prove: accuracy on real skin with real movement, lighting and breathing. That needs step 2.

## 2. People test (to do before judging): 5–10 people vs a fingertip pulse oximeter

You need: the Sol Check app on the laptop or phone you will demo with, one fingertip pulse oximeter, 5–10 volunteers (ideally a mix of skin tones), about 3 minutes per person.

1. Seat the person facing a lamp or window. Rest 2 minutes.
2. Clip the oximeter on a finger of the hand resting on the table.
3. Start the camera check. When Sol Check shows the result, write down the camera number **and** the oximeter number shown at that moment.
4. Repeat once more per person if time allows (each repeat is a new row).
5. Enter rows in a copy of [`camera-vs-oximeter-template.csv`](camera-vs-oximeter-template.csv), then run:

```sh
node scripts/validate-camera.mjs docs/validation/camera-vs-oximeter.csv
```

The report gives mean absolute error, bias, Bland–Altman 95% limits of agreement and the share within ±3 and ±5 bpm: everything for one slide. The in-app scan log ("Download scan log (JSON)") also works as input once each scan's `referenceBpm` is filled in.

How to read it: fingertip oximeters are themselves accurate to roughly ±2–3 bpm, so a mean error of 2–3 bpm is about as close as any comparison can show. A commonly cited bar for heart-rate meters is ANSI/AAMI EC13: within ±10% or ±5 bpm, whichever is greater.

Report every reading, including failed scans ("couldn't get a clear reading" counts as a result: say how many).

## Microphone checks

- **Heart sounds.** The app filters a 20-second chest recording to 25–400 Hz, suppresses rubbing spikes and looks for a repeating heartbeat in the Shannon-energy envelope. It requires at least three clear 8-second windows with estimates within 8 bpm of one another.
- **Breath sounds.** The app filters a 40-second recording to 100–2500 Hz. It estimates the breathing cycle from the repeating sound pattern and separately counts breath cycles, pairing inhales and exhales where appropriate. Both estimates must agree within 2 breaths/min.
- **Voice.** The app measures pitch movement with YIN, pace from the passage’s 144 syllables and measured speaking time, and the percentage of reading time spent in pauses of at least 250 ms. It checks background noise, clipping, and whether the amount of speech is consistent with a complete reading. The assessment uses the crew member’s median from the previous 14 sols and needs at least five prior readings per marker.

### Direct synthetic tests

All six standard heart fixtures (48, 60, 72, 90, 110 and 140 bpm) and all six standard breath fixtures (8, 12, 15, 18, 22 and 28 breaths/min) matched at the displayed whole-number precision. The standard synthetic voice measured 2.13 semitones of pitch movement, 4.60 syllables/s, and 16.9% time in pauses. The generated reference values were 2.132 semitones, 4.633 syllables/s, and 17.516%, respectively. The tests also cover noise, short captures, and incomplete readings.

```sh
npx vitest run src/features/checkin/audio/micAnalysis.test.ts
```

### Chrome bench

The bench feeds five generated WAVs to Chrome’s fake microphone and drives the production check-in through the visible controls. It reads the numbers from the result cards, exercising recording, signal analysis, quality gates and display. All five fixtures passed in Chrome 157. [Bench CSV](mic-bench.csv)

| Fixture | Reference | Sol Check | Absolute error |
| --- | ---: | ---: | ---: |
| Heart sounds | 58 bpm | 58 bpm | 0 bpm |
| Heart sounds with added noise | 84 bpm | 84 bpm | 0 bpm |
| Breath sounds | 12 breaths/min | 12 breaths/min | 0 breaths/min |
| Breath sounds with equally loud inhales and exhales | 18 breaths/min | 18 breaths/min | 0 breaths/min |
| Voice, pitch movement | 2.13 semitones | 2.13 semitones | 0.00 semitones |
| Voice, speaking pace | 4.63 syllables/s | 4.60 syllables/s | 0.03 syllables/s |
| Voice, time in pauses | 17.52% | 16.9% | 0.62 percentage points |

A separate Chrome run with a 60-syllable partial reading displayed a retry message and withheld all three voice measurements.

```sh
npm run build
node --experimental-strip-types scripts/validate-mic-bench.mjs
```

### People test (pending)

Use the phone or laptop intended for the demo. Record the device, microphone placement, room conditions, each reference and estimate, and any attempt that produces no reading. Use participant IDs and keep the numeric measurements only.

1. **Heart sounds.** With the participant seated and rested, record the fingertip pulse oximeter rate during the same 20-second chest recording. Repeat after repositioning the phone.
2. **Breath sounds.** Have an observer count breaths over the same 40-second recording and multiply the count by 1.5 to get breaths/min. Repeat once with the participant breathing naturally.
3. **Voice.** Ask each participant to read the passage three times at a natural pace, using the same device, room and distance. Compare the three measurements within each person to see how repeatable they are.

Report paired absolute errors and the fraction of attempts that return a number for heart and breath. Report within-person spread and the fraction that return a result for voice.

Synthetic fixtures and the Chrome bench establish performance on generated signals. Real microphones, phone placement, motion and room noise can change the results. The heart check estimates rate only and provides no murmur or disease detection. Voice metrics track changes in reading aloud and have no validated role in depression screening.
