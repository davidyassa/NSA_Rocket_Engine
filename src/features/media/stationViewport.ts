import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import stationUrl from '../../../assets/iss/international-space-station.glb?url';

export interface StationViewport {
  reset: () => void;
  zoom: (direction: 'in' | 'out') => void;
  setIncident: (incident: StationIncident | null) => void;
  dispose: () => void;
}

export interface StationAnchor {
  id: string;
  node: string;
  offset: readonly [number, number, number];
  neighbors: readonly string[];
}

export interface StationIncident {
  roomId: string;
  bearingDegrees: number;
}

export interface StationProjection {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

function disposeModel(model: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  const images = new Set<ImageBitmap>();

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of [object.material].flat()) {
      resources.add(material);
      for (const property of Object.values(material)) {
        if (!(property instanceof THREE.Texture)) continue;
        resources.add(property);
        if (typeof ImageBitmap !== 'undefined' && property.image instanceof ImageBitmap) images.add(property.image);
      }
    }
  });

  resources.forEach((resource) => resource.dispose());
  images.forEach((image) => image.close());
}

export function mountStationViewport(
  canvas: HTMLCanvasElement,
  onStatus: (status: 'ready' | 'error') => void,
  overlay?: { anchors: readonly StationAnchor[]; onProject: (points: StationProjection[]) => void },
): StationViewport {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 12);
  const home = new THREE.Vector3(0.36, 0.56, 1.1).setLength(3);
  camera.position.copy(home);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  const sun = new THREE.DirectionalLight(0xfff2e3, 2.85);
  sun.position.set(-3, 5, 3);
  const earthFill = new THREE.DirectionalLight(0xb5d4ff, 0.65);
  earthFill.position.set(1, -3, 3);
  const rim = new THREE.DirectionalLight(0xd5e8ff, 0.85);
  rim.position.set(2, 2, -4);
  scene.add(sun, earthFill, rim, new THREE.HemisphereLight(0xe9efff, 0x8199bf, 0.9));

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = 0.65;
  controls.saveState();

  let model: THREE.Object3D | undefined;
  let disposed = false;
  let contextLost = false;
  let frame = 0;
  let modelHalfWidth = 0.5;
  let modelHalfHeight = 0.5;
  const anchors = new Map<string, THREE.Vector3>();
  const projected = new THREE.Vector3();
  const corridorGeometry = new THREE.BufferGeometry();
  const corridorMaterial = new THREE.LineBasicMaterial({
    color: 0x81ceff, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false,
  });
  const corridors = new THREE.LineSegments(corridorGeometry, corridorMaterial);
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.15, 0xffad65);
  arrow.visible = false;
  if (overlay) scene.add(corridors, arrow);

  let incident: StationIncident | null = null;

  function updateIncident() {
    const room = incident && anchors.get(incident.roomId);
    arrow.visible = Boolean(room);
    if (!room || !incident) return;

    const angle = THREE.MathUtils.degToRad(incident.bearingDegrees);
    const incoming = new THREE.Vector3(Math.sin(angle), 0.35, Math.cos(angle)).normalize();
    arrow.position.copy(room).addScaledVector(incoming, 0.15);
    arrow.setDirection(incoming.negate());
    arrow.setLength(0.115, 0.026, 0.016);
  }

  function render() {
    renderer.render(scene, camera);
    overlay?.onProject(Array.from(anchors, ([id, point]) => {
      projected.copy(point).project(camera);
      return {
        id,
        x: (projected.x + 1) / 2,
        y: (1 - projected.y) / 2,
        visible: Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1,
      };
    }));
  }

  function requestRender() {
    if (frame || disposed || contextLost || !model) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    const aspect = width / height;
    const halfHeight = Math.max(modelHalfHeight, modelHalfWidth / aspect) * 1.15;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    requestRender();
  }

  function handleKeys(event: KeyboardEvent) {
    const spherical = new THREE.Spherical().setFromVector3(camera.position);
    const step = Math.PI / 24;
    switch (event.key) {
      case 'ArrowLeft': spherical.theta -= step; break;
      case 'ArrowRight': spherical.theta += step; break;
      case 'ArrowUp': spherical.phi -= step; break;
      case 'ArrowDown': spherical.phi += step; break;
      default: return;
    }
    event.preventDefault();
    camera.position.setFromSpherical(spherical.makeSafe());
    controls.update();
  }

  function handleContextLoss() {
    contextLost = true;
    window.cancelAnimationFrame(frame);
    onStatus('error');
  }

  controls.addEventListener('change', requestRender);
  canvas.addEventListener('keydown', handleKeys);
  canvas.addEventListener('webglcontextlost', handleContextLoss);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  async function load() {
    try {
      const { scene: station } = await new GLTFLoader().loadAsync(stationUrl);
      if (disposed || contextLost) {
        disposeModel(station);
        return;
      }

      model = station;
      const bounds = new THREE.Box3().setFromObject(station);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 1 / Math.max(size.x, size.y, size.z);
      const centered = new THREE.Group();
      centered.scale.setScalar(scale);
      centered.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
      centered.add(station);
      scene.add(centered);

      // Measure the station in the initial camera's plane for a tight fit at any aspect ratio.
      scene.updateMatrixWorld(true);
      if (overlay) {
        const named = new Map<string, THREE.Object3D>();
        station.traverse((object) => {
          if (typeof object.userData.name === 'string') named.set(object.userData.name, object);
        });
        for (const anchor of overlay.anchors) {
          const node = named.get(anchor.node);
          if (!node) throw new Error(`Missing ISS station node: ${anchor.node}`);
          const point = node.getWorldPosition(new THREE.Vector3());
          anchors.set(anchor.id, point.addScaledVector(new THREE.Vector3(...anchor.offset), scale));
        }
        const segments: THREE.Vector3[] = [];
        for (const anchor of overlay.anchors) {
          const from = anchors.get(anchor.id);
          for (const neighbor of anchor.neighbors) {
            const to = anchors.get(neighbor);
            if (from && to && anchor.id < neighbor) segments.push(from, to);
          }
        }
        corridorGeometry.setFromPoints(segments);
        updateIncident();
      }
      modelHalfWidth = 0;
      modelHalfHeight = 0;
      const cameraPoint = new THREE.Vector3();
      station.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        const toCamera = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
        for (let index = 0; index < positions.count; index += 1) {
          cameraPoint.fromBufferAttribute(positions, index).applyMatrix4(toCamera);
          modelHalfWidth = Math.max(modelHalfWidth, Math.abs(cameraPoint.x));
          modelHalfHeight = Math.max(modelHalfHeight, Math.abs(cameraPoint.y));
        }
      });

      resize();
      render();
      if (!contextLost) onStatus('ready');
    } catch {
      if (!disposed && !contextLost) onStatus('error');
    }
  }

  void load();

  return {
    reset: () => controls.reset(),
    setIncident: (next) => {
      incident = next;
      updateIncident();
      requestRender();
    },
    zoom: (direction) => {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * (direction === 'in' ? 1.25 : 0.8), 0.75, 5);
      camera.updateProjectionMatrix();
      requestRender();
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('keydown', handleKeys);
      canvas.removeEventListener('webglcontextlost', handleContextLoss);
      controls.dispose();
      if (model) disposeModel(model);
      corridorGeometry.dispose();
      corridorMaterial.dispose();
      arrow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
