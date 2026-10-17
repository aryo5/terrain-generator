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
import { PerformanceMode } from '../types';

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
  performanceMode: PerformanceMode;
  onFpsUpdate?: (fps: number) => void;
  onSceneReady?: (scene: THREE.Scene, exportGroup: THREE.Group) => void;
}

// Module-level pre-allocated scratch objects to prevent GC in animation loop
const _vec3 = new THREE.Vector3();
const _mouse = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

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
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const animatedRotorsRef = useRef<{ obj: THREE.Object3D; speed: number }[]>([]);

  // Interaction tracking
  const isMouseDownRef = useRef(false);
  const didDragRef = useRef(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });
  const lastRaycastTimeRef = useRef(0);

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

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const palette = BIOME_PALETTES[terrainConfig.biome] || BIOME_PALETTES.archipelago;
    scene.background = new THREE.Color(palette.skyColor);
    scene.fog = new THREE.FogExp2(palette.fogColor, 0.0038);

    // 2. Camera setup - near plane 0.5 prevents close-up geometric clipping when zooming into village details
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1200);
    camera.position.set(75, 55, 85);
    cameraRef.current = camera;

    // 3. Renderer setup - highp precision eliminates normal derivative collapse on mobile
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      precision: 'highp',
    });
    renderer.setSize(width, height);

    // Detect software rendering
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const unmaskedRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    const isSoftwareOrHeadless =
      Boolean(navigator.webdriver) ||
      /HeadlessChrome|Headless/i.test(navigator.userAgent) ||
      /llvmpipe|swiftshader|mesa|software|cpu/i.test(unmaskedRenderer);

    // Mobile pixel ratio clamp: 1.15 max ensures razor-sharp look without 3x/4x mobile GPU burn
    const maxPixelRatio = isMobileDevice || performanceMode === 'mobile' ? 1.15 : (performanceMode === 'balanced' ? 1.5 : 2.0);
    renderer.setPixelRatio(isSoftwareOrHeadless ? 1 : Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Mobile disables shadow map for buttery smooth 60fps (contact shadow discs provide crisp grounding)
    renderer.shadowMap.enabled = !isMobileDevice && !isSoftwareOrHeadless && performanceMode === 'ultra';
    if (renderer.shadowMap.enabled) {
      renderer.shadowMap.type = THREE.BasicShadowMap;
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

    // 5. Ambient Light Baseline (ensures zero pitch-black surfaces in close-up or shaded views)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    if (!isMobileDevice && !isSoftwareOrHeadless && performanceMode === 'ultra') {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    }

    // 6. Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xfff8e7, 0x1e293b, 0.95);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.8);
    keyLight.position.set(70, 95, 60);
    keyLight.castShadow = renderer.shadowMap.enabled;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 512;
      keyLight.shadow.mapSize.height = 512;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    // 7. Combined Export Group (Terrain + Placed Objects)
    const exportGroup = new THREE.Group();
    exportGroup.name = 'TerraForge_ExportGroup';
    scene.add(exportGroup);
    exportGroupRef.current = exportGroup;

    // 8. Terrain Mesh - Smooth shading by default eliminates visible triangle facets
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

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.08,
      flatShading: !terrainConfig.smoothShading,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.name = 'TerrainMesh';
    terrainMesh.receiveShadow = renderer.shadowMap.enabled;
    terrainMesh.castShadow = renderer.shadowMap.enabled;
    exportGroup.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // 9. Water Plane - Proportionately scaled so the land feels expansive rather than lost in void
    const oceanMult = terrainConfig.oceanScale ?? 1.9;
    const waterSize = Math.max(terrainConfig.size * oceanMult, 220);
    const waterGeo = new THREE.PlaneGeometry(waterSize, waterSize, 12, 12);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.waterColor),
      transparent: true,
      opacity: 0.76,
      roughness: 0.14,
      metalness: 0.12,
      depthWrite: false,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = terrainConfig.waterLevel;
    waterMesh.name = 'WaterPlane';
    scene.add(waterMesh);
    waterMeshRef.current = waterMesh;

    // 9b. Surrounding archipelago atolls and coastal reefs framing the expansive landscape
    const horizonGroup = new THREE.Group();
    horizonGroup.name = 'HorizonDistantIslands';
    const sandStop = palette.stops[1] || [0.15, 0.88, 0.78, 0.55];
    const rockStop = palette.stops[4] || [0.75, 0.45, 0.42, 0.38];
    const atollMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(sandStop[1], sandStop[2], sandStop[3]),
      roughness: 0.9,
    });
    const reefMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(rockStop[1], rockStop[2], rockStop[3]),
      roughness: 0.85,
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
      horizonGroup.add(atollMesh);

      // Low rock spine on top
      const reefGeo = new THREE.ConeGeometry(2.0, 3.2, 5);
      const reefMesh = new THREE.Mesh(reefGeo, reefMat);
      reefMesh.position.set(px + 1.2, terrainConfig.waterLevel + 0.7, pz - 0.8);
      horizonGroup.add(reefMesh);
    }
    scene.add(horizonGroup);

    // 10. Objects Group
    const objectsGroup = new THREE.Group();
    objectsGroup.name = 'PlacedObjectsGroup';
    exportGroup.add(objectsGroup);
    objectsGroupRef.current = objectsGroup;
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

      // Zero-CPU water wave bobbing (pure position transform, 0 buffer uploads!)
      if (waterMeshRef.current) {
        waterMeshRef.current.position.y = propsRef.current.terrainConfig.waterLevel + Math.sin(elapsed * 1.2) * 0.08;
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

  // Sync terrain geometry positions and colors when heights/colors change
  useEffect(() => {
    const terrain = terrainMeshRef.current;
    if (!terrain) return;

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
      (terrain.material as THREE.MeshStandardMaterial).needsUpdate = true;
    } else {
      const colArr = geo.attributes.color.array as Float32Array;
      colArr.set(colors);
      geo.attributes.color.needsUpdate = true;
    }

    // Sync material flatShading vs smoothShading
    const mat = terrain.material as THREE.MeshStandardMaterial;
    if (mat) {
      const wantFlat = !terrainConfig.smoothShading;
      if (mat.flatShading !== wantFlat) {
        mat.flatShading = wantFlat;
        mat.needsUpdate = true;
      }
    }

    geo.computeVertexNormals();
  }, [heights, colors, terrainConfig.resolution, terrainConfig.size, terrainConfig.smoothShading]);

  // Sync water level, size, and biome visuals
  useEffect(() => {
    const palette = BIOME_PALETTES[terrainConfig.biome] || BIOME_PALETTES.archipelago;
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(palette.skyColor);
      sceneRef.current.fog = new THREE.FogExp2(palette.fogColor, 0.0038);
    }
    if (waterMeshRef.current) {
      waterMeshRef.current.position.y = terrainConfig.waterLevel;
      (waterMeshRef.current.material as THREE.MeshStandardMaterial).color.set(palette.waterColor);
    }
  }, [terrainConfig.biome, terrainConfig.waterLevel]);

  // Sync lighting based on TimeOfDay
  useEffect(() => {
    if (!keyLightRef.current || !hemiLightRef.current || !sceneRef.current) return;
    const key = keyLightRef.current;
    const hemi = hemiLightRef.current;
    const scene = sceneRef.current;

    switch (timeOfDay) {
      case 'golden':
        key.color.setHex(0xffaa55);
        key.intensity = 2.4;
        key.position.set(60, 30, 60);
        hemi.color.setHex(0xffedd5);
        hemi.groundColor.setHex(0x78350f);
        break;
      case 'cyberpunk':
        key.color.setHex(0x06b6d4);
        key.intensity = 1.4;
        key.position.set(-40, 60, -30);
        hemi.color.setHex(0x38bdf8);
        hemi.groundColor.setHex(0x581c87);
        break;
      case 'sunset':
        key.color.setHex(0xf43f5e);
        key.intensity = 2.0;
        key.position.set(70, 20, 20);
        hemi.color.setHex(0xfbcfe8);
        hemi.groundColor.setHex(0x312e81);
        break;
      case 'night':
        key.color.setHex(0x60a5fa);
        key.intensity = 0.5;
        key.position.set(-30, 70, 40);
        hemi.color.setHex(0x1e1b4b);
        hemi.groundColor.setHex(0x020617);
        break;
      case 'day':
      default:
        key.color.setHex(0xfff5ea);
        key.intensity = 1.8;
        key.position.set(50, 80, 45);
        hemi.color.setHex(0xfff8e7);
        hemi.groundColor.setHex(0x1e293b);
        break;
    }
  }, [timeOfDay]);

  // Sync 3D placed objects whenever placedObjects changes
  useEffect(() => {
    const group = objectsGroupRef.current;
    if (!group) return;

    // Clear existing objects
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }

    // Instantiate and place each object
    placedObjects.forEach((obj) => {
      let modelMesh: THREE.Group | null = null;
      if (obj.category === 'custom' && obj.customModelKey) {
        modelMesh = getCustomModelClone(obj.customModelKey);
      }
      if (!modelMesh) {
        modelMesh = instantiateModel(obj.type);
      }

      modelMesh.name = obj.id;
      modelMesh.position.set(...obj.position);
      modelMesh.rotation.set(...obj.rotation);
      modelMesh.scale.set(...obj.scale);
      (modelMesh as any).userData = { objectId: obj.id };

      group.add(modelMesh);
    });

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

    // Update selection box if any selected
    if (selectionBoxRef.current) {
      if (selectedObjectId) {
        const found = group.children.find((c) => (c as any).userData?.objectId === selectedObjectId);
        if (found) {
          selectionBoxRef.current.setFromObject(found);
          selectionBoxRef.current.visible = true;
        } else {
          selectionBoxRef.current.visible = false;
        }
      } else {
        selectionBoxRef.current.visible = false;
      }
    }
  }, [placedObjects, selectedObjectId]);

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
      // Find top group child with userData.objectId
      let curr: THREE.Object3D | null = intersects[0].object;
      while (curr && curr.parent !== group) {
        curr = curr.parent;
      }
      if (curr && (curr as any).userData?.objectId) {
        return (curr as any).userData.objectId;
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
