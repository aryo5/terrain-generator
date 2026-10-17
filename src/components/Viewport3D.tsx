import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BiomeType,
  BrushSettings,
  PaletteItem,
  PlacedObject,
  TerrainConfig,
  TimeOfDay,
} from '../types';
import { BIOME_PALETTES, applySculptBrush, applyPathBrush, getSampledHeightAt } from '../core/terrainGen';
import { instantiateModel } from '../core/modelFactory';
import { getCustomModelClone } from '../core/assetIO';
import { GraphicsPreset, PerformanceMode } from '../types';

export function normalizePreset(graphicsPreset?: GraphicsPreset, performanceMode?: PerformanceMode): GraphicsPreset {
  if (graphicsPreset === 'LOW' || performanceMode === 'LOW' || performanceMode === 'mobile') return 'LOW';
  if (graphicsPreset === 'HIGH' || performanceMode === 'HIGH' || performanceMode === 'ultra') return 'HIGH';
  return 'MEDIUM';
}

export function getAtmosphereSettings(biome: BiomeType, timeOfDay: TimeOfDay) {
  const palette = BIOME_PALETTES[biome] || BIOME_PALETTES.archipelago;

  switch (timeOfDay) {
    case 'golden':
      return {
        skyColor: '#f59e0b',
        fogColor: '#fed7aa',
        fogDensity: 0.0034,
        sunColor: 0xffaa44,
        sunIntensity: 1.55,
        sunPos: [58, 38, 48] as [number, number, number],
        ambientColor: 0xffedd5,
        ambientIntensity: 0.78,
      };
    case 'sunset':
      return {
        skyColor: '#e11d48',
        fogColor: '#fecdd3',
        fogDensity: 0.0036,
        sunColor: 0xf43f5e,
        sunIntensity: 1.45,
        sunPos: [65, 26, 30] as [number, number, number],
        ambientColor: 0xfce7f3,
        ambientIntensity: 0.72,
      };
    case 'cyberpunk':
      return {
        skyColor: '#090d16',
        fogColor: '#0f172a',
        fogDensity: 0.0040,
        sunColor: 0x06b6d4,
        sunIntensity: 1.35,
        sunPos: [-42, 55, -32] as [number, number, number],
        ambientColor: 0x1e293b,
        ambientIntensity: 0.65,
      };
    case 'night':
      return {
        skyColor: '#030712',
        fogColor: '#0b1329',
        fogDensity: 0.0038,
        sunColor: 0x93c5fd,
        sunIntensity: 0.65,
        sunPos: [-35, 62, 35] as [number, number, number],
        ambientColor: 0x0f172a,
        ambientIntensity: 0.5,
      };
    case 'day':
    default:
      return {
        skyColor: palette.skyColor,
        fogColor: palette.fogColor,
        fogDensity: 0.0033,
        sunColor: 0xfff3dc, // Warm golden sunlight for dimensional chiaroscuro
        sunIntensity: 1.4,
        sunPos: [56, 68, 46] as [number, number, number], // Angled rake light emphasizing low-poly facets
        ambientColor: 0xfff9ee, // Warm ambient fill
        ambientIntensity: 0.82,
      };
  }
}

interface Viewport3DProps {
  terrainConfig: TerrainConfig;
  heights: Float32Array;
  colors: Float32Array;
  onHeightmapChange: (newHeights: Float32Array) => void;
  onTerrainBuffersChange?: (newHeights: Float32Array, newColors: Float32Array) => void;
  placedObjects: PlacedObject[];
  onObjectPlaced: (obj: PlacedObject) => void;
  onObjectSelected: (obj: PlacedObject | null) => void;
  onObjectUpdate: (id: string, updates: Partial<PlacedObject>) => void;
  selectedObjectId: string | null;
  activePaletteItem: PaletteItem | null;
  brushSettings: BrushSettings;
  timeOfDay: TimeOfDay;
  performanceMode?: PerformanceMode;
  graphicsPreset?: GraphicsPreset;
  onFpsUpdate?: (fps: number) => void;
  onSceneReady?: (scene: THREE.Scene, exportGroup: THREE.Group) => void;
}

// Module-level pre-allocated scratch objects to prevent GC in animation loop
const _vec3 = new THREE.Vector3();
const _mouse = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _dummyObj = new THREE.Object3D();
const _combinedMat = new THREE.Matrix4();
const _selectionDummy = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshBasicMaterial({ visible: false })
);

