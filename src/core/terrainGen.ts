import { SimplexNoise2D, clamp, smoothstep, createPRNG } from './math';
import { BiomeType, PathMaterial, TerrainConfig } from '../types';

export interface TerrainData {
  heights: Float32Array;
  colors: Float32Array;
  minHeight: number;
  maxHeight: number;
}

// Biome color ramps: [elevation: 0..1, r, g, b]
type ColorStop = [number, number, number, number];

export const BIOME_PALETTES: Record<BiomeType, {
  waterColor: string;
  fogColor: string;
  skyColor: string;
  stops: ColorStop[];
}> = {
  archipelago: {
    waterColor: '#0ea5e9',
    fogColor: '#bae6fd',
    skyColor: '#38bdf8',
    stops: [
      [0.0, 0.15, 0.45, 0.65], // deep underwater
      [0.15, 0.88, 0.78, 0.55], // golden sand beach
      [0.28, 0.28, 0.68, 0.32], // lush low grass
      [0.55, 0.18, 0.52, 0.24], // tropical foliage
      [0.75, 0.45, 0.42, 0.38], // rocky cliff
      [0.92, 0.95, 0.96, 0.98], // white mountain crest
    ],
  },
  cyberpunk: {
    waterColor: '#06b6d4',
    fogColor: '#0f172a',
    skyColor: '#090d16',
    stops: [
      [0.0, 0.05, 0.08, 0.15], // dark abyss
      [0.15, 0.02, 0.71, 0.83], // neon cyan shore
      [0.28, 0.12, 0.15, 0.22], // matte carbon grid base
      [0.55, 0.20, 0.15, 0.35], // dark purple synthetic strata
      [0.78, 0.85, 0.10, 0.55], // hot magenta cliff edges
      [0.95, 0.0, 0.95, 0.85], // neon cyber peaks
    ],
  },
  alpine: {
    waterColor: '#38bdf8',
    fogColor: '#e0f2fe',
    skyColor: '#7dd3fc',
    stops: [
      [0.0, 0.2, 0.4, 0.5],
      [0.18, 0.76, 0.74, 0.58], // shore pebbles
      [0.32, 0.31, 0.58, 0.28], // alpine valley meadow
      [0.60, 0.22, 0.45, 0.22], // evergreen forest zone
      [0.78, 0.48, 0.48, 0.50], // granite crag
      [0.88, 0.95, 0.98, 1.0], // glacier snow
    ],
  },
  canyon: {
    waterColor: '#0284c7',
    fogColor: '#fed7aa',
    skyColor: '#fb923c',
    stops: [
      [0.0, 0.35, 0.22, 0.15],
      [0.15, 0.82, 0.62, 0.45], // riverbed sand
      [0.35, 0.78, 0.44, 0.28], // red clay band
      [0.60, 0.68, 0.34, 0.22], // terracotta strata
      [0.80, 0.52, 0.28, 0.18], // dark sandstone cliff
      [0.95, 0.88, 0.65, 0.45], // sunlit mesa plateau
    ],
  },
  oasis: {
    waterColor: '#2dd4bf',
    fogColor: '#f5d0fe',
    skyColor: '#e879f9',
    stops: [
      [0.0, 0.12, 0.35, 0.45],
      [0.18, 0.92, 0.82, 0.68], // shimmering sand
      [0.35, 0.38, 0.75, 0.55], // mystic oasis grass
      [0.62, 0.55, 0.32, 0.75], // violet crystal slope
      [0.82, 0.78, 0.45, 0.88], // lilac mineral rock
      [0.95, 0.98, 0.92, 1.0], // iridescent peak
    ],
  },
  lowpoly: {
    waterColor: '#38bdf8',
    fogColor: '#f1f5f9',
    skyColor: '#93c5fd',
    stops: [
      [0.0, 0.18, 0.48, 0.62],
      [0.16, 0.92, 0.82, 0.58], // warm sand
      [0.32, 0.42, 0.76, 0.35], // vibrant stylized green
      [0.58, 0.32, 0.62, 0.28], // deep stylized foliage
      [0.78, 0.52, 0.54, 0.58], // soft gray stone
      [0.92, 0.98, 0.98, 1.0], // snow cap
    ],
  },
};

/**
 * Calculates raw height at normalized world coordinate (x, z in [-size/2, size/2])
 */
