export type BiomeType =
  | 'archipelago'
  | 'cyberpunk'
  | 'alpine'
  | 'canyon'
  | 'oasis'
  | 'lowpoly';

export type PathMaterial =
  | 'stone'
  | 'gravel'
  | 'dirt'
  | 'blend_stone_gravel'
  | 'blend_dirt_gravel'
  | 'blend_natural'
  | 'custom_blend'
  | 'cyber';

export interface TerrainConfig {
  seed: number;
  size: number;          // e.g. 140 world units (expanded)
  resolution: number;    // e.g. 48-128 vertices
  heightScale: number;   // max vertical displacement
  roughness: number;     // noise frequency / detail
  waterLevel: number;    // water plane Y position
  islandFalloff: boolean;// radial edge falloff mask
  terraceSteps: number;  // 0 = continuous, 4-12 = stylized stepped plateaus
  biome: BiomeType;
  smoothShading: boolean;// true = smooth organic shading (no triangles), false = low-poly faceted
  pathStyle: PathMaterial;
  pathBlendRatios?: {
    stone: number;
    gravel: number;
    dirt: number;
  };
  islandCoverage?: number; // 0.6 = small atoll, 1.4 = wide island, 2.0 = sprawling continent
  oceanScale?: number;    // water plane multiplier relative to terrain size
}

export type ObjectCategory = 'building' | 'foliage' | 'prop' | 'cyber' | 'fantasy' | 'custom' | 'path';

export interface PlacedObject {
  id: string;
  name: string;
  type: string;
  category: ObjectCategory;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  customModelKey?: string;
  tint?: string;
}

export interface PaletteItem {
  id: string;
  name: string;
  category: ObjectCategory;
  icon: string;
  description: string;
  defaultScale: [number, number, number];
  badge?: string;
  isCustom?: boolean;
}

export type BrushMode =
  | 'select'
  | 'place'
  | 'sculpt-raise'
  | 'sculpt-lower'
  | 'sculpt-flatten'
  | 'sculpt-smooth'
  | 'sculpt-path';

export interface BrushSettings {
  mode: BrushMode;
  radius: number;
  intensity: number;
  flattenHeight: number;
  pathStyle: PathMaterial;
  pathBlendRatios?: {
    stone: number;
    gravel: number;
    dirt: number;
  };
}

export type TimeOfDay = 'day' | 'golden' | 'cyberpunk' | 'sunset' | 'night';

export type GraphicsPreset = 'LOW' | 'MEDIUM' | 'HIGH';

export type PerformanceMode = GraphicsPreset | 'mobile' | 'balanced' | 'ultra';

export interface CustomAssetRecord {
  id: string;
  name: string;
  format: 'glb' | 'gltf' | 'obj';
  fileSize: number;
  dataBuffer: ArrayBuffer;
  previewUrl?: string;
  vertexCount: number;
}
