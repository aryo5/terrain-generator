import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  BiomeType,
  BrushSettings,
  CustomAssetRecord,
  PaletteItem,
  PerformanceMode,
  PlacedObject,
  TerrainConfig,
  TimeOfDay,
} from './types';
import { generateTerrainData, getSampledHeightAt } from './core/terrainGen';
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

const isMobileInitial = typeof window !== 'undefined' && (
  /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  window.innerWidth < 768
);

const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  seed: 2026,
  size: 100,
  resolution: isMobileInitial ? 44 : 52, // optimized 44x44 for silky smooth 60fps on mobile
  heightScale: 28,
  roughness: 1.2,
  waterLevel: 2,
  islandFalloff: true,
  terraceSteps: 0,
  biome: 'archipelago',
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

  const [brushSettings, setBrushSettings] = useState<BrushSettings>({
    mode: 'select',
    radius: 12,
    intensity: 1.2,
    flattenHeight: 5,
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

      // Select candidate items per biome with natural distribution
      let candidateTypes: { type: string; category: any; name: string }[] = [];
      if (biome === 'archipelago') {
        candidateTypes = [
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
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
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
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
        ];
      } else {
        candidateTypes = [
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
        ];
      }

      const half = size * 0.4;
      let attempts = 0;

      while (objects.length < count && attempts < count * 4) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, heights, size, res);

        // Avoid placement underwater
        if (y < waterLvl + 0.3) continue;

        // Check distance to existing placed objects to prevent unnatural overlap
        const tooClose = objects.some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < 6.5;
        });
        if (tooClose) continue;

        // Pick item
        const item = candidateTypes[Math.floor(prng() * candidateTypes.length)];
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
    // Re-generate vertex colors based on modified heights
    const count = terrainConfig.resolution * terrainConfig.resolution;
    const newColors = new Float32Array(count * 3);

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
    const newRes = mode === 'mobile' ? 44 : mode === 'balanced' ? 52 : 64;
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
        placedObjects={placedObjects}
        onObjectPlaced={handleObjectPlaced}
        onObjectSelected={(obj) => setSelectedObjectId(obj?.id || null)}
        onObjectUpdate={handleUpdateSelectedObject}
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
    </main>
  );
}
