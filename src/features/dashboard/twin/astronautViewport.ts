/**
 * Imperative three.js viewport that hosts the team's Blender astronaut (GLB).
 * Loaded lazily (dynamic import) so three.js lives in its own chunk.
 * Everything is self-hosted: no CDN, no network beyond the app's own origin,
 * so it is precached by the service worker and works offline.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HEALTH_DOMAINS, type HealthDomain } from '../../../contracts';
import { TOKENS } from '../../../ui/tokens';
import {
  DOMAIN_PROPERTY, TARGET_HEIGHT_M, anchorDomain, framingDistance,
  isHealthDomain, normalizeTransform, resolveAnchors, type Vec3Like,
} from './hotspots';
// The one and only astronaut: the team's Blender export. Vite fingerprints it
// into dist/assets and the service worker precaches it for offline use.
import astronautUrl from '../../../../assets/astronaut/astronaut_sol_check.glb?url';

export const ASTRONAUT_FILE = 'astronaut_sol_check.glb';

export interface ProjectedHotspot {
  domain: HealthDomain;
  x: number;
  y: number;
  /** false when the anchor is behind the suit from the current camera angle */
  visible: boolean;
}

export interface ModelSource {
  file: string;
  /** Domains whose anchors came from Hotspot empties in the GLB (others use bounding-box fallbacks). */
  anchorsFromModel: HealthDomain[];
}

export interface ViewportCallbacks {
  onHotspots: (hotspots: ProjectedHotspot[]) => void;
  onHoverDomain: (domain: HealthDomain | null) => void;
  onSelectDomain: (domain: HealthDomain) => void;
  onModel: (source: ModelSource) => void;
  onError: (message: string) => void;
}

const FOV = 30;
const IDLE_RESUME_MS = 4000;
const CLICK_SLOP_PX = 6;
const HOTSPOT_PICK_RADIUS_PX = 30;
/** Default framing leaves room for the helmet antenna, boots and ground rings. */
const FRAME_MARGIN = 1.22;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.9;

