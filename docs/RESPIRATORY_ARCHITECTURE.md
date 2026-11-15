# Respiratory monitoring engine: architecture

Code: `src/features/respiration/`. Everything runs on the device, in the browser or the native shell. It needs no network, no model download beyond the camera pulse models the app already ships, and no new dependency.

## Data flow

```
camera (one stream, 640×480) ──┬─▶ VitalCameraService (existing) ─▶ face box ─▶ roi.ts: chest/abdomen regions
                               │                                  └▶ pulse wave ─▶ bvpBreathingRate.ts ─▶ face-pulse source
                               └─▶ RespiratoryMonitor: frame → canvas at working width → toGray
                                       │
                                       ▼  engine.ts (per frame, real timestamp)
   video stats ─ camera motion (LK on background strips) ─ per region: LK + FB check
       → signed median dy (− camera dy) │ too few or disagreeing points → 1D profile shift
       → artifact test (speed > robust median + 6·MAD, sideways motion, camera shake; 1-frame spikes dropped)
       → position = −Σdy (held still during artifacts)
                                       │
                                       ▼  on demand (≈1 Hz)
   per source: resample 10 Hz (gaps flagged) → detrend → Butterworth 0.1–0.7 Hz (zero phase)
       → spectrum + autocorrelation + cycles (re-timed on 0.05–2 Hz) → rate + internal spread
       → quality.ts (video / ROI / tracking / signal) → fusion.ts → metrics.ts → RespiratoryResult
```

## Components

| Module | Responsibility |
|---|---|
| `vision.ts` | Grayscale, Shi–Tomasi corners with an absolute texture floor, pyramidal Lucas–Kanade, forward–backward check (0.5 px), 1D profile shift, frame-difference energy. |
| `roi.ts` | Chest and abdomen regions from the face box (chest 0.75 face-heights below the face centre, 2.2 face-widths wide); manual drag on the mirrored preview; defaults. |
| `engine.ts` | Streaming per-frame processing, camera-motion compensation, artifact gating, integration, analysis, source assembly. |
| `dsp.ts` | Resampling with gap flags, detrend, zero-phase Butterworth, spectrum, autocorrelation, hysteresis cycles, cycle re-timing. |
| `quality.ts` | Independent indicators and hard gates. |
| `fusion.ts` | Confidence-weighted, agreement-based fusion. |
| `metrics.ts` | Respiratory metrics with observed, estimated or unavailable status. |
| `RespiratoryMonitor.tsx` | Camera, preview with regions and points, live waveform, quality chips, strategy line, dashboard, accept button. |
| `synthetic.ts`, `*.test.ts` | Deterministic ground-truth video and the validation suite. |

## Key design decisions

1. **Signed displacement, integrated.** Per frame, the engine takes the signed median vertical displacement (not a magnitude) and builds position as −Σdy, so up is positive. This keeps one sample per breath direction, avoiding repository B's frequency doubling, and gives a waveform whose peaks are end-inspiration.
2. **Robust tracking.**
   - The median, not the mean, of the tracked points.
   - The forward–backward check removes points that slid or were occluded.
   - Points are reseeded when fewer than half survive, or every 4 s.
   - Corners need a minimum eigenvalue of 4 per window pixel, so stripes and folds, where LK's sideways component is noise, are not tracked.
   - A frame whose points disagree (fewer than 50 % within 0.3 px of the median) uses the profile fallback instead.
3. **Camera motion.** The median displacement of background strips at the frame edges is subtracted from torso motion. Large shake counts as an artifact.
4. **Artifacts.** The test uses speed in px/s (frame-rate independent): above max(4 px/s, median + 6·MAD of recent breathing speed), or sideways motion. The interval is excluded and the position held, never zeroed. A single-frame spike is treated as a tracking glitch and dropped. The region follows the body after a real move.
5. **Three readings of one signal.** Each source's rate comes from the spectrum (Hann window, 0.005 Hz grid, parabolic interpolation), cross-checked against autocorrelation (first strong peak) and the median cycle length.
   - When autocorrelation and cycles agree with each other but the spectrum does not (a harmonic), the time-domain reading wins.
   - Their spread is a quality input and a **hard cap**: a spread over 3 breaths/min makes the source POOR. This is what removed the random-walk false positives.
6. **Timing on a wider band.** Breaths are found on the 0.1–0.7 Hz signal but timed on a 0.05–2 Hz signal. A 0.7 Hz low-pass removes the harmonics that make inspiration and expiration differ, which made I:E read 1:1 at fast rates before this change.

