/**
 * Hybrid respiratory monitoring engine (streaming, pure TypeScript, offline).
 *
 * Per frame (grayscale at the profile's working width, with its real timestamp):
 *   1. Video quality: brightness, contrast, frame timing.
 *   2. Camera motion: sparse LK on background strips at the frame edges; their median
 *      displacement is subtracted from torso motion (and large shake is an artifact).
 *   3. Torso motion per region: pyramidal LK on Shi–Tomasi corners with a
 *      forward–backward check → signed median vertical displacement. If too few points
 *      survive, the 1D row-profile shift is used for that frame instead.
 *   4. Artifacts: displacement far above the recent breathing motion (robust median +
 *      6·MAD) or strong sideways motion is body movement; the position is held still
 *      and the interval is excluded from cycles and metrics.
 *   5. Integration: chest position = −Σ dy (up is positive), per region.
 * On demand: each region's position is resampled, band-passed and read three ways
 * (spectrum, autocorrelation, cycle count); the region's quality comes from its own
 * signal and tracking; sources (incl. the face-pulse estimate) are fused.
 */
import { autocorrelation, bandpass, cycles as findCycles, detrend, mad, median, resample, retime, spectrum, type Cycle, type Sample } from './dsp';
import { fuse } from './fusion';
import { respiratoryMetrics } from './metrics';
import { finalQuality, roiQuality, signalQuality, stateFor, trackingQuality, videoQuality, worst } from './quality';
import type { NormRect, ProcessingProfile, QualityIndicator, RegionKind, RespiratoryResult, SourceEstimate, Strategy } from './types';
import { PROFILES } from './types';
import { corners, profileShift, pyramid, regionStats, trackPoints, type Gray, type Point, type Pyramid, type Rect } from './vision';

export const ALGORITHM = 'Torso motion: pyramidal Lucas–Kanade (forward–backward checked) with 1D-profile fallback, camera-motion compensation, artifact gating, 0.1–0.7 Hz zero-phase Butterworth, spectral/autocorrelation/cycle consensus; fused with face-pulse breathing only when they agree · on-device';

const MIN_POINTS = 6;
const RESEED_MS = 4000;
const ANALYSIS_WINDOW_MS = 60_000;
const ARTIFACT_BEFORE_MS = 300;
const ARTIFACT_AFTER_MS = 1000;

interface Channel {
  kind: RegionKind | 'background';
  rect: Rect;
  points: Point[];
  lastSeed: number;
  texture: number;
  samples: Sample[];
  pos: number;
  frames: number; flow: number; profile: number; dropped: number;
  kept: number; attempted: number; fb: number; fbCount: number; consistency: number; consistencyCount: number;
}

export interface PulseInput { brpm: number; quality: number; seconds: number }

export interface LiveState {
  durationS: number;
  brpm: number | null;
  quality: RespiratoryResult['quality'];
  strategy: Strategy;
  waveform: RespiratoryResult['waveform'];
  sources: SourceEstimate[];
  points: { kind: RegionKind; x: number; y: number }[];
  regions: Partial<Record<RegionKind, Rect>>;
  width: number; height: number;
}

const toRect = (r: NormRect, w: number, h: number): Rect => ({ x: r.x * w, y: r.y * h, w: r.w * w, h: r.h * h });
const inFrame = (r: NormRect) => {
  const x0 = Math.max(0, r.x); const y0 = Math.max(0, r.y);
  const x1 = Math.min(1, r.x + r.w); const y1 = Math.min(1, r.y + r.h);
  return r.w > 0 && r.h > 0 ? Math.max(0, x1 - x0) * Math.max(0, y1 - y0) / (r.w * r.h) : 0;
};
const clampRect = (r: Rect, w: number, h: number): Rect => {
  const x = Math.max(0, Math.min(w - 4, r.x)); const y = Math.max(0, Math.min(h - 4, r.y));
  return { x, y, w: Math.max(4, Math.min(w - x, r.w)), h: Math.max(4, Math.min(h - y, r.h)) };
};