export function calculateRawHeight(
  x: number,
  z: number,
  noise: SimplexNoise2D,
  config: TerrainConfig
): number {
  const { size, heightScale, roughness, islandFalloff, terraceSteps, biome } = config;
  
  // Normalized 0..1 coordinate
  const nx = x / size;
  const nz = z / size;

  // Base multi-octave noise
  const freq = roughness * 1.5;
  let h = noise.fbm(nx * freq, nz * freq, 5, 0.5, 2.0);

  // Biome-specific height transforms
  if (biome === 'archipelago') {
    // Ridge noise for sharp coral/island spines
    const ridge = 1.0 - Math.abs(noise.noise(nx * freq * 2, nz * freq * 2));
    h = h * 0.7 + ridge * 0.3;
  } else if (biome === 'canyon') {
    // Stepped canyon terraces with sharp walls
    const warpedX = nx + noise.noise(nx * 2, nz * 2) * 0.15;
    const warpedZ = nz + noise.noise(nz * 2, nx * 2) * 0.15;
    h = noise.fbm(warpedX * freq, warpedZ * freq, 4, 0.6, 2.2);
    // Sigmoid plateau effect
    h = Math.sin(h * Math.PI * 2.5) * 0.3 + h * 0.7;
  } else if (biome === 'cyberpunk') {
    // Angular artificial geometric plateaus
    const gridX = Math.round(nx * 12) / 12;
    const gridZ = Math.round(nz * 12) / 12;
    const blockNoise = noise.noise(gridX * 2.5, gridZ * 2.5);
    h = h * 0.6 + blockNoise * 0.4;
  }

  // Island radial falloff mask with configurable islandCoverage
  if (islandFalloff) {
    const coverage = config.islandCoverage ?? 1.45; // Broad expansive island default
    const warpAngle = Math.atan2(nz, nx);
    const warpRadius = (1.0 + 0.18 * Math.sin(warpAngle * 3 + nx * 2) + 0.12 * Math.cos(warpAngle * 5 - nz * 2)) * coverage;
    const distFromCenter = (Math.sqrt(nx * nx + nz * nz) / warpRadius) * 2; // scaled by coverage

    // Smooth cosine edge fade with wider, expansive habitable plateau
    const mask = smoothstep(1.05, 0.25, distFromCenter);

    // Natural satellite islets & coral atolls in archipelago biome to break up empty ocean
    let satelliteBoost = 0;
    if (biome === 'archipelago' && distFromCenter > 0.85 && distFromCenter < 1.7) {
      const satNoise = noise.noise(nx * 4.8 + 15, nz * 4.8 + 15);
      if (satNoise > 0.45) {
        satelliteBoost = (satNoise - 0.45) * 0.52;
      }
    }

    h = (h + 0.32) * mask + satelliteBoost - 0.18;
  }

  // Terracing / contour quantization if enabled
  if (terraceSteps > 0) {
    const steps = terraceSteps;
    const scaled = (h + 1) * 0.5 * steps;
    const quantized = Math.floor(scaled);
    const frac = scaled - quantized;
    // Keep flat terrace tops with steep cliffs in between
    const smoothedFrac = smoothstep(0.7, 0.95, frac);
    h = ((quantized + smoothedFrac) / steps) * 2.0 - 1.0;
  }

  // Map to final vertical world units
  return h * (heightScale * 0.5);
}

/**
 * Generate full heightmap and vertex color buffers
 */
export function generateTerrainData(config: TerrainConfig): TerrainData {
  const { size, resolution, seed, biome } = config;
  const count = resolution * resolution;
  const heights = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const noise = new SimplexNoise2D(seed);
  const palette = BIOME_PALETTES[biome] || BIOME_PALETTES.archipelago;

  let minH = Infinity;
  let maxH = -Infinity;

  const halfSize = size / 2;
  const step = size / (resolution - 1);

  // Compute heights
  for (let j = 0; j < resolution; j++) {
    const z = -halfSize + j * step;
    for (let i = 0; i < resolution; i++) {
      const x = -halfSize + i * step;
      const idx = j * resolution + i;
      const h = calculateRawHeight(x, z, noise, config);
      heights[idx] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  const hRange = Math.max(0.001, maxH - minH);

  // Compute vertex colors based on elevation and slope
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = j * resolution + i;
      const h = heights[idx];
      const normH = clamp((h - minH) / hRange, 0, 1);

      // Estimate slope steepness
      const leftH = i > 0 ? heights[idx - 1] : h;
      const rightH = i < resolution - 1 ? heights[idx + 1] : h;
      const topH = j > 0 ? heights[idx - resolution] : h;
      const bottomH = j < resolution - 1 ? heights[idx + resolution] : h;
      const dx = (rightH - leftH) / (2 * step);
      const dz = (bottomH - topH) / (2 * step);
      const slope = Math.sqrt(dx * dx + dz * dz);

      // Interpolate along color palette
      let r = 0.5, g = 0.5, b = 0.5;
      const stops = palette.stops;

      for (let s = 0; s < stops.length - 1; s++) {
        const s0 = stops[s];
        const s1 = stops[s + 1];
        if (normH >= s0[0] && normH <= s1[0]) {
          const t = (normH - s0[0]) / Math.max(0.0001, s1[0] - s0[0]);
          r = s0[1] + (s1[1] - s0[1]) * t;
          g = s0[2] + (s1[2] - s0[2]) * t;
          b = s0[3] + (s1[3] - s0[3]) * t;
          break;
        }
      }

      // If slope is steep, blend toward rock or neon accent
      if (slope > 0.8 && normH > 0.25) {
        const rockFactor = clamp((slope - 0.8) * 1.5, 0, 0.65);
        if (biome === 'cyberpunk') {
          // Glow magenta / cyan on steep cliff drops
          r = r * (1 - rockFactor) + 0.9 * rockFactor;
          g = g * (1 - rockFactor) + 0.1 * rockFactor;
          b = b * (1 - rockFactor) + 0.8 * rockFactor;
        } else {
          // Natural slate cliff tone
          r = r * (1 - rockFactor) + 0.42 * rockFactor;
          g = g * (1 - rockFactor) + 0.40 * rockFactor;
          b = b * (1 - rockFactor) + 0.38 * rockFactor;
        }
      }

      const cIdx = idx * 3;
      colors[cIdx] = r;
      colors[cIdx + 1] = g;
      colors[cIdx + 2] = b;
    }
  }

  return { heights, colors, minHeight: minH, maxHeight: maxH };
}

