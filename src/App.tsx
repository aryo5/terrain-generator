import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  BiomeType,
  BrushSettings,
  CustomAssetRecord,
  GraphicsPreset,
  PaletteItem,
  PerformanceMode,
  PlacedObject,
  TerrainConfig,
  TimeOfDay,
} from './types';
import { generateTerrainData, getSampledHeightAt, generateProceduralTrails } from './core/terrainGen';
import { STANDARD_PALETTE } from './core/modelFactory';
import {
  exportHeightmapPNG,
  exportSceneAsGLTF,
  exportSceneAsOBJ,
  exportSceneAsThreeJSON,
  parseUploaded3DFile,
} from './core/assetIO';
import { createPRNG } from './core/math';
import { Viewport3D } from './components/Viewport3D';
import { TopBar } from './components/TopBar';
import { ControlDock } from './components/ControlDock';
import { GraphicsSettingsModal } from './components/GraphicsSettingsModal';

const isMobileInitial = typeof window !== 'undefined' && (
  /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  window.innerWidth < 768
);

const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  seed: 2026,
  size: 110,
  resolution: isMobileInitial ? 32 : 44, // optimized 32x32 vertex grid for silky smooth 60fps on mobile
  heightScale: 28,
  roughness: 1.2,
  waterLevel: 2,
  islandFalloff: true,
  islandCoverage: 1.45, // broad, expansive island covering generous map area
  oceanScale: 1.9,      // balanced ocean framing without vast empty void
  terraceSteps: 0,
  biome: 'archipelago',
  smoothShading: true,
  pathStyle: 'blend_natural',
  pathBlendRatios: {
    stone: 40,
    gravel: 35,
    dirt: 25,
  },
};