export class RespiratoryEngine {
  readonly profile: ProcessingProfile;
  private cfg: (typeof PROFILES)[ProcessingProfile];
  private width = 0;
  private height = 0;
  private regions: Partial<Record<RegionKind, NormRect>> = {};
  private anchored = false;
  private channels: Channel[] = [];
  private background: Channel[] = [];
  private profileSamples: Sample[] = [];
  private profilePos = 0;
  private prev: { gray: Gray; pyr: Pyramid; t: number } | null = null;
  private startT: number | null = null;
  private intervals: number[] = [];
  private brightness: number[] = [];
  private contrast: number[] = [];
  private gaps = 0;
  private artifacts: [number, number][] = [];
  private motionHistory: number[] = [];
  private spikes = 0;
  private cameraCompensated = 0;
  private lastArtifactAt = -Infinity;
  private pulse: PulseInput | null = null;
  private pulseState: Strategy['pulse'] = 'unavailable';

  constructor(profile: ProcessingProfile = 'standard') {
    this.profile = profile;
    this.cfg = PROFILES[profile];
  }

  get workingWidth() { return this.cfg.width; }

  /** Torso regions in frame fractions. `anchored` = placed from the detected face. */
  setRegions(regions: Partial<Record<RegionKind, NormRect>>, anchored = false, t?: number) {
    const moved = this.channels.some((c) => {
      const r = regions[c.kind as RegionKind];
      const old = this.regions[c.kind as RegionKind];
      return r && old && (Math.abs(r.y - old.y) > old.h * 0.15 || Math.abs(r.x - old.x) > old.w * 0.15);
    });
    this.regions = Object.fromEntries(this.cfg.regions.filter((k) => regions[k]).map((k) => [k, regions[k]!])) as Partial<Record<RegionKind, NormRect>>;
    this.anchored = anchored;
    if (!this.width) return;
    if (moved && t !== undefined) this.markArtifact(t);
    this.layoutChannels(this.prev?.gray ?? null, this.prev?.t ?? 0, moved);
  }

  /** Face-pulse breathing estimate (from the existing camera pulse pipeline), or null. */
  setPulse(estimate: PulseInput | null, available = true) {
    this.pulse = estimate;
    this.pulseState = !available ? 'unavailable' : estimate ? 'active' : 'waiting';
  }

  private layoutChannels(gray: Gray | null, t: number, reseed: boolean) {
    const keep = new Map(this.channels.map((c) => [c.kind, c]));
    this.channels = (Object.keys(this.regions) as RegionKind[]).map((kind) => {
      const rect = clampRect(toRect(this.regions[kind]!, this.width, this.height), this.width, this.height);
      const old = keep.get(kind);
      const ch: Channel = old ?? { kind, rect, points: [], lastSeed: -Infinity, texture: 0, samples: [], pos: 0, frames: 0, flow: 0, profile: 0, dropped: 0, kept: 0, attempted: 0, fb: 0, fbCount: 0, consistency: 0, consistencyCount: 0 };
      ch.rect = rect;
      if (reseed || !old) ch.points = [];
      if (gray && !ch.points.length) this.seed(ch, gray, t);
      return ch;
    });
  }