/**
 * Sample height at continuous world (x, z) coordinates using bilinear interpolation
 */
export function getSampledHeightAt(
  x: number,
  z: number,
  heights: Float32Array,
  size: number,
  resolution: number
): number {
  const halfSize = size / 2;
  // Normalized 0 .. resolution - 1
  const u = ((x + halfSize) / size) * (resolution - 1);
  const v = ((z + halfSize) / size) * (resolution - 1);

  if (u < 0 || u > resolution - 1 || v < 0 || v > resolution - 1) {
    return 0;
  }

  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const i1 = Math.min(i0 + 1, resolution - 1);
  const j1 = Math.min(j0 + 1, resolution - 1);

  const fx = u - i0;
  const fz = v - j0;

  const h00 = heights[j0 * resolution + i0];
  const h10 = heights[j0 * resolution + i1];
  const h01 = heights[j1 * resolution + i0];
  const h11 = heights[j1 * resolution + i1];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;

  return h0 * (1 - fz) + h1 * fz;
}

/**
 * Apply brush sculpt edit directly to height array
 */
export function applySculptBrush(
  centerWorldX: number,
  centerWorldZ: number,
  heights: Float32Array,
  size: number,
  resolution: number,
  mode: 'sculpt-raise' | 'sculpt-lower' | 'sculpt-flatten' | 'sculpt-smooth',
  radius: number,
  intensity: number,
  targetFlattenHeight = 0
): void {
  const halfSize = size / 2;
  const step = size / (resolution - 1);
  const radSq = radius * radius;

  // Find index bounds
  const minU = Math.max(0, Math.floor(((centerWorldX - radius + halfSize) / size) * (resolution - 1)));
  const maxU = Math.min(resolution - 1, Math.ceil(((centerWorldX + radius + halfSize) / size) * (resolution - 1)));
  const minV = Math.max(0, Math.floor(((centerWorldZ - radius + halfSize) / size) * (resolution - 1)));
  const maxV = Math.min(resolution - 1, Math.ceil(((centerWorldZ + radius + halfSize) / size) * (resolution - 1)));

  // If smoothing, first compute average in radius
  let avgH = 0;
  let count = 0;
  if (mode === 'sculpt-smooth') {
    for (let j = minV; j <= maxV; j++) {
      const z = -halfSize + j * step;
      for (let i = minU; i <= maxU; i++) {
        const x = -halfSize + i * step;
        const dSq = (x - centerWorldX) * (x - centerWorldX) + (z - centerWorldZ) * (z - centerWorldZ);
        if (dSq <= radSq) {
          avgH += heights[j * resolution + i];
          count++;
        }
      }
    }
    if (count > 0) avgH /= count;
  }

  for (let j = minV; j <= maxV; j++) {
    const z = -halfSize + j * step;
    for (let i = minU; i <= maxU; i++) {
      const x = -halfSize + i * step;
      const dSq = (x - centerWorldX) * (x - centerWorldX) + (z - centerWorldZ) * (z - centerWorldZ);
      if (dSq <= radSq) {
        const dist = Math.sqrt(dSq);
        const falloff = Math.cos((dist / radius) * (Math.PI / 2)); // Smooth cosine falloff
        const delta = intensity * falloff * 0.8;
        const idx = j * resolution + i;

        if (mode === 'sculpt-raise') {
          heights[idx] += delta;
        } else if (mode === 'sculpt-lower') {
          heights[idx] -= delta;
        } else if (mode === 'sculpt-flatten') {
          const current = heights[idx];
          heights[idx] = current + (targetFlattenHeight - current) * delta * 0.6;
        } else if (mode === 'sculpt-smooth') {
          const current = heights[idx];
          heights[idx] = current + (avgH - current) * delta * 0.5;
        }
      }
    }
  }
}