export const Viewport3D: React.FC<Viewport3DProps> = ({
  terrainConfig,
  heights,
  colors,
  onHeightmapChange,
  onTerrainBuffersChange,
  placedObjects,
  onObjectPlaced,
  onObjectSelected,
  onObjectUpdate,
  selectedObjectId,
  activePaletteItem,
  brushSettings,
  timeOfDay,
  performanceMode,
  graphicsPreset = 'MEDIUM',
  onFpsUpdate,
  onSceneReady,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Mutable refs to keep stable render loop without re-creating scene
  const propsRef = useRef({
    terrainConfig,
    heights,
    colors,
    onHeightmapChange,
    onTerrainBuffersChange,
    placedObjects,
    onObjectPlaced,
    onObjectSelected,
    onObjectUpdate,
    selectedObjectId,
    activePaletteItem,
    brushSettings,
    timeOfDay,
    performanceMode,
    graphicsPreset,
  });
  propsRef.current = {
    terrainConfig,
    heights,
    colors,
    onHeightmapChange,
    onTerrainBuffersChange,
    placedObjects,
    onObjectPlaced,
    onObjectSelected,
    onObjectUpdate,
    selectedObjectId,
    activePaletteItem,
    brushSettings,
    timeOfDay,
    performanceMode,
    graphicsPreset,
  };

  // Scene object refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const objectsGroupRef = useRef<THREE.Group | null>(null);
  const exportGroupRef = useRef<THREE.Group | null>(null);
  const brushRingRef = useRef<THREE.LineLoop | null>(null);
  const ghostPreviewRef = useRef<THREE.Group | null>(null);
  const selectionBoxRef = useRef<THREE.BoxHelper | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const animatedRotorsRef = useRef<{ obj: THREE.Object3D; speed: number }[]>([]);

  // Interaction tracking
  const isMouseDownRef = useRef(false);
  const didDragRef = useRef(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });
  const lastRaycastTimeRef = useRef(0);

  // Redundant terrain geometry re-render guard (Rule 3)
  const lastAppliedHeightsRef = useRef<Float32Array | null>(null);
  const lastAppliedColorsRef = useRef<Float32Array | null>(null);
  const lastResRef = useRef<number>(-1);
  const lastSizeRef = useRef<number>(-1);
  const lastSmoothRef = useRef<boolean | undefined>(undefined);

  // Initialize Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);
    const isMobileDevice =
      /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.innerWidth < 768);

    // 1. Scene & Atmosphere setup with preset-aware soft horizon fog
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const initialPreset = normalizePreset(graphicsPreset, performanceMode);
    const atm = getAtmosphereSettings(terrainConfig.biome, timeOfDay);

    scene.background = new THREE.Color(atm.skyColor);
    if (initialPreset === 'LOW') {
      scene.fog = null;
    } else {
      scene.fog = new THREE.FogExp2(atm.fogColor, initialPreset === 'HIGH' ? atm.fogDensity * 1.05 : atm.fogDensity);
    }

    // 2. Camera setup - near plane 0.5 prevents close-up geometric clipping when zooming into village details
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1200);
    camera.position.set(75, 55, 85);
    cameraRef.current = camera;

    // 3. Renderer setup:
    // - precision: 'mediump' to minimize mobile ALU register pressure and boost fragment throughput
    // - powerPreference: 'high-performance' to ensure maximum GPU clock profile
    // - antialias: enabled on HIGH for desktop/powerful devices
    const isHeadlessOrBot =
      Boolean(navigator.webdriver) ||
      /HeadlessChrome|Headless/i.test(navigator.userAgent);

    const renderer = new THREE.WebGLRenderer({
      antialias: initialPreset === 'HIGH' && !isHeadlessOrBot,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      precision: 'mediump',
    });
    renderer.setSize(width, height);

    // Detect software rendering
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const unmaskedRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    const isSoftwareOrHeadless =
      isHeadlessOrBot ||
      /llvmpipe|swiftshader|mesa|software|cpu/i.test(unmaskedRenderer);

    // Preset resolution scaling: LOW = 1.0, MEDIUM = 1.25, HIGH = 1.5 max
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const targetRatio = initialPreset === 'LOW' ? 1.0 : initialPreset === 'MEDIUM' ? 1.25 : 1.5;
    const effectivePixelRatio = isSoftwareOrHeadless ? 1 : Math.min(dpr, targetRatio);
    renderer.setPixelRatio(effectivePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Shadow optimization per preset: LOW = off, MEDIUM = 512, HIGH = 1024
    renderer.shadowMap.enabled = initialPreset !== 'LOW';
    if (renderer.shadowMap.enabled) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // 4. OrbitControls with smooth exponential damping and expansive zoom range
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 3;
    controls.maxDistance = 450;
    controls.target.set(0, 4, 0);
    controlsRef.current = controls;

    // 5. Lighting: Warm dimensional DirectionalLight + AmbientLight fill
    const ambientLight = new THREE.AmbientLight(atm.ambientColor, atm.ambientIntensity);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const keyLight = new THREE.DirectionalLight(atm.sunColor, atm.sunIntensity);
    keyLight.position.set(...atm.sunPos);
    keyLight.castShadow = renderer.shadowMap.enabled;
    if (keyLight.shadow) {
      const shadowRes = initialPreset === 'HIGH' ? 1024 : 512;
      keyLight.shadow.mapSize.width = shadowRes;
      keyLight.shadow.mapSize.height = shadowRes;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 240;
      keyLight.shadow.bias = initialPreset === 'HIGH' ? -0.0003 : -0.0004;
      const d = 80;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
    }
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    // 6. Combined Export Group (Terrain + Placed Objects) - Freeze static matrix
    const exportGroup = new THREE.Group();
    exportGroup.name = 'TerraForge_ExportGroup';
    exportGroup.matrixAutoUpdate = false;
    exportGroup.updateMatrix();
    scene.add(exportGroup);
    exportGroupRef.current = exportGroup;

    // 7. Terrain Mesh - Ganti ke MeshLambertMaterial & freeze matrixAutoUpdate (Rule 1 & 3)
    const terrainGeo = new THREE.PlaneGeometry(
      terrainConfig.size,
      terrainConfig.size,
      terrainConfig.resolution - 1,
      terrainConfig.resolution - 1
    );
    terrainGeo.rotateX(-Math.PI / 2);

    // Apply initial heights and vertex colors at mount time so shaders compile with vertexColors
    const initPosArr = terrainGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < heights.length; i++) {
      initPosArr[i * 3 + 1] = heights[i];
    }
    terrainGeo.attributes.position.needsUpdate = true;
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: !terrainConfig.smoothShading,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.name = 'TerrainMesh';
    terrainMesh.receiveShadow = initialPreset !== 'LOW'; // Shadows active on MEDIUM & HIGH
    terrainMesh.castShadow = false;
    terrainMesh.frustumCulled = true;
    terrainMesh.matrixAutoUpdate = false;
    terrainMesh.updateMatrix();
    exportGroup.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // 8. Water Plane - MeshPhongMaterial Low-Poly (24x24 segments for faceted wave vertices)
    const oceanMult = terrainConfig.oceanScale ?? 1.9;
    const waterSize = Math.max(terrainConfig.size * oceanMult, 220);
    const waterSegments = 24;
    const waterGeo = new THREE.PlaneGeometry(waterSize, waterSize, waterSegments, waterSegments);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(palette.waterColor),
      transparent: true,
      opacity: 0.82,
      flatShading: true,
      shininess: 45,
      specular: new THREE.Color(0x99ddff),
      depthWrite: false,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = terrainConfig.waterLevel;
    waterMesh.name = 'WaterPlane';
    waterMesh.receiveShadow = false;
    waterMesh.castShadow = false;
    waterMesh.frustumCulled = true;
    waterMesh.matrixAutoUpdate = false;
    waterMesh.updateMatrix();
    scene.add(waterMesh);
    waterMeshRef.current = waterMesh;

    // 8b. Surrounding archipelago atolls - MeshLambertMaterial (Rule 3)
    const horizonGroup = new THREE.Group();
    horizonGroup.name = 'HorizonDistantIslands';
    const sandStop = palette.stops[1] || [0.15, 0.88, 0.78, 0.55];
    const rockStop = palette.stops[4] || [0.75, 0.45, 0.42, 0.38];
    const atollMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(sandStop[1], sandStop[2], sandStop[3]),
    });
    const reefMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(rockStop[1], rockStop[2], rockStop[3]),
    });

    const atollCount = 8;
    const baseRad = terrainConfig.size * 0.62;
    for (let p = 0; p < atollCount; p++) {
      const angle = (p / atollCount) * Math.PI * 2 + 0.35;
      const dist = baseRad * (1.1 + (p % 3) * 0.22);
      const px = Math.cos(angle) * dist;
      const pz = Math.sin(angle) * dist;

      // Stylized sandy atoll ring
      const atollGeo = new THREE.CylinderGeometry(5.0, 7.0, 1.4, 7);
      const atollMesh = new THREE.Mesh(atollGeo, atollMat);
      atollMesh.position.set(px, terrainConfig.waterLevel - 0.2, pz);
      const s = 0.8 + (p % 4) * 0.35;
      atollMesh.scale.set(s, s * 0.8, s);
      atollMesh.frustumCulled = true;
      atollMesh.matrixAutoUpdate = false;
      atollMesh.updateMatrix();
      horizonGroup.add(atollMesh);

      // Low rock spine on top
      const reefGeo = new THREE.ConeGeometry(2.0, 3.2, 5);
      const reefMesh = new THREE.Mesh(reefGeo, reefMat);
      reefMesh.position.set(px + 1.2, terrainConfig.waterLevel + 0.7, pz - 0.8);
      reefMesh.frustumCulled = true;
      reefMesh.matrixAutoUpdate = false;
      reefMesh.updateMatrix();
      horizonGroup.add(reefMesh);
    }
    horizonGroup.matrixAutoUpdate = false;
    horizonGroup.updateMatrix();
    scene.add(horizonGroup);

    // 10. Objects Group - Freeze static matrix
    const objectsGroup = new THREE.Group();
    objectsGroup.name = 'PlacedObjectsGroup';
    objectsGroup.matrixAutoUpdate = false;
    objectsGroup.updateMatrix();
    exportGroup.add(objectsGroup);
    objectsGroupRef.current = objectsGroup;

    // 11. Brush Ring Indicator
    const ringSegments = 48;
    const ringPoints: THREE.Vector3[] = [];
    for (let i = 0; i < ringSegments; i++) {
      const angle = (i / ringSegments) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    });
    const brushRing = new THREE.LineLoop(ringGeo, ringMat);
    brushRing.visible = false;
    brushRing.renderOrder = 999;
    scene.add(brushRing);
    brushRingRef.current = brushRing;

    // 12. Ghost Placement Preview Group
    const ghostGroup = new THREE.Group();
    ghostGroup.name = 'GhostPlacementPreview';
    ghostGroup.visible = false;
    scene.add(ghostGroup);
    ghostPreviewRef.current = ghostGroup;

    // 13. Selection Box Helper
    const selectionBox = new THREE.BoxHelper(new THREE.Mesh(), 0xfacc15);
    selectionBox.visible = false;
    selectionBox.renderOrder = 998;
    (selectionBox.material as THREE.LineBasicMaterial).depthTest = false;
    scene.add(selectionBox);
    selectionBoxRef.current = selectionBox;

    // Notify parent
    if (onSceneReady) {
      onSceneReady(scene, exportGroup);
    }

    // 14. Render Animation Loop with FPS tracking & Mobile Performance
    let animationFrameId: number;
    let clock = new THREE.Clock();
    let lastRenderTime = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();

      // FPS tracking
      frameCount++;
      if (now - lastFpsTime >= 500) {
        const currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
        if (onFpsUpdate) onFpsUpdate(currentFps);
        frameCount = 0;
        lastFpsTime = now;
      }

      if (isSoftwareOrHeadless) {
        if (now - lastRenderTime < 75) return; // ~13 fps for headless CPU test
        lastRenderTime = now;
      }

      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      controls.update();

      // Water wave dynamics per graphics preset:
      // LOW: Static water plane (0 buffer uploads, 0 matrix updates)
      // MEDIUM: Smooth zero-CPU bobbing (position transform only)
      // HIGH: Dynamic low-poly sinusoidal vertex displacement + normal recalculation
      const currentPreset = normalizePreset(propsRef.current.graphicsPreset, propsRef.current.performanceMode);
      if (waterMeshRef.current) {
        if (currentPreset === 'HIGH') {
          const geo = waterMeshRef.current.geometry as THREE.BufferGeometry;
          const pos = geo.attributes.position.array as Float32Array;
          const count = geo.attributes.position.count;
          for (let i = 0; i < count; i++) {
            const px = pos[i * 3];
            const pz = pos[i * 3 + 2];
            pos[i * 3 + 1] =
              Math.sin(px * 0.07 + elapsed * 1.5) * 0.32 +
              Math.cos(pz * 0.05 + elapsed * 1.2) * 0.24 +
              Math.sin((px + pz) * 0.04 + elapsed * 0.9) * 0.14;
          }
          geo.attributes.position.needsUpdate = true;
          geo.computeVertexNormals();
          waterMeshRef.current.position.y = propsRef.current.terrainConfig.waterLevel;
          waterMeshRef.current.updateMatrix();
        } else if (currentPreset === 'MEDIUM') {
          waterMeshRef.current.position.y = propsRef.current.terrainConfig.waterLevel + Math.sin(elapsed * 1.0) * 0.08;
          waterMeshRef.current.updateMatrix();
        } else {
          waterMeshRef.current.position.y = propsRef.current.terrainConfig.waterLevel;
        }
      }

      // Rotate windmill blades and turbines via direct array (0 tree traversal!)
      const rotors = animatedRotorsRef.current;
      for (let i = 0; i < rotors.length; i++) {
        rotors[i].obj.rotation.z += delta * rotors[i].speed;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 15. Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      const isMobile =
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth < 768;
      const maxRatio = isMobile || propsRef.current.performanceMode === 'mobile' ? 1.0 : 1.25;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    };

    window.addEventListener('resize', handleResize);

    // Listen for camera preset changes from TopBar
    const handlePreset = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !cameraRef.current || !controlsRef.current) return;
      const { preset } = detail;
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      ctrl.target.set(0, 4, 0);
      if (preset === 'iso') {
        cam.position.set(65, 50, 65);
      } else if (preset === 'top') {
        cam.position.set(0, 110, 0.1);
      } else if (preset === 'cinematic') {
        cam.position.set(35, 12, 35);
      } else if (preset === 'reset') {
        cam.position.set(65, 50, 75);
      }
    };
    window.addEventListener('terraforge-camera-preset', handlePreset);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('terraforge-camera-preset', handlePreset);
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // Run once on mount

  // Sync terrain geometry positions and colors when heights/colors change (Rule 3)
  useEffect(() => {
    const terrain = terrainMeshRef.current;
    if (!terrain) return;

    // Redundant execution guard: prevent any re-render or buffer upload of island geometry unless genuinely changed
    const isSameHeights = lastAppliedHeightsRef.current === heights;
    const isSameColors = lastAppliedColorsRef.current === colors;
    const isSameRes = lastResRef.current === terrainConfig.resolution;
    const isSameSize = lastSizeRef.current === terrainConfig.size;
    const isSameSmooth = lastSmoothRef.current === terrainConfig.smoothShading;

    if (isSameHeights && isSameColors && isSameRes && isSameSize && isSameSmooth) {
      return;
    }

    lastAppliedHeightsRef.current = heights;
    lastAppliedColorsRef.current = colors;
    lastResRef.current = terrainConfig.resolution;
    lastSizeRef.current = terrainConfig.size;
    lastSmoothRef.current = terrainConfig.smoothShading;

    let geo = terrain.geometry as THREE.BufferGeometry;
    const posAttr = geo.attributes.position;

    if (!posAttr || posAttr.count !== heights.length) {
      // Re-create geometry if resolution changed
      geo.dispose();
      const newGeo = new THREE.PlaneGeometry(
        terrainConfig.size,
        terrainConfig.size,
        terrainConfig.resolution - 1,
        terrainConfig.resolution - 1
      );
      newGeo.rotateX(-Math.PI / 2);
      terrain.geometry = newGeo;
      geo = newGeo;
    }

    const pos = geo.attributes.position;
    const posArr = pos.array as Float32Array;
    for (let i = 0; i < heights.length; i++) {
      posArr[i * 3 + 1] = heights[i];
    }
    pos.needsUpdate = true;

    // Apply vertex colors (in-place buffer update for zero GC overhead and instant response)
    if (!geo.attributes.color || geo.attributes.color.count !== heights.length) {
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
      (terrain.material as THREE.MeshLambertMaterial).needsUpdate = true;
    } else {
      const colArr = geo.attributes.color.array as Float32Array;
      colArr.set(colors);
      geo.attributes.color.needsUpdate = true;
    }

    // Sync material flatShading vs smoothShading
    const mat = terrain.material as THREE.MeshLambertMaterial;
    if (mat) {
      const wantFlat = !terrainConfig.smoothShading;
      if (mat.flatShading !== wantFlat) {
        mat.flatShading = wantFlat;
        mat.needsUpdate = true;
      }
    }

    geo.computeVertexNormals();

    // Ensure terrain matrix remains strictly static
    terrain.matrixAutoUpdate = false;
    terrain.updateMatrix();
  }, [heights, colors, terrainConfig.resolution, terrainConfig.size, terrainConfig.smoothShading]);

  // Sync atmosphere, sky, fog, lighting, and water visuals based on Biome, TimeOfDay, and GraphicsPreset
  useEffect(() => {
    if (!sceneRef.current || !keyLightRef.current || !ambientLightRef.current) return;
    const currentPreset = normalizePreset(graphicsPreset, performanceMode);
    const atm = getAtmosphereSettings(terrainConfig.biome, timeOfDay);

    // 1. Sky & Horizon Fog (FogExp2 matching sky/horizon background color)
    sceneRef.current.background = new THREE.Color(atm.skyColor);
    if (currentPreset === 'LOW') {
      sceneRef.current.fog = null;
    } else {
      sceneRef.current.fog = new THREE.FogExp2(
        atm.fogColor,
        currentPreset === 'HIGH' ? atm.fogDensity * 1.05 : atm.fogDensity
      );
    }

    // 2. Warm dimensional directional light & ambient fill
    const key = keyLightRef.current;
    const amb = ambientLightRef.current;
    key.color.setHex(atm.sunColor);
    key.intensity = atm.sunIntensity;
    key.position.set(...atm.sunPos);

    amb.color.setHex(atm.ambientColor);
    amb.intensity = atm.ambientIntensity;

    // 3. Water mesh color & level
    if (waterMeshRef.current) {
      waterMeshRef.current.position.y = terrainConfig.waterLevel;
      const palette = BIOME_PALETTES[terrainConfig.biome] || BIOME_PALETTES.archipelago;
      (waterMeshRef.current.material as THREE.MeshPhongMaterial).color.set(palette.waterColor);
    }
  }, [terrainConfig.biome, terrainConfig.waterLevel, timeOfDay, graphicsPreset, performanceMode]);

  // Dynamic Graphics Preset Adjustments: Shadows, Pixel Ratio, and Water Flatness
  useEffect(() => {
    if (!rendererRef.current) return;
    const currentPreset = normalizePreset(graphicsPreset, performanceMode);
    const isHeadlessOrBot =
      Boolean(navigator.webdriver) ||
      /HeadlessChrome|Headless/i.test(navigator.userAgent);

    // Resolution scaling per preset: LOW = 1.0, MEDIUM = 1.25, HIGH = 1.5
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const targetRatio = currentPreset === 'LOW' ? 1.0 : currentPreset === 'MEDIUM' ? 1.25 : 1.5;
    const effectivePixelRatio = isHeadlessOrBot ? 1 : Math.min(dpr, targetRatio);
    rendererRef.current.setPixelRatio(effectivePixelRatio);

    // Shadow Map configuration
    const enableShadows = currentPreset !== 'LOW';
    if (rendererRef.current.shadowMap) {
      rendererRef.current.shadowMap.enabled = enableShadows;
      if (enableShadows) {
        rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current.shadowMap.needsUpdate = true;
      }
    }
    if (keyLightRef.current) {
      keyLightRef.current.castShadow = enableShadows;
      if (keyLightRef.current.shadow) {
        const res = currentPreset === 'HIGH' ? 1024 : 512;
        keyLightRef.current.shadow.mapSize.set(res, res);
        keyLightRef.current.shadow.bias = currentPreset === 'HIGH' ? -0.0003 : -0.0004;
        if (keyLightRef.current.shadow.map) {
          keyLightRef.current.shadow.map.dispose();
          (keyLightRef.current.shadow.map as any) = null;
        }
      }
    }

    if (terrainMeshRef.current) {
      terrainMeshRef.current.receiveShadow = enableShadows;
    }

    // Reset water wave displacement if leaving HIGH mode
    if (currentPreset !== 'HIGH' && waterMeshRef.current) {
      const geo = waterMeshRef.current.geometry as THREE.BufferGeometry;
      const pos = geo.attributes.position.array as Float32Array;
      const count = geo.attributes.position.count;
      let changed = false;
      for (let i = 0; i < count; i++) {
        if (pos[i * 3 + 1] !== 0) {
          pos[i * 3 + 1] = 0;
          changed = true;
        }
      }
      if (changed) {
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
      }
    }
  }, [graphicsPreset, performanceMode]);

  // Sync 3D placed objects whenever placedObjects changes with GPU Instancing (drops draw calls by ~98%!)
  useEffect(() => {
    const group = objectsGroupRef.current;
    if (!group) return;

    // Clear existing objects and dispose old instanced geometry/matrix buffers
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as THREE.InstancedMesh).isInstancedMesh) {
        (child as THREE.InstancedMesh).dispose?.();
      }
    }

    if (placedObjects.length === 0) {
      if (selectionBoxRef.current) selectionBoxRef.current.visible = false;
      animatedRotorsRef.current = [];
      return;
    }

    const isMobileDevice =
      typeof navigator !== 'undefined' &&
      (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' && window.innerWidth < 768));

    // Models with animated sub-components (windmills, turbines) remain as separate groups so blades can spin
    const animatedTypes = new Set(['stone_windmill', 'wind_turbine']);
    const animatedObjects: PlacedObject[] = [];
    const instancedGroups = new Map<string, PlacedObject[]>();

    placedObjects.forEach((obj) => {
      if (animatedTypes.has(obj.type)) {
        animatedObjects.push(obj);
      } else {
        const key = obj.category === 'custom' && obj.customModelKey ? `custom_${obj.customModelKey}` : obj.type;
        const list = instancedGroups.get(key);
        if (list) {
          list.push(obj);
        } else {
          instancedGroups.set(key, [obj]);
        }
      }
    });

    // 1. Render all repeated static models as InstancedMesh (merges 100+ items into 1-2 draw calls per part)
    instancedGroups.forEach((instances, modelKey) => {
      if (instances.length === 0) return;
      const firstObj = instances[0];
      let template: THREE.Group | null = null;
      if (firstObj.category === 'custom' && firstObj.customModelKey) {
        template = getCustomModelClone(firstObj.customModelKey);
      }
      if (!template) {
        template = instantiateModel(firstObj.type);
      }
      if (!template) return;

      template.updateMatrixWorld(true);

      interface PartInfo {
        geometry: THREE.BufferGeometry;
        material: THREE.Material | THREE.Material[];
        localMatrix: THREE.Matrix4;
        castShadow: boolean;
        receiveShadow: boolean;
        name: string;
      }
      const parts: PartInfo[] = [];

      template.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          parts.push({
            geometry: m.geometry,
            material: m.material,
            localMatrix: m.matrixWorld.clone(),
            castShadow: m.castShadow,
            receiveShadow: m.receiveShadow,
            name: m.name,
          });
        }
      });

      const count = instances.length;
      const isFoliageOrGrass =
        firstObj.type.includes('grass') ||
        firstObj.type.includes('flower') ||
        firstObj.category === 'foliage' ||
        firstObj.category === 'path';

      parts.forEach((part, partIdx) => {
        const instMesh = new THREE.InstancedMesh(part.geometry, part.material, count);
        instMesh.name = `${modelKey}_part_${partIdx}`;
        instMesh.frustumCulled = true;

        // Shadow configuration: disabled completely in LOW, active for solid structures in MEDIUM & HIGH
        const currentPreset = normalizePreset(graphicsPreset, performanceMode);
        const enableShadow = currentPreset !== 'LOW' && !isFoliageOrGrass;
        instMesh.castShadow = enableShadow && part.castShadow;
        instMesh.receiveShadow = enableShadow && part.receiveShadow;

        (instMesh as any).userData = {
          isInstanced: true,
          modelKey,
          objectIds: instances.map((o) => o.id),
        };

        for (let i = 0; i < count; i++) {
          const obj = instances[i];
          _dummyObj.position.set(...obj.position);
          _dummyObj.rotation.set(...obj.rotation);
          _dummyObj.scale.set(...obj.scale);
          _dummyObj.updateMatrix();

          _combinedMat.multiplyMatrices(_dummyObj.matrix, part.localMatrix);
          instMesh.setMatrixAt(i, _combinedMat);
        }

        instMesh.instanceMatrix.needsUpdate = true;
        instMesh.computeBoundingSphere();

        // Rule 1: Nonaktifkan matrixAutoUpdate untuk semua mesh lingkungan statis (pohon, bangunan, mercusuar, rumput)
        instMesh.matrixAutoUpdate = false;
        instMesh.updateMatrix();
        instMesh.updateMatrixWorld(true);

        group.add(instMesh);
      });
    });

    // 2. Render animated objects as standard Groups (with animated rotors)
    animatedObjects.forEach((obj) => {
      let modelMesh: THREE.Group | null = instantiateModel(obj.type);
      modelMesh.name = obj.id;
      modelMesh.position.set(...obj.position);
      modelMesh.rotation.set(...obj.rotation);
      modelMesh.scale.set(...obj.scale);
      (modelMesh as any).userData = { objectId: obj.id };
      modelMesh.updateMatrix();
      modelMesh.matrixAutoUpdate = false;

      modelMesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.frustumCulled = true;
          if (currentPreset === 'LOW') {
            child.castShadow = false;
            child.receiveShadow = false;
          } else {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        }
        // Rule 1: Nonaktifkan matrixAutoUpdate untuk sub-mesh statis (hanya rotor yang berputar di animate)
        if (child.name !== 'windmill_rotor' && child.name !== 'turbine_rotor') {
          child.updateMatrix();
          child.matrixAutoUpdate = false;
        }
      });
      group.add(modelMesh);
    });

    group.matrixAutoUpdate = false;
    group.updateMatrix();

    // Cache animated rotors once here to avoid per-frame scene graph traversal
    const rotors: { obj: THREE.Object3D; speed: number }[] = [];
    group.traverse((child) => {
      if (child.name === 'windmill_rotor') {
        rotors.push({ obj: child, speed: 1.5 });
      } else if (child.name === 'turbine_rotor') {
        rotors.push({ obj: child, speed: 2.2 });
      }
    });
    animatedRotorsRef.current = rotors;

    // 3. Selection Box Helper update
    if (selectionBoxRef.current) {
      if (selectedObjectId) {
        const selectedObj = placedObjects.find((o) => o.id === selectedObjectId);
        if (selectedObj) {
          const directChild = group.children.find((c) => (c as any).userData?.objectId === selectedObjectId);
          if (directChild) {
            selectionBoxRef.current.setFromObject(directChild);
          } else {
            const isGrass = selectedObj.type.includes('grass') || selectedObj.type.includes('flower');
            const isTree = selectedObj.type.includes('tree');
            const isBuilding = selectedObj.category === 'building' || selectedObj.category === 'cyber';
            const boxW = isGrass ? 1.8 : isTree ? 3.0 : isBuilding ? 5.2 : 3.2;
            const boxH = isGrass ? 1.4 : isTree ? 5.5 : isBuilding ? 7.0 : 4.0;

            _selectionDummy.geometry.dispose();
            _selectionDummy.geometry = new THREE.BoxGeometry(
              boxW * selectedObj.scale[0],
              boxH * selectedObj.scale[1],
              boxW * selectedObj.scale[2]
            );
            _selectionDummy.position.set(
              selectedObj.position[0],
              selectedObj.position[1] + (boxH * selectedObj.scale[1]) / 2,
              selectedObj.position[2]
            );
            _selectionDummy.rotation.set(...selectedObj.rotation);
            _selectionDummy.updateMatrixWorld(true);
            selectionBoxRef.current.setFromObject(_selectionDummy);
          }
          selectionBoxRef.current.visible = true;
        } else {
          selectionBoxRef.current.visible = false;
        }
      } else {
        selectionBoxRef.current.visible = false;
      }
    }
  }, [placedObjects, selectedObjectId, graphicsPreset, performanceMode]);

  // Update ghost preview when activePaletteItem or brushSettings change
  useEffect(() => {
    const ghost = ghostPreviewRef.current;
    if (!ghost) return;

    while (ghost.children.length > 0) {
      ghost.remove(ghost.children[0]);
    }

    if (brushSettings.mode === 'place' && activePaletteItem) {
      let preview: THREE.Group | null = null;
      if (activePaletteItem.isCustom) {
        preview = getCustomModelClone(activePaletteItem.id);
      } else {
        preview = instantiateModel(activePaletteItem.id);
      }

      if (preview) {
        // Apply semi-transparent ghost look
        preview.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            m.castShadow = false;
            m.receiveShadow = false;
            if (m.material) {
              const mat = (Array.isArray(m.material) ? m.material[0] : m.material).clone();
              mat.transparent = true;
              mat.opacity = 0.6;
              m.material = mat;
            }
          }
        });
        ghost.add(preview);
      }
    }
  }, [activePaletteItem, brushSettings.mode]);

  // Pointer event handlers for sculpting and object interaction
  const getTerrainIntersection = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    const terrain = terrainMeshRef.current;
    if (!container || !camera || !terrain) return null;

    const rect = container.getBoundingClientRect();
    _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);
    const intersects = _raycaster.intersectObject(terrain, false);

    if (intersects.length > 0) {
      return intersects[0].point;
    }
    return null;
  };

  const getObjectIntersection = (clientX: number, clientY: number): string | null => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    const group = objectsGroupRef.current;
    if (!container || !camera || !group) return null;

    const rect = container.getBoundingClientRect();
    _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);
    const intersects = _raycaster.intersectObjects(group.children, true);

    if (intersects.length > 0) {
      for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        const instMesh = hit.object as THREE.InstancedMesh;
        if (instMesh.isInstancedMesh && hit.instanceId !== undefined) {
          const ids = (instMesh as any).userData?.objectIds;
          if (ids && ids[hit.instanceId]) {
            return ids[hit.instanceId];
          }
        }

        // Find top group child with userData.objectId (e.g. animated windmills)
        let curr: THREE.Object3D | null = hit.object;
        while (curr && curr.parent !== group) {
          curr = curr.parent;
        }
        if (curr && (curr as any).userData?.objectId) {
          return (curr as any).userData.objectId;
        }
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // only left click
    isMouseDownRef.current = true;
    didDragRef.current = false;
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

    const { brushSettings } = propsRef.current;
    if (brushSettings.mode.startsWith('sculpt')) {
      if (controlsRef.current) controlsRef.current.enabled = false;
      applySculptAtPointer(e.clientX, e.clientY);
    }
  };

  const applySculptAtPointer = (clientX: number, clientY: number) => {
    const { brushSettings, heights, colors, terrainConfig, onHeightmapChange, onTerrainBuffersChange } = propsRef.current;
    const pt = getTerrainIntersection(clientX, clientY);
    if (!pt) return;

    if (brushSettings.mode === 'sculpt-path') {
      const newHeights = new Float32Array(heights);
      const newColors = new Float32Array(colors);
      applyPathBrush(
        pt.x,
        pt.z,
        newHeights,
        newColors,
        terrainConfig.size,
        terrainConfig.resolution,
        brushSettings.pathStyle || terrainConfig.pathStyle || 'blend_natural',
        brushSettings.radius,
        brushSettings.intensity,
        brushSettings.pathBlendRatios
      );

      // Direct buffer attribute update for instantaneous 60fps response
      const terrain = terrainMeshRef.current;
      if (terrain) {
        const geo = terrain.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position;
        if (pos) {
          const posArr = pos.array as Float32Array;
          for (let i = 0; i < newHeights.length; i++) {
            posArr[i * 3 + 1] = newHeights[i];
          }
          pos.needsUpdate = true;
        }
        if (geo.attributes.color && geo.attributes.color.count === newColors.length / 3) {
          (geo.attributes.color.array as Float32Array).set(newColors);
          geo.attributes.color.needsUpdate = true;
        } else {
          geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(newColors), 3));
          if (geo.attributes.color) geo.attributes.color.needsUpdate = true;
        }
        geo.computeVertexNormals();
      }

      lastAppliedHeightsRef.current = newHeights;
      lastAppliedColorsRef.current = newColors;

      if (onTerrainBuffersChange) {
        onTerrainBuffersChange(newHeights, newColors);
      } else {
        onHeightmapChange(newHeights);
      }
    } else {
      const newHeights = new Float32Array(heights);
      applySculptBrush(
        pt.x,
        pt.z,
        newHeights,
        terrainConfig.size,
        terrainConfig.resolution,
        brushSettings.mode as any,
        brushSettings.radius,
        brushSettings.intensity,
        brushSettings.flattenHeight
      );

      const terrain = terrainMeshRef.current;
      if (terrain) {
        const geo = terrain.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position;
        if (pos) {
          const posArr = pos.array as Float32Array;
          for (let i = 0; i < newHeights.length; i++) {
            posArr[i * 3 + 1] = newHeights[i];
          }
          pos.needsUpdate = true;
        }
        geo.computeVertexNormals();
      }

      lastAppliedHeightsRef.current = newHeights;
      onHeightmapChange(newHeights);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
    const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
    if (dx > 4 || dy > 4) {
      didDragRef.current = true;
    }

    const { brushSettings, activePaletteItem } = propsRef.current;

    // Skip raycast when just navigating in select mode
    if (brushSettings.mode === 'select' && !isMouseDownRef.current) {
      return;
    }

    // Throttle raycasting on touch/mobile to prevent stutter
    const now = performance.now();
    if (now - lastRaycastTimeRef.current < 25) {
      return;
    }
    lastRaycastTimeRef.current = now;

    const pt = getTerrainIntersection(e.clientX, e.clientY);

    // Update brush ring indicator position and radius
    if (brushRingRef.current) {
      if (pt && brushSettings.mode.startsWith('sculpt')) {
        brushRingRef.current.visible = true;
        brushRingRef.current.position.set(pt.x, pt.y + 0.1, pt.z);
        brushRingRef.current.scale.set(brushSettings.radius, 1, brushSettings.radius);
      } else {
        brushRingRef.current.visible = false;
      }
    }

    // Update ghost placement preview
    if (ghostPreviewRef.current) {
      if (pt && brushSettings.mode === 'place' && activePaletteItem) {
        ghostPreviewRef.current.visible = true;
        ghostPreviewRef.current.position.set(pt.x, pt.y, pt.z);
      } else {
        ghostPreviewRef.current.visible = false;
      }
    }

    // Drag-sculpting continuous update
    if (isMouseDownRef.current && brushSettings.mode.startsWith('sculpt')) {
      applySculptAtPointer(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isMouseDownRef.current = false;
    if (controlsRef.current) controlsRef.current.enabled = true;

    // Only trigger placement or selection if user simply clicked (didn't drag camera)
    if (!didDragRef.current) {
      const {
        brushSettings,
        activePaletteItem,
        onObjectPlaced,
        onObjectSelected,
        placedObjects,
      } = propsRef.current;

      if (brushSettings.mode === 'place' && activePaletteItem) {
        const pt = getTerrainIntersection(e.clientX, e.clientY);
        if (pt) {
          const newObj: PlacedObject = {
            id: 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            name: activePaletteItem.name,
            type: activePaletteItem.id,
            category: activePaletteItem.category,
            position: [pt.x, pt.y, pt.z],
            rotation: [0, (Math.random() * Math.PI) / 4, 0], // subtle natural angle
            scale: [...activePaletteItem.defaultScale],
            customModelKey: activePaletteItem.isCustom ? activePaletteItem.id : undefined,
          };
          onObjectPlaced(newObj);
        }
      } else if (brushSettings.mode === 'select') {
        const hitId = getObjectIntersection(e.clientX, e.clientY);
        if (hitId) {
          const selected = placedObjects.find((o) => o.id === hitId) || null;
          onObjectSelected(selected);
        } else {
          onObjectSelected(null);
        }
      }
    }
  };

  return (
    <div
      ref={mountRef}
      role="region"
      aria-label="3D Terrain and World Viewport"
      className="absolute inset-0 w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
};