## Fusion methodology (`fusion.ts`)

1. Only sources rated at least ACCEPTABLE vote.
2. Rates agree within max(2 breaths/min, 10 %).
3. A face-pulse rate about twice a torso rate is rejected as a harmonic.
4. Weight is **one vote per modality**: chest and abdomen share the same camera motion, so together they count once (best quality + 0.1 × the second). The face pulse carries a prior of 0.8 because it is an indirect breathing signal.
5. If the second-strongest cluster has at least ⅔ of the winner's weight, the sources genuinely disagree. **No rate is returned**, and the result names the disagreeing sources, e.g. "Chest motion 14 vs Face pulse 20". Rates are never averaged across clusters.
6. Otherwise the rate is the quality-weighted mean of the winning cluster. Agreement between independent modalities adds 0.1 to confidence. Outvoted sources are listed with reasons.

## Quality methodology (`quality.ts`)

Separate indicators, each GOOD, ACCEPTABLE, POOR or INSUFFICIENT, with reasons:

| Indicator | Inputs | Hard caps |
|---|---|---|
| Video | Brightness 35–225, contrast, fps ≥ 8, frame-interval CV, gap fraction | Too dark or bright, or < 8 fps → POOR |
| ROI | Size (≥ 600 px at 192-px scale), texture (corners found / max), share in frame | < half the minimum size → INSUFFICIENT |
| Tracking | Flow vs profile vs dropped frames, kept-point ratio, FB error, motion consistency | Coverage < 60 % → INSUFFICIENT |
| Signal | Duration, SNR (peak + harmonic vs rest of band), spectral prominence, autocorrelation strength, artifact fraction, cycles, internal spread | < 20 s, < 3 cycles or > 40 % artifacts → INSUFFICIENT; SNR < 0 dB or spread > 3/min → POOR |
| Final | Weighted min/mean of the stages used, plus fusion confidence | Never better than the weakest used stage |

Only GOOD or ACCEPTABLE produce a rate the check-in can accept. These are **engineering thresholds** for this pipeline, checked on synthetic ground truth; they are not clinical.

## Metrics (`metrics.ts`)

| Metric | Definition | Minimum | Kind |
|---|---|---|---|
| Respiratory rate | Fused rate | Final ≥ ACCEPTABLE | Observed |
| Cycle duration | Median(end − start) of clean cycles | 3 cycles | Observed |
| Inspiration / expiration | Median(peak − start) / median(end − peak) | 3 | Estimated (assumes a frontal torso view) |
| I:E ratio | Median(Ti/Te) | 3 | Estimated |
| Regularity | CV of cycle duration, % (lower = more regular) | 5 | Observed |
| Variability | SD of breath-by-breath rate | 5 | Observed |
| Chest / abdomen amplitude | Median excursion / region height × 100 | 3 per region | Estimated, relative only |

Timing metrics come only from a torso source that the fusion used. If only the face pulse was usable, they are marked **unavailable**. Nothing claims tidal volume, lung capacity, SpO₂ or a diagnosis.

## Integration with Sol Check

- **Check-in, Breath rate page:** the monitor replaces the face-only breathing scan. Accepting writes `respiratory_rate` through the existing `MeasurementCapture` interface (`source: camera_estimate`, `signalQuality`, `algorithm`), so the existing rules apply unchanged: breathing range 12–20 and baseline delta.
- **Unchanged:** sleep (self-reported `sleep_duration`), the isolation hazard and cognitive monitoring are untouched. The respiratory module depends only on the camera service and the existing pulse-breathing estimator.
- **Not added:** no new health score, metric ID or rule. The session-level metrics (I:E, regularity, amplitude) are shown in the monitor and not persisted, because the data contract has no field for them; adding one is a product decision. Sleep and breathing correlations are not interpreted.

## Processing profiles

| Profile | Width | Regions | Notes |
|---|---|---|---|
| lightweight | 128 px | Chest | Lowest cost |
| standard (default) | 192 px | Chest + abdomen | Profile fallback on low texture |
| enhanced | 256 px | Chest + abdomen | Adds a continuous 1D-profile chest source to the fusion |

Measured costs are in the validation report. No embedded-device claims are made; only an Apple M4 was measured.

## Privacy

Frames are downscaled in memory, processed and discarded. No video, image or face point is stored or sent. The VitalLens API, or any other remote service, is not used.