/**
 * Evaluates path surface material at a given point, supporting complex multi-material blends:
 * - Stone: Slate flagstones with cobblestone paver structure and dark mortar joints
 * - Gravel: Crushed limestone / river pebble aggregate with multi-frequency speckling
 * - Dirt: Packed rich country loam with soil grains and trodden footprint depth
 * - Cyber: Neon cyan/magenta circuit grid over carbon obsidian
 * - Blends: Cobble core + gravel buffer + dirt outer edge
 */
export function getPathMaterialColor(
  x: number,
  z: number,
  i: number,
  j: number,
  normDist: number, // 0 at center, 1 at outer boundary
  pathStyle: PathMaterial,
  customBlend?: { stone: number; gravel: number; dirt: number }
): [number, number, number] {
  // 1. Procedural Noise Generators
  // Paver structure (cobblestone grid with rounded block relief)
  const paverX = x * 1.5 + Math.sin(z * 0.8) * 0.4;
  const paverZ = z * 1.5 + Math.cos(x * 0.8) * 0.4;
  const paverNoise = Math.sin(paverX) * Math.cos(paverZ);
  const isMortar = Math.abs(paverNoise) > 0.60;

  // Gravel coarse aggregate speckle
  const gravelNoise1 = (Math.sin(x * 8.7 + z * 6.3) * 43758.5453) % 1;
  const gravelNoise2 = (Math.cos(x * 12.1 - z * 10.4) * 23421.631) % 1;
  const gravelSpeckle = 0.88 + gravelNoise1 * 0.24 + (gravelNoise2 > 0.85 ? 0.25 : gravelNoise2 < 0.15 ? -0.22 : 0);

  // Dirt soil fine grain
  const dirtNoise = (Math.sin(i * 14.17 + j * 37.91) * 31415.92) % 1;
  const dirtGrain = 0.92 + (dirtNoise - 0.5) * 0.18;

  // 2. Individual Material Signatures
  // Stone / Cobblestone [r, g, b]
  let stoneR = 0.58;
  let stoneG = 0.57;
  let stoneB = 0.55;
  if (isMortar) {
    // Dark mortar channels
    stoneR = 0.36;
    stoneG = 0.35;
    stoneB = 0.33;
  } else {
    // Subtle granite paver variation
    const varFactor = 0.94 + paverNoise * 0.12;
    stoneR = clamp(stoneR * varFactor, 0, 1);
    stoneG = clamp(stoneG * varFactor, 0, 1);
    stoneB = clamp(stoneB * varFactor, 0, 1);
  }

  // Gravel aggregate [r, g, b] (river pebble / crushed limestone)
  const gravelR = clamp(0.64 * gravelSpeckle, 0, 1);
  const gravelG = clamp(0.61 * gravelSpeckle, 0, 1);
  const gravelB = clamp(0.55 * gravelSpeckle, 0, 1);

  // Dirt / Loam [r, g, b] (warm organic earth)
  const dirtR = clamp(0.54 * dirtGrain, 0, 1);
  const dirtG = clamp(0.40 * dirtGrain, 0, 1);
  const dirtB = clamp(0.26 * dirtGrain, 0, 1);

  // Cyber [r, g, b]
  if (pathStyle === 'cyber') {
    const grid = Math.abs(Math.sin(x * 1.5)) < 0.12 || Math.abs(Math.sin(z * 1.5)) < 0.12;
    return grid ? [0.06, 0.88, 0.95] : [0.08, 0.11, 0.18];
  }

  // 3. Multi-Material Blend Weights calculation
  let wStone = 0;
  let wGravel = 0;
  let wDirt = 0;

  if (customBlend || pathStyle === 'custom_blend') {
    const blend = customBlend || { stone: 45, gravel: 35, dirt: 20 };
    const total = Math.max(0.001, blend.stone + blend.gravel + blend.dirt);
    const baseStone = blend.stone / total;
    const baseGravel = blend.gravel / total;
    const baseDirt = blend.dirt / total;

    // Organic physical cross-section distribution:
    // Solid stone pavers concentrate toward path centerline,
    // gravel fills intermediate spaces, and dirt fringes the outer edges
    const centerFactor = Math.cos(normDist * (Math.PI / 2));
    const edgeFactor = Math.sin(normDist * (Math.PI / 2));

    const modStone = baseStone * (0.6 + 0.45 * centerFactor);
    const modGravel = baseGravel * (0.8 + 0.25 * (1 - Math.abs(normDist - 0.5) * 2));
    const modDirt = baseDirt * (0.6 + 0.55 * edgeFactor);

    const modTotal = Math.max(0.001, modStone + modGravel + modDirt);
    wStone = modStone / modTotal;
    wGravel = modGravel / modTotal;
    wDirt = modDirt / modTotal;
  } else {
    switch (pathStyle) {
      case 'stone':
        wStone = 1.0;
        break;
      case 'gravel':
        wGravel = 1.0;
        break;
      case 'dirt':
        wDirt = 1.0;
        break;
      case 'blend_stone_gravel':
        // Core stone pavers, shoulders crushed gravel
        wStone = clamp(1.0 - normDist * 1.35, 0, 1);
        wGravel = 1.0 - wStone;
        break;
      case 'blend_dirt_gravel':
        // Trodden wheel track center with gravel aggregate
        wDirt = clamp(0.65 + Math.sin(normDist * Math.PI) * 0.35, 0, 1);
        wGravel = 1.0 - wDirt;
        break;
      case 'blend_natural':
      default:
        // AAA Game Natural Trail:
        // normDist < 0.4 -> flagstone core
        // 0.4 <= normDist < 0.75 -> crushed pebble gravel sub-base
        // 0.75 <= normDist <= 1.0 -> trodden dirt fringe merging into landscape
        if (normDist < 0.4) {
          const t = normDist / 0.4;
          wStone = 1 - t * 0.4;
          wGravel = t * 0.4;
        } else if (normDist < 0.75) {
          const t = (normDist - 0.4) / 0.35;
          wStone = 0.6 * (1 - t);
          wGravel = 0.4 + t * 0.4;
          wDirt = t * 0.2;
        } else {
          const t = (normDist - 0.75) / 0.25;
          wGravel = 0.6 * (1 - t);
          wDirt = 0.4 + t * 0.6;
        }
        break;
    }
  }

  // Edge ambient darkening along border for realistic physical path depth
  const edgeFactor = 0.88 + 0.12 * (1 - normDist);

  const finalR = clamp((stoneR * wStone + gravelR * wGravel + dirtR * wDirt) * edgeFactor, 0, 1);
  const finalG = clamp((stoneG * wStone + gravelG * wGravel + dirtG * wDirt) * edgeFactor, 0, 1);
  const finalB = clamp((stoneB * wStone + gravelB * wGravel + dirtB * wDirt) * edgeFactor, 0, 1);

  return [finalR, finalG, finalB];
}

