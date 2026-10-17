import React, { useState } from 'react';
import {
  Globe,
  Mountain,
  PackagePlus,
  Box,
  Download,
  Dices,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  RotateCw,
  Sparkles,
  Maximize2,
  Minimize2,
  Upload,
  Layers,
  Check,
  Trees,
  TreePine,
  Building2,
  Building,
  Wind,
  Flame,
  Home,
  Gem,
  Compass,
  Landmark,
  Zap,
  Lightbulb,
} from 'lucide-react';
import {
  BiomeType,
  BrushMode,
  BrushSettings,
  CustomAssetRecord,
  ObjectCategory,
  PaletteItem,
  PerformanceMode,
  PlacedObject,
  TerrainConfig,
} from '../types';
import { STANDARD_PALETTE } from '../core/modelFactory';

interface ControlDockProps {
  terrainConfig: TerrainConfig;
  onUpdateTerrainConfig: (updates: Partial<TerrainConfig>) => void;
  onRegenerateTerrain: () => void;
  brushSettings: BrushSettings;
  onUpdateBrushSettings: (updates: Partial<BrushSettings>) => void;
  activePaletteItem: PaletteItem | null;
  onSelectPaletteItem: (item: PaletteItem | null) => void;
  customAssets: CustomAssetRecord[];
  onUploadFile: (file: File) => Promise<void>;
  onAutoPopulateBiome: (density: number) => void;
  onClearAllObjects: () => void;
  placedObjects: PlacedObject[];
  selectedObject: PlacedObject | null;
  onSelectObject: (obj: PlacedObject | null) => void;
  onUpdateSelectedObject: (updates: Partial<PlacedObject>) => void;
  onDuplicateSelectedObject: () => void;
  onDeleteSelectedObject: () => void;
  onExportOBJ: () => void;
  onExportGLB: () => void;
  onExportThreeJSON: () => void;
  onExportHeightmap: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  performanceMode: PerformanceMode;
  onUpdatePerformanceMode: (mode: PerformanceMode) => void;
}

type TabType = 'terrain' | 'sculpt' | 'place' | 'assets' | 'export';

// Map icon strings to Lucide components
const ICON_MAP: Record<string, React.ElementType> = {
  Trees,
  TreePine,
  Building2,
  Building,
  Wind,
  Flame,
  Home,
  Gem,
  Compass,
  Landmark,
  Zap,
  Lightbulb,
};

