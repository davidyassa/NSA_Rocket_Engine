# Respiratory monitoring: research comparison

Five open implementations were cloned and their **source code** (not only READMEs) inspected on 2026-11-14, before any Sol Check code was written. Nothing from them was copied into Sol Check; the engine in `src/features/respiration/` is written from the published methods. Claims below are labelled:

- **[code]**: read directly in the repository's source;
- **[repo claim]**: stated by the repository and not verified;
- **[ours]**: measured by us (see `RESPIRATORY_VALIDATION_REPORT.md`).

No accuracy figure from any repository is treated as verified.

## 1. Licensing (decides what may be reused)

| Repository | License found | Can code be reused in Sol Check? |
|---|---|---|
| A · wendellr/respiratory_tracking (commit fcd9a8e) | None. README: "intended for educational and experimental use only". | **No.** Ideas only. |
| B · J0R0W/Breathing (4311692) | README: "License: To be determined". No LICENSE file. | **No.** Ideas only, as the brief requires. |
| C · DrKay87/Computer-Vision-Based-Patient-Monitoring (bb5b16c) | MIT. | Yes with attribution. Not needed: no code was taken. Its detector dependency `ultralytics` (YOLOv8) is AGPL-3.0 and was not used. |
| D · phuselab/resPyre (16a5cfc) | GPL-3.0. | **No** for an app that is not GPL. Methods only (methods themselves are not copyrightable). |
| E · Rouast-Labs/vitallens.js 0.5.1 (eedc9e2) | MIT. | Possible, but not needed (see §2.E). |

## 2. Per-repository findings

### A · Classical abdominal optical flow (138 lines of Python)
- **[code]** Manual abdominal ROI (`cv2.selectROI`), Shi–Tomasi corners (`maxCorners=100, qualityLevel=0.3`), pyramidal LK (`winSize 15, maxLevel 2`), mean vertical displacement per frame, FFT peak in 0.1–1.0 Hz after the session ends.
- **Weaknesses [code]:**
  - Lost features are never re-detected (`p0 = p1` keeps failed points), so tracking decays over time.
  - The **mean** displacement lets one bad point skew the signal.
  - Sampling rate is hard-coded (`fs = 30`) rather than taken from timestamps.
  - Features are detected on a brightness-boosted frame but tracked on the unboosted one.
  - No filtering, no quality measure, no movement handling.
- **Kept as ideas:** abdominal ROI; sparse LK as the cheap primary tracker; spectral peak.

### B · Multi-algorithm toolkit (≈3.5 k lines)
- **[code]** Sparse LK, dense Farneback, MediaPipe Pose ROI (shoulders and hips), manual ROI, KCF/CSRT/MOSSE ROI trackers, Butterworth band-pass with `filtfilt`, FFT and peak-based rate.
- **Critical weakness [code]:**
  - The motion value per frame is an **unsigned magnitude**: mean or median of the vector norm, or mean `|dy|`. Even the PCA option takes `mean(abs(...))`.
  - Rectifying a back-and-forth breathing motion creates a strong component at **twice** the breathing frequency, so a 15/min breather can read as 30/min.
  - Timing uses the container's nominal FPS, not per-frame timestamps.
- **Kept:** pose/torso-anchored ROI (we anchor on the face box the app already detects, avoiding a second model); Butterworth band-pass; zero-phase filtering.
- **Rejected:**
  - Signal magnitude, because it loses direction.
  - KCF/CSRT trackers: the torso hardly translates, and a pose model plus a correlation tracker duplicates work.
  - Farneback as a per-frame default, for cost.

### C · Patient monitoring (≈1 k lines)
- **[code]** Pipeline:
  - YOLOv8-L person detection.
  - Bed region via k-means segmentation and PCA rotation.
  - Dense Farneback over the bed; per frame, the **signed median** of vertical flow in the torso box (respiration) and the mean flow magnitude over the bed (gross movement).
  - Centre-of-mass of motion.
  - Derivative-percentile artifact detection (samples set to zero).
  - VMD with K = 10, keeping mode 0 as respiration.
  - Rate = peak count / duration. Sleep epochs come from thresholded movement.
- **Strengths:** signed median (correct direction, robust to outliers); a separate gross-movement channel; explicit artifact step.
- **Weaknesses [code]:**
  - Zeroing artifact samples inserts steps into the signal.
  - "Mode 0 of VMD is respiration" is an assumption with no check.
  - Peak counting without a quality gate.
  - YOLOv8-L and AGPL licensing are unsuitable on device.
- **Kept:**
  - Signed median displacement.
  - Gross-movement detection as a separate test that **holds** the position (no steps) and excludes the interval.
  - The idea that movement intervals feed sleep and activity monitoring.
- **Rejected:** VMD (iterative, K and α tuning, mode-selection ambiguity; band-pass plus three-way consensus covers the need); YOLO.

### D · resPyre (research framework, GPL-3)
- **[code]** Motion methods:
  - `OF`: Farneback, median vertical flow (Lin et al.).
  - `DoF`: a count of pixels with |Δ| > 100.
  - `profile1D`: row profile = mean + std per row, differentiated, cross-correlated between frames, interpolated ×100 (Bartula et al.).