export interface PathPresetConfig {
  id: PathMaterial;
  name: string;
  subtitle: string;
  badge: string;
  description: string;
  blendRatios: { stone: number; gravel: number; dirt: number };
  accentColor: string;
}

export const PATH_MATERIAL_PRESETS: PathPresetConfig[] = [
  {
    id: 'blend_natural',
    name: 'Natural Trail',
    subtitle: 'Stone + Gravel + Dirt',
    badge: '🌿 Realistic Blend',
    description: 'Flagstone core, crushed pebble sub-base, and soft loam edges',
    blendRatios: { stone: 40, gravel: 35, dirt: 25 },
    accentColor: '#10b981',
  },
  {
    id: 'blend_stone_gravel',
    name: 'Cobble & Gravel',
    subtitle: 'Town Plaza',
    badge: '🏛️ Paved Plaza',
    description: 'Interlocking cobblestone pavers with crushed gravel joints',
    blendRatios: { stone: 75, gravel: 20, dirt: 5 },
    accentColor: '#94a3b8',
  },
  {
    id: 'blend_dirt_gravel',
    name: 'Dirt & Gravel Track',
    subtitle: 'Country Way',
    badge: '🚜 Rustic Rut',
    description: 'Trodden rustic earth with pebble shoulders and wheel-ruts',
    blendRatios: { stone: 10, gravel: 40, dirt: 50 },
    accentColor: '#f59e0b',
  },
  {
    id: 'stone',
    name: 'Pure Stone',
    subtitle: 'Granite Cobblestone',
    badge: '🪨 Solid Masonry',
    description: 'Hand-carved slate cobblestones with dark mortar lines',
    blendRatios: { stone: 100, gravel: 0, dirt: 0 },
    accentColor: '#64748b',
  },
  {
    id: 'gravel',
    name: 'Crushed Gravel',
    subtitle: 'Pebble Aggregate',
    badge: '⚪ Aggregate',
    description: 'Crushed limestone aggregate with multi-tone mineral specks',
    blendRatios: { stone: 0, gravel: 100, dirt: 0 },
    accentColor: '#cbd5e1',
  },
  {
    id: 'dirt',
    name: 'Packed Dirt',
    subtitle: 'Warm Country Loam',
    badge: '🌾 Organic Earth',
    description: 'Rich organic soil with earthy grain and trodden texture',
    blendRatios: { stone: 0, gravel: 0, dirt: 100 },
    accentColor: '#b45309',
  },
  {
    id: 'custom_blend',
    name: 'Custom Mix',
    subtitle: 'Multi-Material Mixer',
    badge: '🎨 User Recipe',
    description: 'Customized blend ratios between stone, gravel, and dirt',
    blendRatios: { stone: 45, gravel: 35, dirt: 20 },
    accentColor: '#06b6d4',
  },
  {
    id: 'cyber',
    name: 'Neon Cyber Grid',
    subtitle: 'Synthetic Path',
    badge: '⚡ Cyberpunk',
    description: 'Luminescent neon data channels etched into obsidian alloy',
    blendRatios: { stone: 50, gravel: 0, dirt: 0 },
    accentColor: '#06b6d4',
  },
];