  private seed(ch: Channel, gray: Gray, t: number) {
    const max = ch.kind === 'background' ? 12 : this.cfg.maxCorners;
    const found = corners(gray, ch.rect, max, 0.05, Math.max(3, Math.round(this.width / 48)));
    const fresh = found.points.filter((p) => !ch.points.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 2));
    ch.points = [...ch.points, ...fresh].slice(0, max);
    ch.lastSeed = t;
    if (ch.kind !== 'background' && ch.texture === 0) ch.texture = found.points.length / max;
  }

  private markArtifact(t: number) {
    const start = t - ARTIFACT_BEFORE_MS; const end = t + ARTIFACT_AFTER_MS;
    const last = this.artifacts[this.artifacts.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else this.artifacts.push([start, end]);
    this.lastArtifactAt = t;
  }

  /** Feed one grayscale frame at the working width, with its capture time in ms. */
  push(gray: Gray, t: number) {
    if (this.prev && t <= this.prev.t) return;
    if (!this.width) {
      this.width = gray.width; this.height = gray.height;
      const strip = (x: number): Rect => ({ x, y: this.height * 0.1, w: this.width * 0.12, h: this.height * 0.8 });
      this.background = [strip(1), strip(this.width * 0.88 - 1)].map((rect) => ({ kind: 'background', rect, points: [], lastSeed: -Infinity, texture: 0, samples: [], pos: 0, frames: 0, flow: 0, profile: 0, dropped: 0, kept: 0, attempted: 0, fb: 0, fbCount: 0, consistency: 0, consistencyCount: 0 }));
    }
    this.startT ??= t;
    const stats = regionStats(gray, { x: 0, y: 0, w: gray.width, h: gray.height });
    this.brightness.push(stats.mean); this.contrast.push(stats.std);
    const pyr = pyramid(gray, 2);

    if (!this.prev) {
      this.layoutChannels(gray, t, true);
      for (const b of this.background) this.seed(b, gray, t);
      for (const c of this.channels) c.samples.push({ t, v: 0 });
      this.profileSamples.push({ t, v: 0 });
      this.prev = { gray, pyr, t };
      return;
    }
    const dt = t - this.prev.t;
    this.intervals.push(dt);
    if (dt > 600) {
      // A camera pause: nothing reliable spans it.
      this.gaps += 1;
      this.markArtifact(t);
      for (const c of [...this.channels, ...this.background]) { c.points = []; this.seed(c, gray, t); }
      this.prev = { gray, pyr, t };
      return;
    }

    // Camera motion from background strips.
    const bg: Point[] = [];
    for (const b of this.background) {
      const r = trackPoints(this.prev.pyr, pyr, b.points, gray);
      for (const k of r.kept) bg.push({ x: k.to.x - k.from.x, y: k.to.y - k.from.y });
      b.points = r.kept.map((k) => k.to);
      if (b.points.length < 6 || t - b.lastSeed > RESEED_MS) this.seed(b, gray, t);
    }
    const cam = bg.length >= 6 ? { x: median(bg.map((p) => p.x)), y: median(bg.map((p) => p.y)) } : null;
    if (cam && Math.hypot(cam.x, cam.y) > 0.05) this.cameraCompensated += 1;

    const scale = this.width / 192;
    const moves: { ch: Channel; dy: number | null; dx: number }[] = [];
    for (const ch of this.channels) {
      ch.frames += 1;
      const r = trackPoints(this.prev.pyr, pyr, ch.points, gray);
      ch.attempted += ch.points.length; ch.kept += r.kept.length;
      let dy: number | null = null; let dx = 0;
      let flowOk = false;
      if (r.kept.length >= MIN_POINTS) {
        const dys = r.kept.map((k) => k.to.y - k.from.y - (cam?.y ?? 0));
        const dxs = r.kept.map((k) => k.to.x - k.from.x - (cam?.x ?? 0));
        const my = median(dys);
        const consistency = dys.filter((v) => Math.abs(v - my) < 0.3 * scale).length / dys.length;
        ch.consistency += consistency; ch.consistencyCount += 1;
        // Points that disagree (e.g. on a torso edge, half on the still background)
        // make the median meaningless: use the motion profile for this frame instead.
        if (consistency >= 0.5) {
          dy = my; dx = median(dxs); flowOk = true;
          for (const k of r.kept) { ch.fb += k.fbError; ch.fbCount += 1; }
          ch.flow += 1;
        }
      }
      if (!flowOk) {
        const p = profileShift(this.prev.gray, gray, ch.rect, Math.max(2, Math.round(3 * scale)));
        if (p.correlation >= 0.5) { dy = p.shift - (cam?.y ?? 0); ch.profile += 1; } else ch.dropped += 1;
      }
      ch.points = r.kept.map((k) => k.to);
      if (ch.points.length < this.cfg.maxCorners * 0.5 || t - ch.lastSeed > RESEED_MS) this.seed(ch, gray, t);
      moves.push({ ch, dy, dx });
    }

    // Artifacts: body movement far above the recent breathing motion, or camera shake.
    // Real movement lasts several frames; a one-frame spike is a tracking glitch, so
    // that frame is discarded and only a spike that continues counts as movement.
    const primary = moves[0];
    let artifact = Boolean(cam && Math.hypot(cam.x, cam.y) > 1.5 * scale);
    if (primary && primary.dy !== null) {
      // Speeds in pixels per second (at 192 px width), so thresholds do not depend on fps.
      const perS = 1000 / dt;
      const m = Math.hypot(primary.dy, primary.dx) * perS;
      const hist = this.motionHistory;
      const floor = 4 * scale;
      const threshold = hist.length >= 30 ? Math.max(floor, median(hist) + 6 * mad(hist)) : floor * 3;
      const spike = m > threshold || Math.abs(primary.dx) * perS > Math.max(3 * scale, 4 * (hist.length ? median(hist) : 0));
      this.spikes = spike ? this.spikes + 1 : 0;
      if (this.spikes >= 2) artifact = true;
      else if (spike) for (const mv of moves) mv.dy = null;
      if (!spike) { hist.push(m); if (hist.length > 300) hist.shift(); }
    }
    if (artifact) this.markArtifact(t);
    const inArtifact = t - this.lastArtifactAt < ARTIFACT_AFTER_MS;

    for (const { ch, dy, dx } of moves) {
      if (dy !== null && !inArtifact) ch.pos -= dy;
      if (artifact && dy !== null) {
        // Follow the body so the region stays on the torso after it moved.
        ch.rect = clampRect({ ...ch.rect, x: ch.rect.x + dx, y: ch.rect.y + dy }, this.width, this.height);
      }
      if (dy !== null) ch.samples.push({ t, v: ch.pos });
    }
    if (this.cfg.profileSource && this.channels[0]) {
      const p = profileShift(this.prev.gray, gray, this.channels[0].rect, Math.max(2, Math.round(3 * scale)));
      if (p.correlation >= 0.5) {
        if (!inArtifact) this.profilePos -= p.shift - (cam?.y ?? 0);
        this.profileSamples.push({ t, v: this.profilePos });
      }
    }
    this.prev = { gray, pyr, t };
  }

  private analyze(samples: Sample[], endT: number) {
    const recent = samples.filter((s) => s.t >= endT - ANALYSIS_WINDOW_MS);
    const u = resample(recent);
    if (!u || u.values.length < 50) return null;
    const n = u.values.length;
    const blocked = new Uint8Array(n);
    let blockedCount = 0;
    for (let i = 0; i < n; i += 1) {
      const t = u.t0 + (i * 1000) / u.hz;
      if (u.gap[i] || this.artifacts.some(([a, b]) => t >= a && t <= b)) { blocked[i] = 1; blockedCount += 1; }
    }
    const detrended = detrend(u.values);
    const filtered = bandpass(detrended, u.hz);
    const clean = Float64Array.from(filtered, (v, i) => (blocked[i] ? 0 : v));
    const spec = spectrum(clean, u.hz);
    const acf = autocorrelation(clean, u.hz);
    const cyc = retime(findCycles(filtered, u, blocked), bandpass(detrended, u.hz, 0.05, 2), u);
    const rSpec = spec.peakHz !== null ? spec.peakHz * 60 : null;
    const rAcf = acf.periodS ? 60 / acf.periodS : null;
    const rCyc = cyc.length >= 3 ? 60 / (median(cyc.map((c) => c.end - c.start)) / 1000) : null;
    const candidates = [rSpec, rAcf, rCyc].filter((r): r is number => r !== null);
    let rate = rSpec;
    // Spectrum on a harmonic, while the time-domain readings agree: trust the time domain.
    if (rAcf !== null && rCyc !== null && Math.abs(rAcf - rCyc) <= 2 && rSpec !== null && Math.abs(rSpec - rAcf) > 2) rate = (rAcf + rCyc) / 2;
    const spread = candidates.length > 1 ? Math.max(...candidates) - Math.min(...candidates) : 0;
    return {
      u, filtered, cycles: cyc, rate, spec, acf, spread,
      artifactFraction: blockedCount / n,
      durationS: (u.values.length - 1) / u.hz,
    };
  }

  private channelTracking(ch: Channel): QualityIndicator {
    const f = Math.max(1, ch.frames);
    return trackingQuality({
      flowFraction: ch.flow / f, profileFraction: ch.profile / f, droppedFraction: ch.dropped / f,
      keptRatio: ch.attempted ? ch.kept / ch.attempted : 0,
      fbError: ch.fbCount ? ch.fb / ch.fbCount / (this.width / 192) : 0.5,
      consistency: ch.consistencyCount ? ch.consistency / ch.consistencyCount : 0,
    });
  }

  private videoIndicator(): QualityIndicator {
    const iv = this.intervals.slice(-600);
    const meanDt = iv.length ? iv.reduce((s, v) => s + v, 0) / iv.length : 1000;
    const sd = iv.length > 1 ? Math.sqrt(iv.reduce((s, v) => s + (v - meanDt) ** 2, 0) / (iv.length - 1)) : 0;
    const recent = (x: number[]) => median(x.slice(-150));
    return videoQuality({
      brightness: recent(this.brightness) || 0, contrast: recent(this.contrast) || 0,
      fps: 1000 / Math.max(1, meanDt), intervalCv: meanDt ? sd / meanDt : 1,
      gapFraction: iv.length ? (iv.filter((v) => v > 600).length + this.gaps) / iv.length : 0,
    });
  }

  /** Full analysis of everything so far. Cheap enough to call about once a second. */
  result(): RespiratoryResult {
    const endT = this.prev?.t ?? 0;
    const durationS = this.startT === null ? 0 : (endT - this.startT) / 1000;
    const video = this.videoIndicator();
    const labels: Record<string, string> = { chest: 'Chest motion', abdomen: 'Abdomen motion', 'chest-profile': 'Chest profile', pulse: 'Face pulse' };
    const analyses = new Map<string, ReturnType<RespiratoryEngine['analyze']>>();
    const sources: SourceEstimate[] = [];
    const roiH = new Map<string, number>();

    for (const ch of this.channels) {
      const a = this.analyze(ch.samples, endT);
      analyses.set(ch.kind, a);
      roiH.set(ch.kind, ch.rect.h);
      const tracking = this.channelTracking(ch);
      const signal = a ? signalQuality({ durationS: a.durationS, snrDb: a.spec.snrDb, prominence: a.spec.prominence, periodicity: a.acf.strength, artifactFraction: a.artifactFraction, cycles: a.cycles.length, internalSpreadBrpm: a.spread })
        : { state: 'INSUFFICIENT' as const, score: 0, reasons: ['Not enough data yet.'] };
      const score = 0.65 * signal.score + 0.35 * tracking.score;
      sources.push({
        id: ch.kind as RegionKind, label: labels[ch.kind], modality: 'torso-motion',
        brpm: a?.rate ?? null,
        quality: { state: worst(signal.state, tracking.state, stateFor(score)), score, reasons: [...signal.reasons, ...tracking.reasons] },
        peakHz: a?.spec.peakHz ?? null, snrDb: a?.spec.snrDb, periodicity: a?.acf.strength,
      });
    }
    if (this.cfg.profileSource) {
      const a = this.analyze(this.profileSamples, endT);
      analyses.set('chest-profile', a);
      const signal = a ? signalQuality({ durationS: a.durationS, snrDb: a.spec.snrDb, prominence: a.spec.prominence, periodicity: a.acf.strength, artifactFraction: a.artifactFraction, cycles: a.cycles.length, internalSpreadBrpm: a.spread })
        : { state: 'INSUFFICIENT' as const, score: 0, reasons: ['Not enough data yet.'] };
      sources.push({ id: 'chest-profile', label: labels['chest-profile'], modality: 'torso-motion', brpm: a?.rate ?? null, quality: signal, peakHz: a?.spec.peakHz ?? null, snrDb: a?.spec.snrDb, periodicity: a?.acf.strength });
    }
    if (this.pulse) {
      const q = this.pulse.quality;
      const score = Math.max(0, Math.min(1, q));
      sources.push({
        id: 'pulse', label: labels.pulse, modality: 'face-pulse', brpm: this.pulse.brpm,
        quality: { state: score >= 0.6 ? 'GOOD' : score >= 0.4 ? 'ACCEPTABLE' : score >= 0.25 ? 'POOR' : 'INSUFFICIENT', score, reasons: score < 0.4 ? ['The face pulse signal was weak.'] : [] },
      });
    }

    const fusion = fuse(sources);
    // Indicators for the primary torso region (or the best torso source).
    const torsoSources = sources.filter((s) => s.modality === 'torso-motion');
    const bestTorso = [...torsoSources].sort((a, b) => b.quality.score - a.quality.score)[0];
    // Report the region the result relies on (the best used torso source), else the chest.
    const usedChannel = this.channels.filter((c) => fusion.used.includes(c.kind as RegionKind))
      .sort((a, b) => (sources.find((s) => s.id === b.kind)?.quality.score ?? 0) - (sources.find((s) => s.id === a.kind)?.quality.score ?? 0))[0];
    const primary = usedChannel ?? this.channels[0];
    const pa = primary ? analyses.get(primary.kind) : null;
    const roi = primary
      ? roiQuality({ pixels: primary.rect.w * primary.rect.h * (192 / this.width) ** 2, texture: primary.texture, inFrame: inFrame(this.regions[primary.kind as RegionKind]!) })
      : { state: 'INSUFFICIENT' as const, score: 0, reasons: ['No chest region is set.'] };
    const tracking = primary ? this.channelTracking(primary) : { state: 'INSUFFICIENT' as const, score: 0, reasons: [] };
    const signal = pa ? signalQuality({ durationS: pa.durationS, snrDb: pa.spec.snrDb, prominence: pa.spec.prominence, periodicity: pa.acf.strength, artifactFraction: pa.artifactFraction, cycles: pa.cycles.length, internalSpreadBrpm: pa.spread })
      : { state: 'INSUFFICIENT' as const, score: 0, reasons: ['Not enough data yet.'] };
    const usedTorso = fusion.used.some((id) => id !== 'pulse');
    const final = fusion.brpm === null
      ? finalQuality([video], fusion.confidence)
      : finalQuality(usedTorso ? [video, roi, tracking, signal] : [video], fusion.confidence);

    // Waveform and timing from the best torso source that the fusion accepted.
    const timingSource = usedTorso ? torsoSources.filter((s) => fusion.used.includes(s.id)).sort((a, b) => b.quality.score - a.quality.score)[0] : undefined;
    const ta = timingSource ? analyses.get(timingSource.id) : (bestTorso ? analyses.get(bestTorso.id) : null);
    const waveform = ta ? {
      t: Array.from(ta.filtered, (_, i) => ta.u.t0 + (i * 1000) / ta.u.hz),
      v: Array.from(ta.filtered),
      artifacts: this.artifacts.filter(([, b]) => b >= ta.u.t0).map(([a, b]) => [a, b] as [number, number]),
      cycles: ta.cycles,
    } : { t: [], v: [], artifacts: [], cycles: [] as Cycle[] };
    const region = (kind: RegionKind) => {
      const a = analyses.get(kind);
      return a ? { cycles: a.cycles, roiHeight: roiH.get(kind) ?? 0 } : undefined;
    };
    const metrics = respiratoryMetrics({
      rateBrpm: final.state === 'GOOD' || final.state === 'ACCEPTABLE' ? fusion.brpm : null,
      rateNote: fusion.brpm === null ? fusion.method : final.state === 'GOOD' || final.state === 'ACCEPTABLE' ? fusion.method : 'Measured, but not reliable enough to report.',
      cycles: timingSource ? (ta?.cycles ?? []) : [],
      amplitudes: { chest: region('chest'), abdomen: region('abdomen') },
    });

    const f = Math.max(1, primary?.frames ?? 1);
    const strategy: Strategy = {
      sparseFlow: (primary?.flow ?? 0) / f > 0.5,
      profileFallback: (primary?.profile ?? 0) > 0,
      profileSource: this.cfg.profileSource,
      cameraMotionCompensated: this.cameraCompensated > 0,
      faceAnchoredRoi: this.anchored,
      pulse: this.pulseState,
      motionArtifact: endT - this.lastArtifactAt < 3000,
    };
    return { durationS, profile: this.profile, quality: { video, roi, tracking, signal, final }, sources, fusion, metrics, waveform, strategy, algorithm: ALGORITHM };
  }

  /** What the UI needs while measuring. */
  live(): LiveState {
    const r = this.result();
    return {
      durationS: r.durationS,
      brpm: r.quality.final.state === 'GOOD' || r.quality.final.state === 'ACCEPTABLE' ? r.fusion.brpm : null,
      quality: r.quality, strategy: r.strategy, waveform: r.waveform, sources: r.sources,
      points: this.channels.flatMap((c) => c.points.map((p) => ({ kind: c.kind as RegionKind, x: p.x, y: p.y }))),
      regions: Object.fromEntries(this.channels.map((c) => [c.kind, c.rect])),
      width: this.width, height: this.height,
    };
  }
}