- **[code]** Also:
  - rPPG-derived respiration through the RIIV/RIAV/RIFV (intensity, amplitude and frequency variation of the pulse), EMD and SSA.
  - Deep models (MTTS-CAN, BigSmall).
  - Windowed Welch spectrum in 0.1–0.4/0.5 Hz, 2nd-order Butterworth.
  - Error metrics: MAE, RMSE, MAPE, PCC (Pearson correlation) and CCC (concordance correlation).
- **Observations [code]:**
  - `DoF` counts any change, so it measures motion energy, not breathing direction.
  - `profile1D` does not subtract the zero-lag offset (harmless after filtering).
- **Kept:**
  - The 1D-profile idea, reimplemented as our low-texture fallback. Ours uses a differentiated row profile, a normalized-correlation lag with parabolic refinement, and rejects edge-of-search lags.
  - Frame difference as a motion-energy cue only (`differenceEnergy`).
  - The evaluation methodology: MAE, RMSE, MAPE, plus Bland-Altman agreement and coverage (added by us).
- **Rejected:**
  - Deep models: offline inference size, no on-device need demonstrated.
  - EMD and SSA: costly, and they add parameters without a measured benefit here.

### E · vitallens.js (browser rPPG, MIT)
- **[code]** Local methods `pos`, `chrom` and `g` (`methodsConfig.ts`):
  - They declare `supportedVitals: ['ppg_waveform', 'heart_rate']` only.
  - They use **48- or 64-frame windows** (≈1.6–2.1 s at 30 fps).
  - Respiratory rate exists only through the VitalLens API (`https://api.rouast.com/vitallens-v3/...`, API key).
- **Consequences:**
  - The local path does **not** provide breathing rate.
  - Its windows are far shorter than a breath cycle (≥ 10–30 s needed).
  - The API path would send astronaut video to a third party, which is excluded.
- **Kept:** the conclusion that face rPPG is a *complementary* breathing source.
- **Sol Check already has a better local path** (`src/features/checkin/breathingRate.ts`, `bvpBreathingRate.ts`): it derives breathing from the camera pulse wave's baseline, amplitude and beat-interval modulation, with its own agreement rule. We reuse it as the face-pulse source instead of adding POS or CHROM.

## 3. Algorithm comparison

Complexity is per frame for an ROI of *N* pixels with *k* tracked points and window *w*.

| Algorithm | Basis | Cost | Body movement | Lighting change | Camera motion | Low texture | Offline | Decision |
|---|---|---|---|---|---|---|---|---|
| Sparse LK (pyramidal) + FB check | Brightness constancy, least squares over a window | O(k·w²·iters) | Detectable (median, consistency) | Robust (gradients) | Needs compensation | Fails (aperture) | Yes | **Primary** |
| Shi–Tomasi corners | Min eigenvalue of structure tensor | O(N·w²) at reseed | — | Robust | — | Signals failure | Yes | **Used** (with an absolute texture floor) |
| Farneback dense flow | Polynomial expansion | O(N·levels·iters), ≫ LK | Good | Robust | Needs compensation | Better than LK | Yes (OpenCV not in app) | Rejected for cost; profile fallback covers low texture |
| 1D row-profile correlation | Cross-correlation of row means | O(N + rows·lags) | Weak | Derivative removes offsets | Needs compensation | **Works on stripes** | Yes | **Fallback** and enhanced-mode source |
| Frame difference | Pixel change | O(N) | Measures it | Sensitive | Sensitive | — | Yes | Motion-energy cue only |
| Pose landmarks (MediaPipe) | CNN | Model inference | Re-anchors ROI | Model-dependent | — | — | Yes (WASM ships) | Not needed: the existing face box anchors the ROI |
| Butterworth band-pass (zero-phase) | IIR, forward–backward | O(n) | — | — | — | — | Yes | **Used** (0.1–0.7 Hz; 0.05–2 Hz for timing) |
| Spectrum (Hann, fine grid) | DFT | O(n·bins) | Artifacts spread energy | — | — | — | Yes | **Used** |
| Autocorrelation | Periodicity | O(n·lags) | — | — | — | — | Yes | **Used** (first strong peak) |
| Hysteresis cycle detection | Zero-crossing extrema | O(n) | Blocked intervals skipped | — | — | — | Yes | **Used** |
| VMD / EMD / SSA | Decomposition | Iterative, high | Can separate | — | — | — | Yes | Rejected (no measured benefit, tuning, cost) |
| POS / CHROM rPPG | Skin-colour projection | O(face pixels) | Sensitive | Sensitive | Sensitive | — | Yes | Not added: the existing face-pulse breathing estimator is reused |

Expected failure modes and their mitigations:
- **Loose or flat clothing:** gives a weak or no signal; rejected by the texture and SNR gates.
- **Talking and posture shifts:** caught by artifact gating.
- **Backlight:** caught by the video gate.
- **Paradoxical breathing:** chest and abdomen in anti-phase; rates still agree, and timing comes from the best region.
- **A completely still person:** no signal; rejected (0 false reports in 90 negative runs [ours]).