export default function App() {
  const [terrainConfig, setTerrainConfig] = useState<TerrainConfig>(DEFAULT_TERRAIN_CONFIG);
  const [terrainData, setTerrainData] = useState(() => generateTerrainData(DEFAULT_TERRAIN_CONFIG));
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activePaletteItem, setActivePaletteItem] = useState<PaletteItem | null>(STANDARD_PALETTE[0]);
  const [customAssets, setCustomAssets] = useState<CustomAssetRecord[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('golden');
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(isMobileInitial ? 'mobile' : 'balanced');
  const [fps, setFps] = useState<number>(60);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [brushSettings, setBrushSettings] = useState<BrushSettings>({
    mode: 'select',
    radius: 12,
    intensity: 1.2,
    flattenHeight: 5,
    pathStyle: 'blend_natural',
    pathBlendRatios: {
      stone: 40,
      gravel: 35,
      dirt: 25,
    },
  });

  // Undo / Redo history stacks (tracking heightmaps + placedObjects)
  interface HistorySnapshot {
    heights: Float32Array;
    colors: Float32Array;
    objects: PlacedObject[];
  }
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // References to Three.js scene & export group
  const sceneRef = useRef<THREE.Scene | null>(null);
  const exportGroupRef = useRef<THREE.Group | null>(null);

  // Push new state to history
  const pushHistory = useCallback((snapshot: HistorySnapshot) => {
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, snapshot].slice(-20); // keep last 20 steps
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 19));
  }, [historyIndex]);

  // Regenerate terrain based on current config
  const handleRegenerateTerrain = useCallback((config = terrainConfig) => {
    const data = generateTerrainData(config);
    setTerrainData(data);
    pushHistory({
      heights: new Float32Array(data.heights),
      colors: new Float32Array(data.colors),
      objects: placedObjects,
    });
  }, [terrainConfig, placedObjects, pushHistory]);

  // Initial population of biome with stylized layout
  const populateBiome = useCallback(
    (biome: BiomeType, count = 28, heights = terrainData.heights, seed = terrainConfig.seed) => {
      const prng = createPRNG(seed + 42);
      const objects: PlacedObject[] = [];
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;

      // Select candidate items per biome with natural distribution (including lush meadow grass)
      let candidateTypes: { type: string; category: any; name: string }[] = [];
      if (biome === 'archipelago') {
        candidateTypes = [
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'flower_patch', category: 'foliage', name: 'Bunga Padang' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
          { type: 'island_lighthouse', category: 'building', name: 'Coastal Lighthouse' },
        ];
      } else if (biome === 'cyberpunk') {
        candidateTypes = [
          { type: 'cyber_skyscraper', category: 'cyber', name: 'Neo Cyber Tower' },
          { type: 'cyber_apartment', category: 'cyber', name: 'Modular Highrise' },
          { type: 'cyber_apartment', category: 'cyber', name: 'Modular Highrise' },
          { type: 'wind_turbine', category: 'prop', name: 'Clean Wind Turbine' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
        ];
      } else if (biome === 'alpine') {
        candidateTypes = [
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
          { type: 'wind_turbine', category: 'prop', name: 'Clean Wind Turbine' },
        ];
      } else if (biome === 'canyon') {
        candidateTypes = [
          { type: 'desert_monolith', category: 'prop', name: 'Mesa Ruin Arch' },
          { type: 'desert_monolith', category: 'prop', name: 'Mesa Ruin Arch' },
          { type: 'wind_turbine', category: 'prop', name: 'Clean Wind Turbine' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
        ];
      } else if (biome === 'oasis') {
        candidateTypes = [
          { type: 'fantasy_crystal', category: 'fantasy', name: 'Resonant Crystal' },
          { type: 'fantasy_crystal', category: 'fantasy', name: 'Resonant Crystal' },
          { type: 'scifi_dome', category: 'building', name: 'Biosphere Dome' },
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'flower_patch', category: 'foliage', name: 'Bunga Padang' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
        ];
      } else {
        candidateTypes = [
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'flower_patch', category: 'foliage', name: 'Bunga Padang' },
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
        ];
      }

      const half = size * 0.4;
      let attempts = 0;

      while (objects.length < count && attempts < count * 5) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, heights, size, res);

        // Avoid placement underwater
        if (y < waterLvl + 0.3) continue;

        // Pick item first to determine optimal clearance
        const item = candidateTypes[Math.floor(prng() * candidateTypes.length)];
        const isGrass = item.type === 'meadow_grass' || item.type === 'flower_patch';
        const minClearance = isGrass ? 2.2 : 5.8;

        // Check distance to existing placed objects to prevent unnatural overlap
        const tooClose = objects.some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < minClearance;
        });
        if (tooClose) continue;

        const rotY = prng() * Math.PI * 2;
        const scaleVariation = 0.85 + prng() * 0.35;

        objects.push({
          id: `obj_${Date.now()}_${objects.length}`,
          name: item.name,
          type: item.type,
          category: item.category,
          position: [x, y, z],
          rotation: [0, rotY, 0],
          scale: [scaleVariation, scaleVariation, scaleVariation],
        });
      }

      setPlacedObjects(objects);
      pushHistory({
        heights: new Float32Array(heights),
        colors: new Float32Array(terrainData.colors),
        objects,
      });
    },
    [terrainConfig, terrainData, pushHistory]
  );

  // 1. Scatter specific selected object (Sebar per Objek)
  const handleScatterSpecificObject = useCallback(
    (paletteItem: PaletteItem, count = 30, replaceExisting = false) => {
      const prng = createPRNG(Date.now() + Math.floor(Math.random() * 1000));
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;
      const isFoliage = paletteItem.category === 'foliage';
      const isGrass = paletteItem.id === 'meadow_grass' || paletteItem.id === 'flower_patch';
      const minDistance = isGrass ? 1.5 : isFoliage ? 2.8 : 6.8;

      const baseList = replaceExisting
        ? placedObjects.filter((o) => o.type !== paletteItem.id)
        : [...placedObjects];

      const newObjects: PlacedObject[] = [];
      const half = size * 0.42;
      let attempts = 0;

      while (newObjects.length < count && attempts < count * 8) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, terrainData.heights, size, res);

        if (y < waterLvl + 0.25) continue;

        const tooClose = [...baseList, ...newObjects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < minDistance;
        });
        if (tooClose) continue;

        const rotY = prng() * Math.PI * 2;
        const scaleVariation = 0.82 + prng() * 0.38;
        const baseScale = paletteItem.defaultScale || [1, 1, 1];

        newObjects.push({
          id: `obj_${Date.now()}_${newObjects.length}_${Math.floor(prng() * 1000)}`,
          name: paletteItem.name,
          type: paletteItem.id,
          category: paletteItem.category,
          position: [x, y, z],
          rotation: [0, rotY, 0],
          scale: [
            baseScale[0] * scaleVariation,
            baseScale[1] * scaleVariation,
            baseScale[2] * scaleVariation,
          ],
          customModelKey: paletteItem.isCustom ? paletteItem.id : undefined,
        });
      }

      const combined = [...baseList, ...newObjects];
      setPlacedObjects(combined);
      pushHistory({
        heights: new Float32Array(terrainData.heights),
        colors: new Float32Array(terrainData.colors),
        objects: combined,
      });

      setToastMessage(
        `${newObjects.length}x ${paletteItem.name} berhasil disebar di pulau!`
      );
      setTimeout(() => setToastMessage(null), 3500);
    },
    [terrainConfig, terrainData, placedObjects, pushHistory]
  );

  // 2. Scatter buildings only (Acak Bangunan)
  const handleScatterBuildings = useCallback(
    (count = 12, replaceExisting = false) => {
      const prng = createPRNG(Date.now() + 101);
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;

      // Select candidate buildings based on biome or general architectural pool
      let buildingTypes: { type: string; category: any; name: string }[] = [];
      if (terrainConfig.biome === 'cyberpunk') {
        buildingTypes = [
          { type: 'cyber_skyscraper', category: 'cyber', name: 'Neo Cyber Tower' },
          { type: 'cyber_apartment', category: 'cyber', name: 'Modular Highrise' },
          { type: 'cyber_apartment', category: 'cyber', name: 'Modular Highrise' },
          { type: 'wind_turbine', category: 'prop', name: 'Clean Wind Turbine' },
        ];
      } else if (terrainConfig.biome === 'oasis') {
        buildingTypes = [
          { type: 'scifi_dome', category: 'building', name: 'Biosphere Dome' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
        ];
      } else {
        buildingTypes = [
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
          { type: 'island_lighthouse', category: 'building', name: 'Coastal Lighthouse' },
        ];
      }

      const baseList = replaceExisting
        ? placedObjects.filter((o) => o.category !== 'building' && o.category !== 'cyber')
        : [...placedObjects];

      const newObjects: PlacedObject[] = [];
      const half = size * 0.38;
      let attempts = 0;

      while (newObjects.length < count && attempts < count * 10) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, terrainData.heights, size, res);

        // Avoid water
        if (y < waterLvl + 0.4) continue;

        // Buildings need good distance so they don't overlap awkwardly
        const tooClose = [...baseList, ...newObjects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          const distReq = o.category === 'building' || o.category === 'cyber' ? 7.5 : 4.0;
          return Math.sqrt(dx * dx + dz * dz) < distReq;
        });
        if (tooClose) continue;

        const candidate = buildingTypes[Math.floor(prng() * buildingTypes.length)];
        const rotY = (Math.floor(prng() * 8) * Math.PI) / 4; // natural 45° snapped angles for buildings
        const scaleVariation = 0.9 + prng() * 0.25;

        newObjects.push({
          id: `bld_${Date.now()}_${newObjects.length}`,
          name: candidate.name,
          type: candidate.type,
          category: candidate.category,
          position: [x, y, z],
          rotation: [0, rotY, 0],
          scale: [scaleVariation, scaleVariation, scaleVariation],
        });
      }

      const combined = [...baseList, ...newObjects];
      setPlacedObjects(combined);
      pushHistory({
        heights: new Float32Array(terrainData.heights),
        colors: new Float32Array(terrainData.colors),
        objects: combined,
      });

      setToastMessage(
        `${newObjects.length} bangunan pemukiman berhasil diacak dan ditempatkan!`
      );
      setTimeout(() => setToastMessage(null), 3500);
    },
    [terrainConfig, terrainData, placedObjects, pushHistory]
  );

  // 3. Scatter vegetation only (Acak Tumbuhan & Rumput)
  const handleScatterVegetation = useCallback(
    (count = 35, replaceExisting = false) => {
      const prng = createPRNG(Date.now() + 202);
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;

      const vegCandidates: { type: string; category: any; name: string; weight: number }[] = [
        { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang', weight: 4 },
        { type: 'flower_patch', category: 'foliage', name: 'Bunga Padang', weight: 2 },
        { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak', weight: 2 },
        { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine', weight: 2 },
      ];

      // Flatten weighted pool
      const pool: { type: string; category: any; name: string }[] = [];
      vegCandidates.forEach((c) => {
        for (let i = 0; i < c.weight; i++) {
          pool.push({ type: c.type, category: c.category, name: c.name });
        }
      });

      const baseList = replaceExisting
        ? placedObjects.filter((o) => o.category !== 'foliage')
        : [...placedObjects];

      const newObjects: PlacedObject[] = [];
      const half = size * 0.44;
      let attempts = 0;

      while (newObjects.length < count && attempts < count * 8) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, terrainData.heights, size, res);

        if (y < waterLvl + 0.2) continue;

        const candidate = pool[Math.floor(prng() * pool.length)];
        const isGrass = candidate.type === 'meadow_grass' || candidate.type === 'flower_patch';
        const minDist = isGrass ? 1.6 : 3.5;

        const tooClose = [...baseList, ...newObjects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < minDist;
        });
        if (tooClose) continue;

        const rotY = prng() * Math.PI * 2;
        const scaleVariation = 0.8 + prng() * 0.4;

        newObjects.push({
          id: `veg_${Date.now()}_${newObjects.length}`,
          name: candidate.name,
          type: candidate.type,
          category: candidate.category,
          position: [x, y, z],
          rotation: [0, rotY, 0],
          scale: [scaleVariation, scaleVariation, scaleVariation],
        });
      }

      const combined = [...baseList, ...newObjects];
      setPlacedObjects(combined);
      pushHistory({
        heights: new Float32Array(terrainData.heights),
        colors: new Float32Array(terrainData.colors),
        objects: combined,
      });

      setToastMessage(
        `${newObjects.length} tumbuhan & rumput padang berhasil diacak di daratan!`
      );
      setTimeout(() => setToastMessage(null), 3500);
    },
    [terrainConfig, terrainData, placedObjects, pushHistory]
  );

  // 4. Quick Meadow Grass Fill (Hamparan Rumput Padang)
  const handleScatterMeadowGrass = useCallback(
    (count = 50, replaceExisting = false) => {
      const prng = createPRNG(Date.now() + 303);
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;

      const baseList = replaceExisting
        ? placedObjects.filter((o) => o.type !== 'meadow_grass' && o.type !== 'flower_patch')
        : [...placedObjects];

      const newObjects: PlacedObject[] = [];
      const half = size * 0.44;
      let attempts = 0;

      while (newObjects.length < count && attempts < count * 8) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, terrainData.heights, size, res);

        // Only on elevations above water level
        if (y < waterLvl + 0.25) continue;

        const tooClose = [...baseList, ...newObjects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < 1.4;
        });
        if (tooClose) continue;

        // 80% rumput padang, 20% bunga padang
        const isFlower = prng() < 0.22;
        const itemType = isFlower ? 'flower_patch' : 'meadow_grass';
        const itemName = isFlower ? 'Bunga Padang' : 'Rumput Padang';
        const rotY = prng() * Math.PI * 2;
        const scaleVar = 0.8 + prng() * 0.45;

        newObjects.push({
          id: `grass_${Date.now()}_${newObjects.length}`,
          name: itemName,
          type: itemType,
          category: 'foliage',
          position: [x, y, z],
          rotation: [0, rotY, 0],
          scale: [scaleVar, scaleVar, scaleVar],
        });
      }

      const combined = [...baseList, ...newObjects];
      setPlacedObjects(combined);
      pushHistory({
        heights: new Float32Array(terrainData.heights),
        colors: new Float32Array(terrainData.colors),
        objects: combined,
      });

      setToastMessage(
        `Hamparan padang rumput hijau (${newObjects.length} rumpun) berhasil disebar!`
      );
      setTimeout(() => setToastMessage(null), 3500);
    },
    [terrainConfig, terrainData, placedObjects, pushHistory]
  );

  // Initialize initial settlement on load
  useEffect(() => {
    populateBiome(terrainConfig.biome, 24, terrainData.heights, terrainConfig.seed);
  }, []);

  // Update terrain config and regenerate
  const handleUpdateTerrainConfig = (updates: Partial<TerrainConfig>) => {
    const nextConfig = { ...terrainConfig, ...updates };
    setTerrainConfig(nextConfig);

    // If biome changed, adapt timeOfDay atmosphere
    if (updates.biome && updates.biome !== terrainConfig.biome) {
      if (updates.biome === 'cyberpunk') setTimeOfDay('cyberpunk');
      else if (updates.biome === 'archipelago') setTimeOfDay('golden');
      else if (updates.biome === 'alpine') setTimeOfDay('day');
      else if (updates.biome === 'canyon') setTimeOfDay('sunset');
    }

    const nextData = generateTerrainData(nextConfig);
    setTerrainData(nextData);

    // If seed or biome changed, repopulate
    if (updates.seed !== undefined || updates.biome !== undefined) {
      populateBiome(nextConfig.biome, 24, nextData.heights, nextConfig.seed);
    } else {
      // Re-ground existing objects to new terrain heights
      setPlacedObjects((prev) =>
        prev.map((obj) => {
          const newY = getSampledHeightAt(
            obj.position[0],
            obj.position[2],
            nextData.heights,
            nextConfig.size,
            nextConfig.resolution
          );
          return {
            ...obj,
            position: [obj.position[0], newY, obj.position[2]],
          };
        })
      );
    }
  };

  // Sculpting brush heightmap change
  const handleHeightmapChange = (newHeights: Float32Array) => {
    // Copy heights & update
    setTerrainData((prev) => ({
      ...prev,
      heights: newHeights,
    }));

    // Re-ground placed objects in real-time
    setPlacedObjects((prev) =>
      prev.map((obj) => {
        const newY = getSampledHeightAt(
          obj.position[0],
          obj.position[2],
          newHeights,
          terrainConfig.size,
          terrainConfig.resolution
        );
        return {
          ...obj,
          position: [obj.position[0], newY, obj.position[2]],
        };
      })
    );
  };

  // Both heights & colors changed (e.g., path carving brush)
  const handleTerrainBuffersChange = (newHeights: Float32Array, newColors: Float32Array) => {
    setTerrainData((prev) => ({
      ...prev,
      heights: newHeights,
      colors: newColors,
    }));

    // Re-ground placed objects in real-time
    setPlacedObjects((prev) =>
      prev.map((obj) => {
        const newY = getSampledHeightAt(
          obj.position[0],
          obj.position[2],
          newHeights,
          terrainConfig.size,
          terrainConfig.resolution
        );
        return {
          ...obj,
          position: [obj.position[0], newY, obj.position[2]],
        };
      })
    );
  };

  // Auto-generate scenic organic trail with multi-material cobblestone, gravel, and dirt blends
  const handleBuildProceduralTrail = () => {
    const newHeights = new Float32Array(terrainData.heights);
    const newColors = new Float32Array(terrainData.colors);

    // Prioritize existing user-placed buildings and landmarks as primary trail anchors
    const buildingKeyLocations = placedObjects
      .filter((o) =>
        o.category === 'building' ||
        o.type.includes('cottage') ||
        o.type.includes('windmill') ||
        o.type.includes('lighthouse') ||
        o.type.includes('skyscraper') ||
        o.type.includes('dome')
      )
      .map((o) => ({ x: o.position[0], z: o.position[2] }));

    const result = generateProceduralTrails(
      newHeights,
      newColors,
      terrainConfig,
      buildingKeyLocations.length >= 2 ? buildingKeyLocations : undefined
    );

    const newPlaced: PlacedObject[] = result.propPositions.map((p, idx) => ({
      id: `trail_prop_${Date.now()}_${idx}`,
      name:
        p.type === 'street_lamp'
          ? 'Trail Lantern'
          : p.type === 'wooden_boardwalk'
          ? 'Boardwalk Walkway'
          : p.type === 'trail_signpost'
          ? 'Trail Signpost'
          : p.type === 'cobblestone_path'
          ? 'Cobblestone Pavers'
          : 'Stepping Stones',
      type: p.type,
      category: p.type === 'street_lamp' ? 'prop' : 'path',
      position: [p.x, p.y, p.z],
      rotation: [0, p.rotationY, 0],
      scale: [1, 1, 1],
    }));

    // Cleanly replace any previous auto-generated trail props to prevent clutter & frame drops
    const nonTrailObjects = placedObjects.filter((o) => !o.id.startsWith('trail_prop_'));
    const combinedObjects = [...nonTrailObjects, ...newPlaced];

    setPlacedObjects(combinedObjects);
    setTerrainData((prev) => ({
      ...prev,
      heights: newHeights,
      colors: newColors,
    }));
    pushHistory({
      heights: newHeights,
      colors: newColors,
      objects: combinedObjects,
    });

    // Provide visual confirmation toast
    setToastMessage(
      `Jalan setapak pulau berhasil dibangun! (${result.segments.length} segmen terhubung dengan tekstur batu, kerikil & tanah)`
    );
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Object placed via click
  const handleObjectPlaced = (newObj: PlacedObject) => {
    const updated = [...placedObjects, newObj];
    setPlacedObjects(updated);
    setSelectedObjectId(newObj.id);
    pushHistory({
      heights: new Float32Array(terrainData.heights),
      colors: new Float32Array(terrainData.colors),
      objects: updated,
    });
  };

  // Object update
  const handleUpdateSelectedObject = (updates: Partial<PlacedObject>) => {
    if (!selectedObjectId) return;
    setPlacedObjects((prev) =>
      prev.map((o) => (o.id === selectedObjectId ? { ...o, ...updates } : o))
    );
  };

  // Duplicate selected object
  const handleDuplicateSelectedObject = () => {
    const selected = placedObjects.find((o) => o.id === selectedObjectId);
    if (!selected) return;

    const offset = 3.5;
    const newX = selected.position[0] + offset;
    const newZ = selected.position[2] + offset;
    const newY = getSampledHeightAt(
      newX,
      newZ,
      terrainData.heights,
      terrainConfig.size,
      terrainConfig.resolution
    );

    const dup: PlacedObject = {
      ...selected,
      id: `obj_${Date.now()}_dup`,
      name: `${selected.name} (Copy)`,
      position: [newX, newY, newZ],
    };

    const updated = [...placedObjects, dup];
    setPlacedObjects(updated);
    setSelectedObjectId(dup.id);
  };

  // Delete selected object
  const handleDeleteSelectedObject = () => {
    if (!selectedObjectId) return;
    const updated = placedObjects.filter((o) => o.id !== selectedObjectId);
    setPlacedObjects(updated);
    setSelectedObjectId(null);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      const snapshot = history[targetIndex];
      setTerrainData((prev) => ({
        ...prev,
        heights: new Float32Array(snapshot.heights),
        colors: new Float32Array(snapshot.colors),
      }));
      setPlacedObjects(snapshot.objects);
      setHistoryIndex(targetIndex);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const targetIndex = historyIndex + 1;
      const snapshot = history[targetIndex];
      setTerrainData((prev) => ({
        ...prev,
        heights: new Float32Array(snapshot.heights),
        colors: new Float32Array(snapshot.colors),
      }));
      setPlacedObjects(snapshot.objects);
      setHistoryIndex(targetIndex);
    }
  };

  // Camera presets
  const handleCameraPreset = (preset: 'iso' | 'top' | 'cinematic' | 'reset') => {
    const scene = sceneRef.current;
    if (!scene) return;
    // Camera is attached to scene in Viewport3D
    const camera = scene.parent?.children?.find((c) => (c as THREE.Camera).isCamera) as THREE.PerspectiveCamera | null;
    // If not found directly, emit custom event or access window camera
    window.dispatchEvent(new CustomEvent('terraforge-camera-preset', { detail: { preset } }));
  };

  // Custom 3D file upload
  const handleUploadCustom3D = async (file: File) => {
    const record = await parseUploaded3DFile(file);
    setCustomAssets((prev) => [...prev, record]);
    // Automatically select for placement
    const newPaletteItem: PaletteItem = {
      id: record.id,
      name: record.name,
      category: 'custom',
      icon: 'Box',
      description: `Custom ${record.format.toUpperCase()} (${(record.fileSize / 1024).toFixed(1)} KB)`,
      defaultScale: [1, 1, 1],
      badge: 'Custom',
      isCustom: true,
    };
    setActivePaletteItem(newPaletteItem);
    setBrushSettings((prev) => ({ ...prev, mode: 'place' }));
  };

  // Exports
  const handleExportOBJ = () => {
    if (exportGroupRef.current) {
      exportSceneAsOBJ(exportGroupRef.current, `terraforge_${terrainConfig.biome}_world.obj`);
    }
  };

  const handleExportGLB = () => {
    if (exportGroupRef.current) {
      exportSceneAsGLTF(exportGroupRef.current, true, `terraforge_${terrainConfig.biome}_world.glb`);
    }
  };

  const handleExportThreeJSON = () => {
    if (exportGroupRef.current) {
      exportSceneAsThreeJSON(exportGroupRef.current, `terraforge_${terrainConfig.biome}_scene.json`);
    }
  };

  const handleExportHeightmap = () => {
    exportHeightmapPNG(
      terrainData.heights,
      terrainConfig.resolution,
      terrainData.minHeight,
      terrainData.maxHeight,
      `terraforge_${terrainConfig.biome}_heightmap.png`
    );
  };

  // Global hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        setIsDockCollapsed((prev) => !prev);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObjectId) {
          handleDeleteSelectedObject();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjectId, historyIndex, history]);

  const selectedObject = placedObjects.find((o) => o.id === selectedObjectId) || null;

  const handleUpdatePerformanceMode = (mode: PerformanceMode) => {
    setPerformanceMode(mode);
    const newRes = mode === 'mobile' ? 32 : mode === 'balanced' ? 44 : 56;
    handleUpdateTerrainConfig({ resolution: newRes });
  };

  const handleCyclePerformanceMode = () => {
    const next = performanceMode === 'mobile' ? 'balanced' : performanceMode === 'balanced' ? 'ultra' : 'mobile';
    handleUpdatePerformanceMode(next);
  };

  return (
    <main
      data-testid="terraforge-root"
      className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans"
    >
      {/* 3D WebGL Canvas Layer */}
      <Viewport3D
        terrainConfig={terrainConfig}
        heights={terrainData.heights}
        colors={terrainData.colors}
        onHeightmapChange={handleHeightmapChange}
        onTerrainBuffersChange={handleTerrainBuffersChange}
        placedObjects={placedObjects}
        onObjectPlaced={handleObjectPlaced}
        onObjectSelected={(obj) => setSelectedObjectId(obj?.id || null)}
        onObjectUpdate={(id, updates) =>
          setPlacedObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)))
        }
        selectedObjectId={selectedObjectId}
        activePaletteItem={activePaletteItem}
        brushSettings={brushSettings}
        timeOfDay={timeOfDay}
        performanceMode={performanceMode}
        onFpsUpdate={setFps}
        onSceneReady={(scene, exportGroup) => {
          sceneRef.current = scene;
          exportGroupRef.current = exportGroup;
        }}
      />

      {/* Top Navigation & Status Bar */}
      <TopBar
        seed={terrainConfig.seed}
        biome={terrainConfig.biome}
        objectCount={placedObjects.length}
        timeOfDay={timeOfDay}
        onTimeOfDayChange={setTimeOfDay}
        onCameraPreset={handleCameraPreset}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        isDockCollapsed={isDockCollapsed}
        onToggleDock={() => setIsDockCollapsed((prev) => !prev)}
        fps={fps}
        performanceMode={performanceMode}
        onCyclePerformanceMode={handleCyclePerformanceMode}
      />

      {/* Sleek Ergonomic Collapsible Bottom Control Dock */}
      <ControlDock
        terrainConfig={terrainConfig}
        onUpdateTerrainConfig={handleUpdateTerrainConfig}
        onRegenerateTerrain={() => handleRegenerateTerrain()}
        brushSettings={brushSettings}
        onUpdateBrushSettings={(updates) => setBrushSettings((prev) => ({ ...prev, ...updates }))}
        activePaletteItem={activePaletteItem}
        onSelectPaletteItem={setActivePaletteItem}
        customAssets={customAssets}
        onUploadFile={handleUploadCustom3D}
        onAutoPopulateBiome={(count) =>
          populateBiome(terrainConfig.biome, count, terrainData.heights, terrainConfig.seed)
        }
        onScatterSpecificObject={handleScatterSpecificObject}
        onScatterBuildings={handleScatterBuildings}
        onScatterVegetation={handleScatterVegetation}
        onScatterMeadowGrass={handleScatterMeadowGrass}
        onBuildTrail={handleBuildProceduralTrail}
        onClearAllObjects={() => {
          setPlacedObjects([]);
          setSelectedObjectId(null);
        }}
        placedObjects={placedObjects}
        selectedObject={selectedObject}
        onSelectObject={(obj) => setSelectedObjectId(obj?.id || null)}
        onUpdateSelectedObject={handleUpdateSelectedObject}
        onDuplicateSelectedObject={handleDuplicateSelectedObject}
        onDeleteSelectedObject={handleDeleteSelectedObject}
        onExportOBJ={handleExportOBJ}
        onExportGLB={handleExportGLB}
        onExportThreeJSON={handleExportThreeJSON}
        onExportHeightmap={handleExportHeightmap}
        isCollapsed={isDockCollapsed}
        onToggleCollapse={() => setIsDockCollapsed((prev) => !prev)}
        performanceMode={performanceMode}
        onUpdatePerformanceMode={handleUpdatePerformanceMode}
      />

      {/* Floating Status Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/95 border border-emerald-500/70 text-slate-100 text-xs font-semibold shadow-2xl backdrop-blur-md">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </main>
  );
}