export const ControlDock: React.FC<ControlDockProps> = ({
  terrainConfig,
  onUpdateTerrainConfig,
  onRegenerateTerrain,
  brushSettings,
  onUpdateBrushSettings,
  activePaletteItem,
  onSelectPaletteItem,
  customAssets,
  onUploadFile,
  onAutoPopulateBiome,
  onClearAllObjects,
  placedObjects,
  selectedObject,
  onSelectObject,
  onUpdateSelectedObject,
  onDuplicateSelectedObject,
  onDeleteSelectedObject,
  onExportOBJ,
  onExportGLB,
  onExportThreeJSON,
  onExportHeightmap,
  isCollapsed,
  onToggleCollapse,
  performanceMode,
  onUpdatePerformanceMode,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('terrain');
  const [paletteCategory, setPaletteCategory] = useState<string>('all');
  const [autoScatterCount, setAutoScatterCount] = useState<number>(30);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const biomes: { id: BiomeType; name: string; color: string; desc: string }[] = [
    { id: 'archipelago', name: 'Island Bay', color: '#0ea5e9', desc: 'Tropical atolls & sandy beaches' },
    { id: 'cyberpunk', name: 'Cyber City', color: '#06b6d4', desc: 'Dark neon grid plateaus' },
    { id: 'alpine', name: 'High Alpine', color: '#10b981', desc: 'Snow peaks & emerald valleys' },
    { id: 'canyon', name: 'Red Canyon', color: '#f97316', desc: 'Terracotta stepped mesas' },
    { id: 'oasis', name: 'Crystal Oasis', color: '#a855f7', desc: 'Mystic pearlescent mineral basins' },
    { id: 'lowpoly', name: 'Poly Meadow', color: '#84cc16', desc: 'Stylized colorful low-poly terrain' },
  ];

  const handleRandomSeed = () => {
    const nextSeed = Math.floor(Math.random() * 900000) + 100000;
    onUpdateTerrainConfig({ seed: nextSeed });
  };

  const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await onUploadFile(file);
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to load model file');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Combine standard palette + custom uploaded models
  const allPaletteItems: PaletteItem[] = [
    ...STANDARD_PALETTE,
    ...customAssets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      category: 'custom' as ObjectCategory,
      icon: 'Box',
      description: `Custom ${asset.format.toUpperCase()} model (${(asset.fileSize / 1024).toFixed(1)} KB)`,
      defaultScale: [1, 1, 1] as [number, number, number],
      badge: 'Custom',
      isCustom: true,
    })),
  ];

  const filteredPaletteItems =
    paletteCategory === 'all'
      ? allPaletteItems
      : allPaletteItems.filter((i) => i.category === paletteCategory);

  return (
    <section
      aria-label="Terrain and Object Controls"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 w-[95vw] max-w-4xl z-30 transition-transform duration-150 select-none ${
        isCollapsed ? 'translate-y-[calc(100%-42px)]' : 'translate-y-0'
      }`}
    >
      {/* Collapse / Expand Header Bar */}
      <div className="flex justify-between items-center bg-slate-900/95 border-t border-x border-slate-700/80 rounded-t-2xl px-4 py-2 shadow-2xl">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('terrain');
              if (brushSettings.mode.startsWith('sculpt') || brushSettings.mode === 'place') {
                onUpdateBrushSettings({ mode: 'select' });
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'terrain'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Biomes & </span><span>Terrain</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('sculpt');
              if (!brushSettings.mode.startsWith('sculpt')) {
                onUpdateBrushSettings({ mode: 'sculpt-raise' });
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'sculpt'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Mountain className="w-3.5 h-3.5" />
            <span>Sculpt</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('place');
              if (brushSettings.mode !== 'place') {
                onUpdateBrushSettings({ mode: 'place' });
                if (!activePaletteItem && STANDARD_PALETTE.length > 0) {
                  onSelectPaletteItem(STANDARD_PALETTE[0]);
                }
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'place'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <PackagePlus className="w-3.5 h-3.5" />
            <span>Place</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('assets')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'assets'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>Custom GLB</span>
            {customAssets.length > 0 && (
              <span className="text-[10px] bg-emerald-700/60 text-emerald-200 px-1.5 py-0.2 rounded-full font-bold">
                {customAssets.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'export'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export 3D</span>
          </button>
        </div>

        {/* Toggle Collapse Button */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand Dock Controls' : 'Collapse Dock Controls'}
          className="flex items-center gap-1 text-slate-400 hover:text-white text-xs px-2 py-1 rounded-md hover:bg-slate-800/80 transition-colors ml-2"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">Expand</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">Hide</span>
            </>
          )}
        </button>
      </div>

      {/* Dock Content Body */}
      <div className="bg-slate-900/95 border-b border-x border-slate-700/80 rounded-b-2xl p-4 shadow-2xl max-h-[38vh] overflow-y-auto">
        {/* Selected Object Floating Inspector Bar */}
        {selectedObject && (
          <div className="mb-3 p-2.5 rounded-xl bg-slate-800/90 border border-amber-500/50 flex flex-wrap items-center justify-between gap-2 shadow-inner">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-xs font-bold text-amber-200">{selectedObject.name}</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400">
                {selectedObject.category}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const currentRot = selectedObject.rotation[1];
                  onUpdateSelectedObject({
                    rotation: [selectedObject.rotation[0], currentRot + Math.PI / 4, selectedObject.rotation[2]],
                  });
                }}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium"
                title="Rotate 45°"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Rot +45°</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const s = selectedObject.scale;
                  onUpdateSelectedObject({ scale: [s[0] * 1.15, s[1] * 1.15, s[2] * 1.15] });
                }}
                className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs"
                title="Scale Up (+15%)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const s = selectedObject.scale;
                  onUpdateSelectedObject({ scale: [s[0] * 0.85, s[1] * 0.85, s[2] * 0.85] });
                }}
                className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs"
                title="Scale Down (-15%)"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onDuplicateSelectedObject}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium"
                title="Duplicate Object"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Clone</span>
              </button>

              <button
                type="button"
                onClick={onDeleteSelectedObject}
                aria-label="Delete selected object"
                className="p-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500 hover:text-white transition-colors"
                title="Delete Object"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onSelectObject(null)}
                className="text-[11px] text-slate-400 hover:text-white px-1.5"
              >
                Deselect
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: Biomes & Terrain */}
        {activeTab === 'terrain' && (
          <div className="space-y-4">
            {/* Biomes Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Biome Preset
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {biomes.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      onUpdateTerrainConfig({ biome: b.id });
                    }}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      terrainConfig.biome === b.id
                        ? 'bg-slate-800 border-emerald-400 ring-2 ring-emerald-500/30'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                      <span className="text-xs font-bold text-slate-200 truncate">{b.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">{b.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Performance Mode & Mobile Profile Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/80 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200">Graphics & Mobile Tuning</div>
                  <div className="text-[10px] text-slate-400">
                    {performanceMode === 'mobile' ? '⚡ Mobile Profile: Clamped pixel ratio, zero vertex buffer updates, 60fps battery saver' : performanceMode === 'balanced' ? '⚖️ Balanced: Smooth rendering with adaptive shadows' : '✨ Ultra: High resolution mesh, studio PBR'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
                {(['mobile', 'balanced', 'ultra'] as PerformanceMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onUpdatePerformanceMode(m);
                      const res = m === 'mobile' ? 44 : m === 'balanced' ? 52 : 64;
                      onUpdateTerrainConfig({ resolution: res });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-colors ${
                      performanceMode === m
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {m === 'mobile' ? '⚡ Mobile' : m === 'balanced' ? '⚖️ Balanced' : '✨ Ultra'}
                  </button>
                ))}
              </div>
            </div>

            {/* Terrain Procedural Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              {/* Seed Control */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">World Seed</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    value={terrainConfig.seed}
                    onChange={(e) => onUpdateTerrainConfig({ seed: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleRandomSeed}
                    title="Generate Random Seed"
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    <Dices className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Elevation / Height Scale */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Height Scale</span>
                  <span className="text-slate-400">{terrainConfig.heightScale}m</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="2"
                  value={terrainConfig.heightScale}
                  onChange={(e) => onUpdateTerrainConfig({ heightScale: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Roughness / Noise Frequency */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Roughness</span>
                  <span className="text-slate-400">{terrainConfig.roughness.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={terrainConfig.roughness}
                  onChange={(e) => onUpdateTerrainConfig({ roughness: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Water Level */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Water Elevation</span>
                  <span className="text-slate-400">{terrainConfig.waterLevel}m</span>
                </div>
                <input
                  type="range"
                  min="-8"
                  max="14"
                  step="1"
                  value={terrainConfig.waterLevel}
                  onChange={(e) => onUpdateTerrainConfig({ waterLevel: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Stepped Terraces & Falloff Switches */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={terrainConfig.islandFalloff}
                    onChange={(e) => onUpdateTerrainConfig({ islandFalloff: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                  <span className="text-xs text-slate-300 font-medium">Island Radial Ocean Falloff</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 font-medium">Terrace Steps:</span>
                  <select
                    value={terrainConfig.terraceSteps}
                    onChange={(e) => onUpdateTerrainConfig({ terraceSteps: parseInt(e.target.value) })}
                    className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1 focus:outline-none"
                  >
                    <option value="0">Continuous (Smooth)</option>
                    <option value="4">4 Steps (Stylized)</option>
                    <option value="7">7 Steps (Mesa Plateaus)</option>
                    <option value="12">12 Steps (Fine Terraces)</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={onRegenerateTerrain}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-md"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Re-Synthesize World</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Sculpt Brush */}
        {activeTab === 'sculpt' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {[
                  { mode: 'sculpt-raise', label: 'Raise ⛰️' },
                  { mode: 'sculpt-lower', label: 'Lower 🕳️' },
                  { mode: 'sculpt-flatten', label: 'Flatten 📐' },
                  { mode: 'sculpt-smooth', label: 'Smooth 🌊' },
                ].map((b) => (
                  <button
                    key={b.mode}
                    type="button"
                    onClick={() => onUpdateBrushSettings({ mode: b.mode as BrushMode })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      brushSettings.mode === b.mode
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              <p className="text-xs text-slate-400">
                Click or drag across the terrain to sculpt in real-time.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Brush Radius</span>
                  <span className="text-slate-400">{brushSettings.radius} units</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="1"
                  value={brushSettings.radius}
                  onChange={(e) => onUpdateBrushSettings({ radius: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Sculpt Intensity</span>
                  <span className="text-slate-400">{brushSettings.intensity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={brushSettings.intensity}
                  onChange={(e) => onUpdateBrushSettings({ intensity: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {brushSettings.mode === 'sculpt-flatten' && (
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                    <span>Target Flatten Height</span>
                    <span className="text-slate-400">{brushSettings.flattenHeight}m</span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="40"
                    step="1"
                    value={brushSettings.flattenHeight}
                    onChange={(e) => onUpdateBrushSettings({ flattenHeight: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Place Objects */}
        {activeTab === 'place' && (
          <div className="space-y-3">
            {/* Category Filter Chips & Auto-Populate Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {[
                  { id: 'all', label: 'All Items' },
                  { id: 'foliage', label: 'Foliage' },
                  { id: 'building', label: 'Buildings' },
                  { id: 'cyber', label: 'Cyberpunk' },
                  { id: 'fantasy', label: 'Magic & Sci-Fi' },
                  { id: 'prop', label: 'Props' },
                  { id: 'custom', label: 'Custom' },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPaletteCategory(c.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      paletteCategory === c.id
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Auto Scatter Preset */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Density:</span>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="5"
                  value={autoScatterCount}
                  onChange={(e) => setAutoScatterCount(parseInt(e.target.value))}
                  className="w-20 accent-emerald-500 cursor-pointer"
                  title={`${autoScatterCount} objects`}
                />
                <button
                  type="button"
                  onClick={() => onAutoPopulateBiome(autoScatterCount)}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm"
                  title="Scatter biome-appropriate objects on the terrain"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Scatter Biome</span>
                </button>
                {placedObjects.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearAllObjects}
                    className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1"
                    title="Remove all placed objects"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Models Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto pr-1">
              {filteredPaletteItems.map((item) => {
                const IconComponent = ICON_MAP[item.icon] || Box;
                const isSelected =
                  brushSettings.mode === 'place' && activePaletteItem?.id === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onUpdateBrushSettings({ mode: 'place' });
                      onSelectPaletteItem(item);
                    }}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-slate-800 border-emerald-400 ring-2 ring-emerald-500/30'
                        : 'bg-slate-800/40 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="w-6 h-6 rounded bg-slate-700 flex items-center justify-center text-emerald-400">
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      {item.badge && (
                        <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-slate-900/80 text-slate-400">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-xs text-slate-100 truncate">{item.name}</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">{item.description}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Active brush: <strong>{activePaletteItem?.name || 'None'}</strong>. Hover over terrain to preview ghost model; click to place.
            </p>
          </div>
        )}

        {/* TAB 4: Custom Assets (GLB / GLTF / OBJ) */}
        {activeTab === 'assets' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-700 rounded-xl p-5 text-center bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
              <Upload className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-200 mb-1">
                Drop your 3D models here or browse files
              </p>
              <p className="text-[11px] text-slate-400 mb-3">
                Supports <strong className="text-slate-300">.GLB</strong>,{' '}
                <strong className="text-slate-300">.GLTF</strong>, and{' '}
                <strong className="text-slate-300">.OBJ</strong> formats. Automatically normalized & grounded at base.
              </p>

              <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition-colors shadow-md">
                <PackagePlus className="w-4 h-4" />
                <span>{isUploading ? 'Parsing 3D Asset...' : 'Upload 3D Model'}</span>
                <input
                  type="file"
                  accept=".glb,.gltf,.obj"
                  onChange={handleFileUploadChange}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>

              {uploadError && (
                <p className="text-xs text-rose-400 mt-2 font-medium">{uploadError}</p>
              )}
            </div>

            {/* Uploaded Models List */}
            {customAssets.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Imported Custom Models ({customAssets.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {customAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-white truncate max-w-[140px]">
                          {asset.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {asset.format.toUpperCase()} • {(asset.fileSize / 1024).toFixed(1)} KB • {asset.vertexCount} verts
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const paletteItem: PaletteItem = {
                            id: asset.id,
                            name: asset.name,
                            category: 'custom',
                            icon: 'Box',
                            description: `Custom model`,
                            defaultScale: [1, 1, 1],
                            badge: 'Custom',
                            isCustom: true,
                          };
                          onUpdateBrushSettings({ mode: 'place' });
                          onSelectPaletteItem(paletteItem);
                          setActiveTab('place');
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                      >
                        Place
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: Export 3D */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Export to Standard 3D Formats
              </h4>
              <p className="text-xs text-slate-400">
                Download your complete sculpted world with all placed architecture, trees, and terrain meshes for external rendering or game engines.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* OBJ Export */}
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 text-slate-200 font-bold text-xs">
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Wavefront OBJ (.obj)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Universal geometry format. Best for Blender, Maya, 3ds Max, ZBrush.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportOBJ}
                  className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                >
                  Download OBJ
                </button>
              </div>

              {/* GLTF / GLB Export */}
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 text-slate-200 font-bold text-xs">
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>GLTF / GLB (.glb)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Modern PBR binary format. Best for Godot, Unity, Unreal, and WebGL.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportGLB}
                  className="w-full py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors"
                >
                  Download GLB
                </button>
              </div>

              {/* Three.js JSON Export */}
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 text-slate-200 font-bold text-xs">
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Three.js JSON (.json)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Native Three.js Object3D hierarchy JSON for web apps.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportThreeJSON}
                  className="w-full py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors"
                >
                  Download JSON
                </button>
              </div>

              {/* Heightmap PNG Export */}
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 text-slate-200 font-bold text-xs">
                    <Download className="w-3.5 h-3.5 text-purple-400" />
                    <span>Heightmap PNG (.png)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Grayscale displacement heightmap image for terrain shaders.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportHeightmap}
                  className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors"
                >
                  Download PNG
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
