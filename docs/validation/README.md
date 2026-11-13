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