/**
 * Apply Path Texture Brush: paints multi-material blended trail textures
 * and subtly grades the terrain height for a smooth walkable surface.
 */
export function applyPathBrush(
  centerWorldX: number,
  centerWorldZ: number,
  heights: Float32Array,
  colors: Float32Array,
  size: number,
  resolution: number,
  pathStyle: PathMaterial = 'blend_natural',
  radius = 6,
  intensity = 1.0,
  customBlend?: { stone: number; gravel: number; dirt: number }
): void {
  const halfSize = size / 2;
  const step = size / (resolution - 1);
  const radSq = radius * radius;

  const minU = Math.max(0, Math.floor(((centerWorldX - radius + halfSize) / size) * (resolution - 1)));
  const maxU = Math.min(resolution - 1, Math.ceil(((centerWorldX + radius + halfSize) / size) * (resolution - 1)));
  const minV = Math.max(0, Math.floor(((centerWorldZ - radius + halfSize) / size) * (resolution - 1)));
  const maxV = Math.min(resolution - 1, Math.ceil(((centerWorldZ + radius + halfSize) / size) * (resolution - 1)));

  // Calculate local average height to gently grade/smooth the pathway
  let avgH = 0;
  let count = 0;
  for (let j = minV; j <= maxV; j++) {
    for (let i = minU; i <= maxU; i++) {
      const x = -halfSize + i * step;
      const z = -halfSize + j * step;
      const dSq = (x - centerWorldX) * (x - centerWorldX) + (z - centerWorldZ) * (z - centerWorldZ);
      if (dSq <= radSq) {
        avgH += heights[j * resolution + i];
        count++;
      }
    }
  }
  if (count > 0) avgH /= count;

  for (let j = minV; j <= maxV; j++) {
    const z = -halfSize + j * step;
    for (let i = minU; i <= maxU; i++) {
      const x = -halfSize + i * step;
      const dSq = (x - centerWorldX) * (x - centerWorldX) + (z - centerWorldZ) * (z - centerWorldZ);
      if (dSq <= radSq) {
        const dist = Math.sqrt(dSq);
        const normDist = dist / radius; // 0 at center, 1 at edge
        const falloff = Math.cos(normDist * (Math.PI / 2));
        const factor = clamp(intensity * falloff, 0, 1);
        const idx = j * resolution + i;

        // Gentle walkway height smoothing (creates a natural walkable leveled path)
        heights[idx] = heights[idx] + (avgH - heights[idx]) * factor * 0.35;

        // Evaluate blended material color at this exact vertex
        const [targetR, targetG, targetB] = getPathMaterialColor(
          x,
          z,
          i,
          j,
          normDist,
          pathStyle,
          customBlend
        );

        const cIdx = idx * 3;
        colors[cIdx] = colors[cIdx] * (1 - factor) + targetR * factor;
        colors[cIdx + 1] = colors[cIdx + 1] * (1 - factor) + targetG * factor;
        colors[cIdx + 2] = colors[cIdx + 2] * (1 - factor) + targetB * factor;
      }
    }
  }
}

export interface GeneratedTrailResult {
  propPositions: {
    x: number;
    y: number;
    z: number;
    rotationY: number;
    type: 'stepping_stones' | 'street_lamp' | 'cobblestone_path' | 'wooden_boardwalk' | 'trail_signpost';
    segmentType?: string;
  }[];
  segments: {
    name: string;
    description: string;
    blend: { stone: number; gravel: number; dirt: number };
    length: number;
  }[];
}

/**
 * Finds reliable, picturesque waypoints guaranteed to be on solid land above water level
 */