export class AstronautViewport {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private anchors = new Map<HealthDomain, THREE.Vector3>();
  private domainMeshes = new Map<HealthDomain, THREE.Mesh[]>();
  private highlighted: HealthDomain | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private frame = 0;
  private running = false;
  private visible = true;
  private disposed = false;
  private autoRotateWanted: boolean;
  private idleTimer: number | undefined;
  private reset: { from: THREE.Vector3; to: THREE.Vector3; start: number } | null = null;
  private home = new THREE.Vector3();
  private homeDistance = 1;
  private target = new THREE.Vector3(0, TARGET_HEIGHT_M * 0.52, 0);
  private downAt: { x: number; y: number } | null = null;
  private lastHotspots: ProjectedHotspot[] = [];
  private occlusion = new Map<HealthDomain, boolean>();
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver | null = null;
  private pmrem: THREE.PMREMGenerator;

  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: ViewportCallbacks,
    options: { autoRotate: boolean; reducedMotion: boolean },
  ) {
    this.autoRotateWanted = options.autoRotate && !options.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Image-based lighting gives PBR materials from Blender (metallic gold visor,
    // glossy hard upper torso) believable reflections without any external HDR file.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.buildStage();
    this.scene.add(this.root);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;      // momentum / inertia
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;        // never hijack page scroll on the dashboard
    this.controls.rotateSpeed = 0.75;
    this.controls.minPolarAngle = Math.PI * 0.3;
    this.controls.maxPolarAngle = Math.PI * 0.6;
    this.controls.autoRotate = this.autoRotateWanted;
    this.controls.autoRotateSpeed = 0.9;
    this.controls.addEventListener('start', this.handleInteractionStart);
    this.controls.addEventListener('end', this.handleInteractionEnd);

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    canvas.addEventListener('dblclick', this.resetView);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    document.addEventListener('visibilitychange', this.handleVisibility);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.visible = entry?.isIntersecting ?? true;
        this.updateRunning();
      }, { rootMargin: '200px' });
      this.intersectionObserver.observe(canvas);
    }
    this.resize();
    void this.loadModel();
    this.updateRunning();
  }

  // ───────────────────────────── scene ─────────────────────────────

  private buildStage() {
    // Calm Mars-surface lighting: low warm sun, cool deep-space sky fill, rust ground bounce.
    const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x5a3424, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(-2.2, 3.6, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -1.2;
    sun.shadow.camera.right = 1.2;
    sun.shadow.camera.top = 2.2;
    sun.shadow.camera.bottom = -0.2;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(new THREE.Color(TOKENS.accent), 0.6);
    rim.position.set(2.5, 1.8, -2.5);
    this.scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 64),
      new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Telemetry rings on the ground plane (decorative framing, no motion).
    const ringMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(TOKENS.accent), transparent: true, opacity: 0.35 });
    for (const radius of [0.55, 0.82]) {
      const points = Array.from({ length: 129 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * radius, 0.002, Math.sin(a) * radius);
      });
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), ringMaterial));
    }
  }

  private async loadModel() {
    let model: THREE.Object3D;
    try {
      model = (await new GLTFLoader().loadAsync(astronautUrl)).scene;
    } catch {
      if (!this.disposed) this.callbacks.onError(`The astronaut model (${ASTRONAUT_FILE}) could not be loaded.`);
      return;
    }
    if (this.disposed) {
      disposeObject(model);
      return;
    }
    const anchorsFromModel = this.mountModel(model);
    this.callbacks.onModel({ file: ASTRONAUT_FILE, anchorsFromModel });
  }

  /** Normalises scale/position, collects anchors and clickable meshes. Returns domains anchored by named empties. */
  private mountModel(model: THREE.Object3D): HealthDomain[] {
    model.updateMatrixWorld(true);
    const rawBounds = new THREE.Box3().setFromObject(model, true);
    const { scale, offset } = normalizeTransform(rawBounds);
    model.scale.multiplyScalar(scale);
    model.position.set(model.position.x * scale + offset.x, model.position.y * scale + offset.y, model.position.z * scale + offset.z);
    this.root.add(model);
    this.root.updateMatrixWorld(true);

    const named: Partial<Record<HealthDomain, Vec3Like>> = {};
    model.traverse((object) => {
      const hotspotDomain = anchorDomain(object.name, object.userData);
      if (hotspotDomain) named[hotspotDomain] = object.getWorldPosition(new THREE.Vector3());

      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const domain = findDomain(mesh);
        if (domain) {
          // Own the material so highlighting one region never tints a shared material elsewhere.
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
          const list = this.domainMeshes.get(domain) ?? [];
          list.push(mesh);
          this.domainMeshes.set(domain, list);
        }
      }
    });

    const bounds = new THREE.Box3().setFromObject(model, true);
    const { anchors, fromModel } = resolveAnchors(named, bounds);
    for (const domain of HEALTH_DOMAINS) {
      const a = anchors[domain];
      this.anchors.set(domain, new THREE.Vector3(a.x, a.y, a.z));
    }
    this.frameCamera(bounds);
    this.applyHighlight();
    // Render one frame even while off-screen so the hotspot buttons get positions immediately.
    this.requestFrame();
    return fromModel;
  }

  private frameCamera(bounds: THREE.Box3) {
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    this.target.set(0, center.y, 0);
    const distance = framingDistance(size.y, Math.max(size.x, size.z), FOV, this.camera.aspect || 0.75, FRAME_MARGIN);
    this.homeDistance = distance;
    this.controls.minDistance = distance * MIN_ZOOM;
    this.controls.maxDistance = distance * MAX_ZOOM;
    // Slight three-quarter view so the PLSS and visor depth read immediately.
    this.home.set(Math.sin(0.35) * distance, center.y + size.y * 0.06, Math.cos(0.35) * distance);
    this.camera.position.copy(this.home);
    this.controls.target.copy(this.target);
    this.controls.update();
  }

  // ───────────────────────────── public API ─────────────────────────────

  setHighlight(domain: HealthDomain | null) {
    if (domain === this.highlighted) return;
    this.highlighted = domain;
    this.applyHighlight();
    this.requestFrame();
  }

  setAutoRotate(enabled: boolean) {
    this.autoRotateWanted = enabled;
    this.controls.autoRotate = enabled;
    window.clearTimeout(this.idleTimer);
    this.updateRunning();
  }

  rotateBy(radians: number) {
    // Keyboard rotation: orbit around the target on the horizontal plane.
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.requestFrame();
  }

  /** factor < 1 zooms in, > 1 zooms out; eased, clamped to the framing range. */
  zoomBy(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, this.homeDistance * MIN_ZOOM, this.homeDistance * MAX_ZOOM);
    const to = this.controls.target.clone().add(offset.setLength(distance));
    this.reset = { from: this.camera.position.clone(), to, start: performance.now() };
    this.updateRunning();
  }

  resetView = () => {
    this.reset = { from: this.camera.position.clone(), to: this.home.clone(), start: performance.now() };
    this.controls.autoRotate = false;
    this.scheduleIdleResume();
    this.updateRunning();
  };

  dispose() {
    this.disposed = true;
    this.running = false;
    window.clearTimeout(this.idleTimer);
    this.controls.removeEventListener('start', this.handleInteractionStart);
    this.controls.removeEventListener('end', this.handleInteractionEnd);
    this.controls.dispose();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('dblclick', this.resetView);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.resizeObserver.disconnect();
    this.intersectionObserver?.disconnect();
    disposeObject(this.scene);
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }

  // ───────────────────────────── loop ─────────────────────────────

  private requestFrame() {
    if (!this.running) requestAnimationFrame(() => this.renderOnce());
  }

  private updateRunning() {
    const shouldRun = !this.disposed && this.visible && document.visibilityState !== 'hidden';
    if (shouldRun && !this.running) {
      this.running = true;
      requestAnimationFrame(this.tick);
    } else if (!shouldRun) {
      this.running = false;
    }
  }

  private tick = () => {
    if (!this.running) return;
    this.renderOnce();
    requestAnimationFrame(this.tick);
  };

  private renderOnce() {
    if (this.disposed) return;
    if (this.reset) {
      const t = Math.min(1, (performance.now() - this.reset.start) / 450);
      const eased = 1 - (1 - t) ** 3;
      this.camera.position.lerpVectors(this.reset.from, this.reset.to, eased);
      if (t >= 1) this.reset = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frame += 1;
    if (this.frame % 6 === 0) this.updateOcclusion();
    this.emitHotspots();
  }

  private emitHotspots() {
    if (this.anchors.size === 0) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const next: ProjectedHotspot[] = [];
    for (const [domain, anchor] of this.anchors) {
      const p = anchor.clone().project(this.camera);
      next.push({
        domain,
        x: (p.x * 0.5 + 0.5) * width,
        y: (-p.y * 0.5 + 0.5) * height,
        visible: !(this.occlusion.get(domain) ?? false),
      });
    }
    const changed = next.some((h, i) => {
      const prev = this.lastHotspots[i];
      return !prev || Math.abs(prev.x - h.x) > 0.25 || Math.abs(prev.y - h.y) > 0.25 || prev.visible !== h.visible;
    });
    if (changed) {
      this.lastHotspots = next;
      this.callbacks.onHotspots(next);
    }
  }

  private updateOcclusion() {
    const origin = this.camera.position;
    for (const [domain, anchor] of this.anchors) {
      const direction = anchor.clone().sub(origin);
      const distance = direction.length();
      this.raycaster.set(origin, direction.normalize());
      this.raycaster.far = distance;
      const hit = this.raycaster.intersectObject(this.root, true)[0];
      this.occlusion.set(domain, Boolean(hit && hit.distance < distance - 0.06));
    }
    this.raycaster.far = Infinity;
  }

  private applyHighlight() {
    const glow = new THREE.Color(TOKENS.accent);
    for (const [domain, meshes] of this.domainMeshes) {
      const on = domain === this.highlighted;
      for (const mesh of meshes) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if ('emissive' in material && material.emissive instanceof THREE.Color) {
            const m = material as THREE.MeshStandardMaterial;
            m.userData.baseEmissive ??= m.emissive.clone();
            m.userData.baseEmissiveIntensity ??= m.emissiveIntensity;
            if (on) {
              m.emissive.copy(glow);
              m.emissiveIntensity = 0.32;
            } else {
              m.emissive.copy(m.userData.baseEmissive as THREE.Color);
              m.emissiveIntensity = m.userData.baseEmissiveIntensity as number;
            }
          }
        }
      }
    }
  }

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestFrame();
  }

  // ───────────────────────────── input ─────────────────────────────

  private handleInteractionStart = () => {
    this.reset = null;
    this.controls.autoRotate = false;
    window.clearTimeout(this.idleTimer);
  };

  private handleInteractionEnd = () => this.scheduleIdleResume();

  private scheduleIdleResume() {
    window.clearTimeout(this.idleTimer);
    if (!this.autoRotateWanted) return;
    this.idleTimer = window.setTimeout(() => {
      this.controls.autoRotate = this.autoRotateWanted;
    }, IDLE_RESUME_MS);
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.downAt = { x: event.clientX, y: event.clientY };
  };

  private handlePointerUp = (event: PointerEvent) => {
    const start = this.downAt;
    this.downAt = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return;
    const domain = this.pick(event);
    if (domain) this.callbacks.onSelectDomain(domain);
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (this.downAt) return; // dragging
    const domain = this.pick(event);
    this.canvas.style.cursor = domain ? 'pointer' : 'grab';
    this.callbacks.onHoverDomain(domain);
  };

  private handlePointerLeave = () => {
    this.callbacks.onHoverDomain(null);
  };

  private handleVisibility = () => this.updateRunning();

  private handleContextLost = (event: Event) => {
    event.preventDefault();
    this.running = false;
    this.callbacks.onError('The 3D view lost its graphics context. The 2D figure remains available.');
  };

  /** Mesh tagged with solcheck_domain under the pointer, else the nearest hotspot within reach. */
  private pick(event: PointerEvent): HealthDomain | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.root, true)[0];
    const fromMesh = hit ? findDomain(hit.object) : null;
    if (fromMesh) return fromMesh;

    let best: HealthDomain | null = null;
    let bestDistance = HOTSPOT_PICK_RADIUS_PX;
    for (const hotspot of this.lastHotspots) {
      if (!hotspot.visible) continue;
      const distance = Math.hypot(hotspot.x - x, hotspot.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = hotspot.domain;
      }
    }
    return best;
  }
}

function findDomain(object: THREE.Object3D | null): HealthDomain | null {
  for (let node = object; node; node = node.parent) {
    const tagged = node.userData?.[DOMAIN_PROPERTY];
    if (isHealthDomain(tagged)) return tagged;
  }
  return null;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const m of materials) {
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      m.dispose();
    }
  });
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
