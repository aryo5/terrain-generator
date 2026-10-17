import { SimplexNoise2D, clamp, smoothstep, createPRNG } from './math';
import { BiomeType, TerrainConfig } from '../types';

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

  // Island radial falloff mask (expansive, natural shoreline without triangular artifacts)
  if (islandFalloff) {
    const warpAngle = Math.atan2(nz, nx);
    const warpRadius = 1.0 + 0.16 * Math.sin(warpAngle * 3 + nx * 2) + 0.10 * Math.cos(warpAngle * 5 - nz * 2);
    const distFromCenter = (Math.sqrt(nx * nx + nz * nz) / warpRadius) * 2; // 0 at center, ~1.4 at corners
    // Smooth cosine edge fade with wider, expansive habitable plateau
    const mask = smoothstep(0.98, 0.28, distFromCenter);
    h = (h + 0.35) * mask - 0.22;
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
 * Apply path brush: paints trail colors and subtly grades the terrain height
 */
export function applyPathBrush(
  centerWorldX: number,
  centerWorldZ: number,
  heights: Float32Array,
  colors: Float32Array,
  size: number,
  resolution: number,
  pathStyle: 'dirt' | 'stone' | 'cyber' = 'dirt',
  radius = 6,
  intensity = 1.0
): void {
  const halfSize = size / 2;
  const step = size / (resolution - 1);
  const radSq = radius * radius;

  // Path target colors: warm dirt, cobblestone slate, or neon cyber
  let pr = 0.68, pg = 0.52, pb = 0.35; // dirt trail
  if (pathStyle === 'stone') {
    pr = 0.55; pg = 0.53; pb = 0.50; // cobblestone slate
  } else if (pathStyle === 'cyber') {
    pr = 0.08; pg = 0.88; pb = 0.95; // neon cyan cyber pavers
  }

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
        const falloff = Math.cos((dist / radius) * (Math.PI / 2));
        const factor = clamp(intensity * falloff, 0, 1);
        const idx = j * resolution + i;

        // Gentle walkway height smoothing (gentle slope flattening)
        heights[idx] = heights[idx] + (avgH - heights[idx]) * factor * 0.35;

        // Blend vertex colors with subtle cobblestone/soil noise
        const pseudoNoise = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
        const tint = 0.92 + (pseudoNoise - 0.5) * 0.16;
        const targetR = clamp(pr * tint, 0, 1);
        const targetG = clamp(pg * tint, 0, 1);
        const targetB = clamp(pb * tint, 0, 1);

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
    type: 'stepping_stones' | 'street_lamp' | 'cobblestone_path' | 'wooden_boardwalk';
  }[];
}

/**
 * Generates organic winding trails across the terrain, carving/painting the path
 * and returning recommended waypoint props (stepping stones, lanterns, boardwalks).
 */
export function generateProceduralTrails(
  heights: Float32Array,
  colors: Float32Array,
  config: TerrainConfig,
  keyLocations?: { x: number; z: number }[]
): GeneratedTrailResult {
  const { size, resolution, seed, pathStyle, waterLevel } = config;
  const prng = createPRNG(seed + 101);
  const propPositions: GeneratedTrailResult['propPositions'] = [];

  // Generate scenic waypoints across the island or connect given locations
  let waypoints: { x: number; z: number }[] = [];
  if (keyLocations && keyLocations.length >= 2) {
    waypoints = keyLocations.slice(0, 6);
  } else {
    // Generate organic scenic path winding from coast to village center to scenic overlook
    const r1 = size * 0.28;
    const a1 = prng() * Math.PI * 2;
    const a2 = a1 + Math.PI * 0.75 + prng() * 0.3;
    const a3 = a2 + Math.PI * 0.65 + prng() * 0.3;

    waypoints = [
      { x: Math.cos(a1) * r1, z: Math.sin(a1) * r1 },
      { x: (prng() * 2 - 1) * 8, z: (prng() * 2 - 1) * 8 }, // central village/square
      { x: Math.cos(a2) * r1 * 0.85, z: Math.sin(a2) * r1 * 0.85 },
      { x: Math.cos(a3) * r1 * 0.9, z: Math.sin(a3) * r1 * 0.9 },
    ];
  }

  // Connect waypoints sequentially with Catmull-Rom spline curve
  for (let w = 0; w < waypoints.length - 1; w++) {
    const p0 = waypoints[Math.max(0, w - 1)];
    const p1 = waypoints[w];
    const p2 = waypoints[w + 1];
    const p3 = waypoints[Math.min(waypoints.length - 1, w + 2)];

    const steps = 30;
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
      const meanderX = px + Math.sin(t * 7 + w) * 1.4;
      const meanderZ = pz + Math.cos(t * 7 + w) * 1.4;

      const currentH = getSampledHeightAt(meanderX, meanderZ, heights, size, resolution);
      if (currentH >= waterLevel - 0.4) {
        // Paint the path onto height & color buffers
        applyPathBrush(meanderX, meanderZ, heights, colors, size, resolution, pathStyle, 5.5, 0.9);

        // Periodically place stepping stones or lanterns along the trail
        if (s % 6 === 2 && currentH > waterLevel + 0.3) {
          const rotY = Math.atan2(p2.x - p1.x, p2.z - p1.z) + (prng() - 0.5) * 0.2;
          const isLamp = s % 12 === 2;
          propPositions.push({
            x: meanderX,
            y: currentH,
            z: meanderZ,
            rotationY: rotY,
            type: isLamp ? 'street_lamp' : 'stepping_stones',
          });
        }
      }
    }
  }

  return { propPositions };
}