function findScenicLandWaypoints(
  heights: Float32Array,
  size: number,
  resolution: number,
  waterLevel: number,
  heightScale: number,
  prng: () => number,
  keyLocations?: { x: number; z: number }[]
): { x: number; z: number; name: string }[] {
  // If user has key locations (placed buildings), connect those directly
  if (keyLocations && keyLocations.length >= 2) {
    const list = keyLocations.slice(0, 7).map((loc, i) => ({
      x: loc.x,
      z: loc.z,
      name: `Point of Interest ${i + 1}`,
    }));
    // Close the circuit
    list.push({ ...list[0] });
    return list;
  }

  const waypoints: { x: number; z: number; name: string }[] = [];

  // 1. Central Plaza Hub: Search near island center for optimal land elevation
  let bestCenter = { x: 0, z: 0, h: -999 };
  for (let r = 0; r <= size * 0.15; r += size * 0.03) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const ch = getSampledHeightAt(cx, cz, heights, size, resolution);
      if (ch > waterLevel + 0.6) {
        if (bestCenter.h === -999 || Math.abs(ch - (waterLevel + 2.5)) < Math.abs(bestCenter.h - (waterLevel + 2.5))) {
          bestCenter = { x: cx, z: cz, h: ch };
        }
      }
    }
  }
  if (bestCenter.h > waterLevel) {
    waypoints.push({ x: bestCenter.x, z: bestCenter.z, name: 'Village Central Plaza' });
  } else {
    waypoints.push({ x: 0, z: 0, name: 'Village Central Plaza' });
  }

  // 2. Discover scenic destinations distributed around the island in 4 cardinal quadrants
  const quadrantDefs = [
    { baseAngle: Math.PI * 0.20, name: 'Eastern Coastal Shore' },
    { baseAngle: Math.PI * 0.70, name: 'Southern Valley Basin' },
    { baseAngle: Math.PI * 1.25, name: 'Western Harbor Approach' },
    { baseAngle: Math.PI * 1.78, name: 'Northern Mountain Crest' },
  ];

  for (const quad of quadrantDefs) {
    let candidate: { x: number; z: number; name: string } | null = null;
    let bestScore = -Infinity;

    // Search along a fan of angles
    for (let da = -0.32; da <= 0.32; da += 0.11) {
      const a = quad.baseAngle + da + (prng() - 0.5) * 0.08;
      // Raymarch from inner radius to outer island edge
      for (let dist = size * 0.12; dist <= size * 0.36; dist += size * 0.03) {
        const testX = Math.cos(a) * dist;
        const testZ = Math.sin(a) * dist;
        const testH = getSampledHeightAt(testX, testZ, heights, size, resolution);

        // Ensure this point is on land and comfortably above water
        if (testH >= waterLevel + 0.6) {
          // Score by distance and elevation aesthetics
          const score = dist * 1.2 + (testH > waterLevel + 1.2 ? 6 : 0) + (testH < heightScale * 0.8 ? 4 : 0);
          if (score > bestScore) {
            bestScore = score;
            candidate = { x: testX, z: testZ, name: quad.name };
          }
        }
      }
    }

    if (candidate) {
      waypoints.push(candidate);
    }
  }

  // Fallback if terrain is very small
  if (waypoints.length < 3) {
    const r = Math.max(10, size * 0.14);
    waypoints.push({ x: r, z: 0, name: 'East Overlook' });
    waypoints.push({ x: 0, z: r, name: 'South Promenade' });
    waypoints.push({ x: -r, z: 0, name: 'West Lookout' });
  }

  // Loop circuit back to central hub for complete connected exploration
  waypoints.push({ x: waypoints[0].x, z: waypoints[0].z, name: waypoints[0].name });

  return waypoints;
}

/**
 * Generates organic winding trails across the terrain, applying contextual multi-material
 * blends specifically to each path segment:
 * - Coastal Boardwalk Zone: Beach sand / organic dirt + smooth pebble gravel
 * - Central Village Plaza: Heavy cobblestone pavers with crushed gravel joints
 * - Valley Overland Trail: Natural 3-material blend (Flagstone core + pebble sub-base + loam borders)
 * - Mountain Ridge Overlook: Weathered granite stone slabs with mountain talus scree
 */
export function generateProceduralTrails(
  heights: Float32Array,
  colors: Float32Array,
  config: TerrainConfig,
  keyLocations?: { x: number; z: number }[]
): GeneratedTrailResult {
  const { size, resolution, seed, pathStyle, waterLevel, heightScale, pathBlendRatios } = config;
  const prng = createPRNG(seed + 101);
  const propPositions: GeneratedTrailResult['propPositions'] = [];
  const segmentsMeta: GeneratedTrailResult['segments'] = [];

  // 1. Guaranteed Land Waypoints
  const waypoints = findScenicLandWaypoints(
    heights,
    size,
    resolution,
    waterLevel,
    heightScale,
    prng,
    keyLocations
  );

  // Segment Material Blend Recipes applied specifically per geographical zone
  const SEGMENT_RECIPES = [
    {
      name: 'Village Central Plaza',
      description: 'Heavy cobblestone pavers with fine gravel mortar joints',
      style: 'blend_stone_gravel' as PathMaterial,
      blend: { stone: 78, gravel: 18, dirt: 4 },
      brushRad: Math.max(5.8, size * 0.058),
    },
    {
      name: 'Pastoral Valley Trail',
      description: 'Natural 3-way blend with slate stepping stones, crushed pebble sub-base, and loam edges',
      style: 'blend_natural' as PathMaterial,
      blend: pathBlendRatios || { stone: 42, gravel: 38, dirt: 20 },
      brushRad: Math.max(5.2, size * 0.052),
    },
    {
      name: 'Mountain Ridge Crest',
      description: 'Solid weathered granite slabs and alpine scree gravel',
      style: 'stone' as PathMaterial,
      blend: { stone: 85, gravel: 15, dirt: 0 },
      brushRad: Math.max(4.8, size * 0.048),
    },
    {
      name: 'Coastal Shoreline Approach',
      description: 'Moist seaside dirt and river gravel transitioning to tidal boardwalks',
      style: 'blend_dirt_gravel' as PathMaterial,
      blend: { stone: 12, gravel: 48, dirt: 40 },
      brushRad: Math.max(5.0, size * 0.050),
    },
  ];

  // 2. Connect waypoints sequentially with smooth Catmull-Rom spline curves
  for (let w = 0; w < waypoints.length - 1; w++) {
    const p0 = waypoints[Math.max(0, w - 1)];
    const p1 = waypoints[w];
    const p2 = waypoints[w + 1];
    const p3 = waypoints[Math.min(waypoints.length - 1, w + 2)];

    const segmentRecipe = SEGMENT_RECIPES[w % SEGMENT_RECIPES.length];
    segmentsMeta.push({
      name: `${segmentRecipe.name} (${waypoints[w].name} → ${waypoints[w + 1].name})`,
      description: segmentRecipe.description,
      blend: segmentRecipe.blend,
      length: 40,
    });

    const steps = 42;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;

      const px = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );
      const pz = 0.5 * (
        (2 * p1.z) +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
      );

      // Add gentle organic meander
      const meanderX = px + Math.sin(t * Math.PI * 3 + w) * 1.1;
      const meanderZ = pz + Math.cos(t * Math.PI * 3 + w) * 1.1;

      const currentH = getSampledHeightAt(meanderX, meanderZ, heights, size, resolution);

      // Process only walkable land and coastal shallows
      if (currentH >= waterLevel - 0.6) {
        // Calculate segment-specific material blend
        let segmentBlend = segmentRecipe.blend;
        let segmentStyle = segmentRecipe.style;
        let brushRad = segmentRecipe.brushRad;

        // If user set a custom pathStyle preference, prioritize user's choice
        if (pathStyle && pathStyle !== 'stone' && pathStyle !== 'blend_natural') {
          segmentStyle = pathStyle;
          if (pathBlendRatios) segmentBlend = pathBlendRatios;
        }

        // Contextual altitude adjustments for coastal vs mountain transitions
        if (currentH <= waterLevel + 1.2) {
          // Low shore zone: enforce coastal blend with dirt & pebble transition
          segmentStyle = 'blend_dirt_gravel';
          segmentBlend = { stone: 10, gravel: 45, dirt: 45 };
          brushRad = Math.max(5.0, size * 0.05);
        } else if (currentH > heightScale * 0.45) {
          // Alpine heights: high granite stone proportion
          segmentStyle = 'stone';
          segmentBlend = { stone: 85, gravel: 15, dirt: 0 };
          brushRad = Math.max(4.8, size * 0.048);
        }

        // Apply path texture brush specifically with the segment's multi-material blend
        applyPathBrush(
          meanderX,
          meanderZ,
          heights,
          colors,
          size,
          resolution,
          segmentStyle,
          brushRad,
          1.0,
          segmentBlend
        );

        // Place tasteful scenic waypoint props (lanterns & signposts) placed beside the trail
        // Placed at midpoint and waypoints, strictly grounded on terrain (no floating)
        if (s === Math.floor(steps / 2)) {
          const rotY = Math.atan2(p2.x - p1.x, p2.z - p1.z);
          const sideOffset = (w % 2 === 0 ? 1 : -1) * (brushRad * 0.72);
          const propX = meanderX + Math.sin(rotY + Math.PI / 2) * sideOffset;
          const propZ = meanderZ + Math.cos(rotY + Math.PI / 2) * sideOffset;
          // CRITICAL: Ground precisely on terrain height at this specific position
          const propY = getSampledHeightAt(propX, propZ, heights, size, resolution);

          if (propY >= waterLevel + 0.3) {
            propPositions.push({
              x: propX,
              y: propY,
              z: propZ,
              rotationY: rotY + (w % 2 === 0 ? Math.PI / 2 : -Math.PI / 2),
              type: w % 2 === 0 ? 'street_lamp' : 'trail_signpost',
              segmentType: 'trail_waypoint',
            });
          }
        }
      }
    }
  }

  return { propPositions, segments: segmentsMeta };
}
