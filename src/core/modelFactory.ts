import * as THREE from 'three';
import { PaletteItem } from '../types';

// Pre-create reusable contact shadow texture & material
let contactShadowTexture: THREE.CanvasTexture | null = null;
let sharedContactShadowMat: THREE.MeshBasicMaterial | null = null;
const shadowGeoCache = new Map<number, THREE.PlaneGeometry>();

function getContactShadowTexture(): THREE.CanvasTexture {
  if (contactShadowTexture) return contactShadowTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 64; // lightweight 64x64 on mobile
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(32, 32, 5, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  contactShadowTexture = new THREE.CanvasTexture(canvas);
  contactShadowTexture.colorSpace = THREE.SRGBColorSpace;
  return contactShadowTexture;
}

function getContactShadowMaterial(): THREE.MeshBasicMaterial {
  if (!sharedContactShadowMat) {
    sharedContactShadowMat = new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }
  return sharedContactShadowMat;
}

function createContactShadowDisc(radius = 2.0): THREE.Mesh {
  let geo = shadowGeoCache.get(radius);
  if (!geo) {
    geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    geo.rotateX(-Math.PI / 2);
    shadowGeoCache.set(radius, geo);
  }
  const shadowMesh = new THREE.Mesh(geo, getContactShadowMaterial());
  shadowMesh.position.y = 0.02; // avoid z-fighting
  shadowMesh.renderOrder = 1;
  return shadowMesh;
}

/**
 * 1. Cyberpunk Skyscraper (Neo Tower - 8 composite parts)
 */
export function createCyberSkyscraper(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyber_skyscraper';

  // 1. Foundation base podium
  const baseGeo = new THREE.BoxGeometry(6, 3, 6);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.8,
    metalness: 0.4,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 1.5;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 2. Main lower tower shaft
  const towerGeo = new THREE.BoxGeometry(4.8, 16, 4.8);
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
    metalness: 0.85,
  });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.y = 3 + 8;
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // 3. Setback upper penthouse block
  const upperGeo = new THREE.BoxGeometry(3.6, 6, 3.6);
  const upperMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.2,
    metalness: 0.9,
  });
  const upper = new THREE.Mesh(upperGeo, upperMat);
  upper.position.y = 19 + 3;
  upper.castShadow = true;
  group.add(upper);

  // 4. Glowing Neon vertical light strips (Accent)
  const stripGeo = new THREE.BoxGeometry(0.2, 18, 0.2);
  const stripMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 2.5,
    roughness: 0.1,
  });
  const strip1 = new THREE.Mesh(stripGeo, stripMat);
  strip1.position.set(2.45, 12, 2.45);
  const strip2 = new THREE.Mesh(stripGeo, stripMat);
  strip2.position.set(-2.45, 12, -2.45);
  group.add(strip1, strip2);

  // 5. Rooftop Helipad Disc
  const helipadGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.3, 16);
  const helipadMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.5,
    metalness: 0.6,
  });
  const helipad = new THREE.Mesh(helipadGeo, helipadMat);
  helipad.position.y = 25.15;
  group.add(helipad);

  // 6. Helipad border neon ring
  const ringGeo = new THREE.TorusGeometry(1.5, 0.08, 8, 24);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0xf43f5e,
    emissiveIntensity: 3.0,
    roughness: 0.2,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 25.32;
  group.add(ring);

  // 7. Communications Spire Antenna
  const mastGeo = new THREE.CylinderGeometry(0.08, 0.2, 5, 8);
  const mastMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.95,
    roughness: 0.15,
  });
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.set(0.8, 27.8, 0.8);
  group.add(mast);

  // 8. Warning Strobe Beacon
  const beaconGeo = new THREE.SphereGeometry(0.2, 8, 8);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xff0055,
    emissive: 0xff0055,
    emissiveIntensity: 4.0,
    roughness: 0.1,
  });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(0.8, 30.4, 0.8);
  group.add(beacon);

  // Radial Ground Contact Shadow
  group.add(createContactShadowDisc(4.5));

  return group;
}

/**
 * 2. Cyberpunk Apartment / Modular Complex (7 parts)
 */
export function createCyberApartment(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyber_apartment';

  // 1. Lower concrete base
  const bGeo = new THREE.BoxGeometry(7, 3, 5);
  const bMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8, metalness: 0.2 });
  const b = new THREE.Mesh(bGeo, bMat);
  b.position.y = 1.5;
  b.castShadow = true;
  group.add(b);

  // 2. Middle block with indented balconies
  const mGeo = new THREE.BoxGeometry(6.4, 6, 4.4);
  const mMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.6 });
  const m = new THREE.Mesh(mGeo, mMat);
  m.position.y = 6;
  m.castShadow = true;
  group.add(m);

  // 3. Staggered modular balcony boxes
  const balcGeo = new THREE.BoxGeometry(2.2, 1.2, 0.6);
  const balcMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.7 });
  const balc1 = new THREE.Mesh(balcGeo, balcMat);
  balc1.position.set(-1.8, 5.5, 2.4);
  const balc2 = new THREE.Mesh(balcGeo, balcMat);
  balc2.position.set(1.6, 7.5, 2.4);
  group.add(balc1, balc2);

  // 4. Rooftop HVAC unit
  const hvacGeo = new THREE.BoxGeometry(1.8, 1.2, 2.0);
  const hvacMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.5 });
  const hvac = new THREE.Mesh(hvacGeo, hvacMat);
  hvac.position.set(-1.5, 9.6, 0);
  group.add(hvac);

  // 5. Water tower cylinder
  const wtGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12);
  const wtMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.7, metalness: 0.3 });
  const wt = new THREE.Mesh(wtGeo, wtMat);
  wt.position.set(1.6, 9.9, 0.4);
  group.add(wt);

  // 6. Glowing billboard / neon sign
  const signGeo = new THREE.BoxGeometry(3.0, 1.4, 0.15);
  const signMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 10.4, 1.8);
  group.add(sign);

  group.add(createContactShadowDisc(4.2));
  return group;
}

/**
 * 3. Stylized Low-Poly Pine Tree (5 composite parts)
 */
export function createPineTree(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pine_tree';

  // 1. Tapered Wooden Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 2.2, 7);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x5c3d2e,
    roughness: 0.9,
    metalness: 0.05,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  group.add(trunk);

  // 2. Bottom Foliage Tier
  const botGeo = new THREE.ConeGeometry(2.4, 2.6, 7);
  const foliageMat1 = new THREE.MeshStandardMaterial({
    color: 0x1e5e3a,
    roughness: 0.75,
    metalness: 0.1,
    flatShading: true,
  });
  const bot = new THREE.Mesh(botGeo, foliageMat1);
  bot.position.y = 2.4;
  bot.castShadow = true;
  group.add(bot);

  // 3. Middle Foliage Tier (slight rotation for stylized asymmetry)
  const midGeo = new THREE.ConeGeometry(1.8, 2.2, 7);
  const foliageMat2 = new THREE.MeshStandardMaterial({
    color: 0x2d7a4c,
    roughness: 0.7,
    metalness: 0.1,
    flatShading: true,
  });
  const mid = new THREE.Mesh(midGeo, foliageMat2);
  mid.position.y = 3.6;
  mid.rotation.y = 0.4;
  mid.castShadow = true;
  group.add(mid);

  // 4. Top Crown Spire (lighter apex highlight)
  const topGeo = new THREE.ConeGeometry(1.2, 1.8, 7);
  const foliageMat3 = new THREE.MeshStandardMaterial({
    color: 0x48a065,
    roughness: 0.65,
    metalness: 0.1,
    flatShading: true,
  });
  const top = new THREE.Mesh(topGeo, foliageMat3);
  top.position.y = 4.7;
  top.rotation.y = 0.9;
  top.castShadow = true;
  group.add(top);

  group.add(createContactShadowDisc(2.2));
  return group;
}

/**
 * 4. Stylized Broadleaf / Oak Tree (6 composite parts)
 */
export function createBroadleafTree(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'broadleaf_tree';

  // 1. Organic Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 2.6, 8);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x6e473b,
    roughness: 0.85,
    metalness: 0.05,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  group.add(trunk);

  // Canopy Clusters (Stylized low-poly icos/spheres)
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x55a630,
    roughness: 0.8,
    metalness: 0.05,
    flatShading: true,
  });
  const leafMatLight = new THREE.MeshStandardMaterial({
    color: 0x80b918,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
  });

  // 2. Central main cloud
  const c1Geo = new THREE.DodecahedronGeometry(1.8, 1);
  const c1 = new THREE.Mesh(c1Geo, leafMat);
  c1.position.set(0, 3.6, 0);
  c1.castShadow = true;
  group.add(c1);

  // 3. Side cluster left
  const c2Geo = new THREE.DodecahedronGeometry(1.3, 1);
  const c2 = new THREE.Mesh(c2Geo, leafMatLight);
  c2.position.set(-1.1, 3.2, 0.4);
  c2.castShadow = true;
  group.add(c2);

  // 4. Side cluster right
  const c3Geo = new THREE.DodecahedronGeometry(1.4, 1);
  const c3 = new THREE.Mesh(c3Geo, leafMat);
  c3.position.set(1.0, 3.4, -0.3);
  c3.castShadow = true;
  group.add(c3);

  // 5. Crown top tuft
  const c4Geo = new THREE.DodecahedronGeometry(1.2, 1);
  const c4 = new THREE.Mesh(c4Geo, leafMatLight);
  c4.position.set(0.2, 4.7, 0.1);
  c4.castShadow = true;
  group.add(c4);

  group.add(createContactShadowDisc(2.4));
  return group;
}

/**
 * 5. Medieval Stone Windmill (8 composite parts)
 */
export function createStoneWindmill(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stone_windmill';

  // 1. Octagonal stone foundation
  const baseGeo = new THREE.CylinderGeometry(2.4, 2.8, 1.8, 8);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true,
  });
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.9;
  base.castShadow = true;
  group.add(base);

  // 2. Tapered timber tower
  const towerGeo = new THREE.CylinderGeometry(1.8, 2.3, 4.5, 8);
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xa16207,
    roughness: 0.7,
    metalness: 0.05,
    flatShading: true,
  });
  const tower = new THREE.Mesh(towerGeo, woodMat);
  tower.position.y = 1.8 + 2.25;
  tower.castShadow = true;
  group.add(tower);

  // 3. Conical shingle roof
  const roofGeo = new THREE.ConeGeometry(2.2, 2.2, 8);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.6,
    metalness: 0.1,
    flatShading: true,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 6.3 + 1.1;
  roof.castShadow = true;
  group.add(roof);

  // 4. Windmill rotor hub
  const hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
  const hub = new THREE.Mesh(hubGeo, hubMat);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, 5.8, 2.0);
  group.add(hub);

  // 5. Four windmill sail blades
  const rotor = new THREE.Group();
  rotor.position.set(0, 5.8, 2.3);
  rotor.name = 'windmill_rotor';

  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    roughness: 0.8,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const arm = new THREE.Group();
    arm.rotation.z = angle;

    const sparGeo = new THREE.BoxGeometry(0.12, 3.8, 0.12);
    const spar = new THREE.Mesh(sparGeo, beamMat);
    spar.position.y = 1.9;
    arm.add(spar);

    const sailGeo = new THREE.PlaneGeometry(0.9, 2.8);
    const sail = new THREE.Mesh(sailGeo, bladeMat);
    sail.position.set(0.48, 2.2, 0.02);
    sail.rotation.y = 0.2;
    arm.add(sail);

    rotor.add(arm);
  }
  group.add(rotor);

  // 6. Arched wooden doorway
  const doorGeo = new THREE.BoxGeometry(0.8, 1.4, 0.2);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.7, 2.65);
  group.add(door);

  group.add(createContactShadowDisc(3.2));
  return group;
}

/**
 * 6. Island Coastal Lighthouse (8 composite parts)
 */
export function createIslandLighthouse(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'island_lighthouse';

  // 1. Rocky footing foundation
  const rockGeo = new THREE.CylinderGeometry(2.8, 3.2, 1.2, 9);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.95,
    metalness: 0.1,
    flatShading: true,
  });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.position.y = 0.6;
  group.add(rock);

  // 2. Lower white tower band
  const lowerGeo = new THREE.CylinderGeometry(2.0, 2.4, 4.0, 16);
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, metalness: 0.1 });
  const lower = new THREE.Mesh(lowerGeo, whiteMat);
  lower.position.y = 1.2 + 2.0;
  lower.castShadow = true;
  group.add(lower);

  // 3. Middle red stripe band
  const redGeo = new THREE.CylinderGeometry(1.6, 2.0, 3.0, 16);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.1 });
  const redBand = new THREE.Mesh(redGeo, redMat);
  redBand.position.y = 5.2 + 1.5;
  redBand.castShadow = true;
  group.add(redBand);

  // 4. Upper white column
  const upGeo = new THREE.CylinderGeometry(1.3, 1.6, 3.0, 16);
  const upper = new THREE.Mesh(upGeo, whiteMat);
  upper.position.y = 8.2 + 1.5;
  upper.castShadow = true;
  group.add(upper);

  // 5. Gallery iron walkway
  const galGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.3, 16);
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.8 });
  const gal = new THREE.Mesh(galGeo, ironMat);
  gal.position.y = 11.35;
  group.add(gal);

  // 6. Glass Lantern Room
  const glassGeo = new THREE.CylinderGeometry(1.2, 1.2, 1.6, 12);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    roughness: 0.1,
    metalness: 0.1,
    transmission: 0.9,
    ior: 1.5,
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.y = 12.3;
  group.add(glass);

  // 7. Rotating beacon light core
  const lampGeo = new THREE.SphereGeometry(0.4, 8, 8);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfef08a,
    emissiveIntensity: 4.0,
    roughness: 0.1,
  });
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.y = 12.3;
  group.add(lamp);

  // 8. Copper roof dome & spire
  const domeGeo = new THREE.ConeGeometry(1.4, 1.2, 12);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.3, metalness: 0.7 });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 13.7;
  group.add(dome);

  group.add(createContactShadowDisc(3.6));
  return group;
}

/**
 * 7. Alpine Cozy Cottage (7 composite parts)
 */
export function createAlpineCottage(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'alpine_cottage';

  // 1. Stone foundation
  const baseGeo = new THREE.BoxGeometry(4.4, 0.8, 3.4);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95 });
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.4;
  group.add(base);

  // 2. Timber chalet walls
  const wallGeo = new THREE.BoxGeometry(4.0, 2.2, 3.0);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
  const walls = new THREE.Mesh(wallGeo, woodMat);
  walls.position.y = 1.9;
  walls.castShadow = true;
  group.add(walls);

  // 3. Overhanging pitched roof
  const roofGeo = new THREE.ConeGeometry(3.2, 1.8, 4);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x451a03,
    roughness: 0.6,
    metalness: 0.1,
    flatShading: true,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.2, 1.0, 0.9);
  roof.position.y = 3.9;
  roof.castShadow = true;
  group.add(roof);

  // 4. Stone chimney stack
  const chimGeo = new THREE.BoxGeometry(0.7, 2.8, 0.7);
  const chimMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9 });
  const chim = new THREE.Mesh(chimGeo, chimMat);
  chim.position.set(1.4, 3.8, 0.6);
  chim.castShadow = true;
  group.add(chim);

  // 5. Warm glowing windows
  const winGeo = new THREE.PlaneGeometry(0.8, 0.8);
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfbbf24,
    emissiveIntensity: 1.8,
  });
  const win1 = new THREE.Mesh(winGeo, winMat);
  win1.position.set(1.0, 2.0, 1.52);
  const win2 = new THREE.Mesh(winGeo, winMat);
  win2.position.set(-1.0, 2.0, 1.52);
  group.add(win1, win2);

  // 6. Porch wooden canopy
  const porchGeo = new THREE.BoxGeometry(1.6, 0.1, 1.0);
  const porch = new THREE.Mesh(porchGeo, woodMat);
  porch.position.set(0, 2.2, 1.9);
  group.add(porch);

  group.add(createContactShadowDisc(3.0));
  return group;
}

/**
 * 8. Fantasy Crystal Spire (6 composite parts)
 */
export function createFantasyCrystal(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fantasy_crystal';

  // 1. Runic Carved Base Pedestal
  const baseGeo = new THREE.CylinderGeometry(1.6, 2.2, 1.0, 6);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x312e81,
    roughness: 0.7,
    metalness: 0.3,
    flatShading: true,
  });
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.5;
  group.add(base);

  // 2. Large Central Floating Crystal (Octahedron/Bipyramid)
  const cryGeo = new THREE.OctahedronGeometry(1.6, 0);
  const cryMat = new THREE.MeshPhysicalMaterial({
    color: 0xa855f7,
    emissive: 0x7c3aed,
    emissiveIntensity: 1.4,
    roughness: 0.15,
    metalness: 0.2,
    transmission: 0.7,
    ior: 1.8,
  });
  const mainCrystal = new THREE.Mesh(cryGeo, cryMat);
  mainCrystal.scale.set(0.8, 2.4, 0.8);
  mainCrystal.position.y = 3.6;
  mainCrystal.castShadow = true;
  group.add(mainCrystal);

  // 3. Orbiting Shard 1
  const shardGeo = new THREE.OctahedronGeometry(0.5, 0);
  const shard1 = new THREE.Mesh(shardGeo, cryMat);
  shard1.scale.set(0.6, 1.8, 0.6);
  shard1.position.set(1.6, 3.2, 0.8);
  group.add(shard1);

  // 4. Orbiting Shard 2
  const shard2 = new THREE.Mesh(shardGeo, cryMat);
  shard2.scale.set(0.5, 1.4, 0.5);
  shard2.position.set(-1.4, 4.2, -0.6);
  group.add(shard2);

  // 5. Levitating Magic Ring
  const ringGeo = new THREE.TorusGeometry(2.0, 0.08, 8, 24);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.5,
    metalness: 0.9,
    roughness: 0.1,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 3;
  ring.rotation.y = 0.4;
  ring.position.y = 3.6;
  group.add(ring);

  group.add(createContactShadowDisc(2.6));
  return group;
}

/**
 * 9. Sci-Fi Biosphere Habitat Dome (7 composite parts)
 */
export function createSciFiDome(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'scifi_dome';

  // 1. Hexagonal airlock base
  const baseGeo = new THREE.CylinderGeometry(3.6, 4.0, 0.8, 6);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.4;
  group.add(base);

  // 2. Translucent geodesic biosphere dome
  const domeGeo = new THREE.SphereGeometry(3.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.6,
    roughness: 0.1,
    metalness: 0.1,
    transmission: 0.85,
    ior: 1.4,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 0.8;
  group.add(dome);

  // 3. Central interior greenhouse biome
  const treeTrunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.25, 1.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 })
  );
  treeTrunk.position.y = 1.6;
  const treeFoliage = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.9),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.7, flatShading: true })
  );
  treeFoliage.position.y = 2.6;
  group.add(treeTrunk, treeFoliage);

  // 4. Airlock entrance corridor
  const tunnelGeo = new THREE.BoxGeometry(1.6, 1.4, 2.2);
  const tunnel = new THREE.Mesh(tunnelGeo, baseMat);
  tunnel.position.set(0, 1.1, 3.2);
  group.add(tunnel);

  // 5. Dual Solar Power Collectors
  const solarGeo = new THREE.BoxGeometry(2.0, 0.1, 1.2);
  const solarMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a,
    metalness: 0.9,
    roughness: 0.2,
  });
  const solar1 = new THREE.Mesh(solarGeo, solarMat);
  solar1.position.set(-3.6, 2.2, 0);
  solar1.rotation.z = 0.4;
  const solar2 = new THREE.Mesh(solarGeo, solarMat);
  solar2.position.set(3.6, 2.2, 0);
  solar2.rotation.z = -0.4;
  group.add(solar1, solar2);

  group.add(createContactShadowDisc(4.8));
  return group;
}

/**
 * 10. Desert Ancient Mesa Monolith (5 composite parts)
 */
export function createDesertMonolith(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'desert_monolith';

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x9a3412,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });

  // 1. Stepped altar base
  const bGeo = new THREE.BoxGeometry(4.0, 1.0, 3.0);
  const base = new THREE.Mesh(bGeo, stoneMat);
  base.position.y = 0.5;
  group.add(base);

  // 2. Left pillar column
  const p1Geo = new THREE.BoxGeometry(0.9, 4.5, 0.9);
  const p1 = new THREE.Mesh(p1Geo, stoneMat);
  p1.position.set(-1.2, 3.25, 0);
  p1.castShadow = true;
  group.add(p1);

  // 3. Right pillar column
  const p2 = new THREE.Mesh(p1Geo, stoneMat);
  p2.position.set(1.2, 3.25, 0);
  p2.castShadow = true;
  group.add(p2);

  // 4. Heavy lintel arch slab
  const lintGeo = new THREE.BoxGeometry(4.2, 1.0, 1.2);
  const lint = new THREE.Mesh(lintGeo, stoneMat);
  lint.position.set(0, 5.8, 0);
  lint.castShadow = true;
  group.add(lint);

  // 5. Ancient brass brazier
  const brazGeo = new THREE.CylinderGeometry(0.5, 0.3, 0.6, 8);
  const brazMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 1.5,
    metalness: 0.8,
  });
  const brazier = new THREE.Mesh(brazGeo, brazMat);
  brazier.position.set(0, 1.3, 0.8);
  group.add(brazier);

  group.add(createContactShadowDisc(3.2));
  return group;
}

/**
 * 11. Renewable Clean Wind Turbine (5 composite parts)
 */
export function createWindTurbine(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wind_turbine';

  // 1. Concrete Base Anchor
  const bGeo = new THREE.CylinderGeometry(1.0, 1.3, 0.5, 12);
  const bMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
  const base = new THREE.Mesh(bGeo, bMat);
  base.position.y = 0.25;
  group.add(base);

  // 2. Sleek Tapered Pylon Mast
  const mastGeo = new THREE.CylinderGeometry(0.2, 0.55, 14, 16);
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.25, metalness: 0.6 });
  const mast = new THREE.Mesh(mastGeo, whiteMat);
  mast.position.y = 7.25;
  mast.castShadow = true;
  group.add(mast);

  // 3. Aerodynamic Nacelle Motor Pod
  const podGeo = new THREE.BoxGeometry(0.8, 0.8, 2.2);
  const pod = new THREE.Mesh(podGeo, whiteMat);
  pod.position.set(0, 14.3, 0.2);
  group.add(pod);

  // 4. Rotor Spinner & 3 Aerofoil Blades
  const rotor = new THREE.Group();
  rotor.position.set(0, 14.3, 1.4);
  rotor.name = 'turbine_rotor';

  const noseGeo = new THREE.ConeGeometry(0.35, 0.8, 12);
  const nose = new THREE.Mesh(noseGeo, whiteMat);
  nose.rotation.x = Math.PI / 2;
  rotor.add(nose);

  const bladeGeo = new THREE.BoxGeometry(0.25, 6.0, 0.06);
  bladeGeo.translate(0, 3.0, 0); // pivot at base
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, whiteMat);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    blade.castShadow = true;
    rotor.add(blade);
  }
  group.add(rotor);

  // 5. Red Safety Warning Strobe
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 3 })
  );
  strobe.position.set(0, 14.8, 0);
  group.add(strobe);

  group.add(createContactShadowDisc(2.4));
  return group;
}

/**
 * 12. Stylized Street / Cyber Lamp (5 composite parts)
 */
export function createStreetLamp(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'street_lamp';

  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 });

  // 1. Base collar
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.4, 8), ironMat);
  b.position.y = 0.2;
  group.add(b);

  // 2. Vertical post
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.6, 8), ironMat);
  post.position.y = 2.2;
  post.castShadow = true;
  group.add(post);

  // 3. Curved top bracket arm
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), ironMat);
  arm.position.set(0.45, 3.9, 0);
  group.add(arm);

  // 4. Lantern head housing
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 6), ironMat);
  head.position.set(0.9, 3.8, 0);
  group.add(head);

  // 5. Glowing lamp bulb core
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfef08a,
      emissiveIntensity: 3.5,
      roughness: 0.1,
    })
  );
  bulb.position.set(0.9, 3.6, 0);
  group.add(bulb);

  group.add(createContactShadowDisc(1.2));
  return group;
}

/**
 * Standard palette items registry
 */
export const STANDARD_PALETTE: PaletteItem[] = [
  {
    id: 'pine_tree',
    name: 'Alpine Pine',
    category: 'foliage',
    icon: 'Trees',
    description: 'Stylized 3-tier coniferous evergreen pine tree',
    defaultScale: [1, 1, 1],
    badge: 'Foliage',
  },
  {
    id: 'broadleaf_tree',
    name: 'Canopy Oak',
    category: 'foliage',
    icon: 'TreePine',
    description: 'Volumetric cloud-canopy stylized deciduous tree',
    defaultScale: [1, 1, 1],
    badge: 'Foliage',
  },
  {
    id: 'cyber_skyscraper',
    name: 'Neo Cyber Tower',
    category: 'cyber',
    icon: 'Building2',
    description: 'Mega-corporate skyscraper with glowing neon edge strips and helipad',
    defaultScale: [1, 1, 1],
    badge: 'Cyber',
  },
  {
    id: 'cyber_apartment',
    name: 'Modular Highrise',
    category: 'cyber',
    icon: 'Building',
    description: 'Modular high-density apartments with HVAC roof ducting & neon signage',
    defaultScale: [1, 1, 1],
    badge: 'Cyber',
  },
  {
    id: 'stone_windmill',
    name: 'Stone Windmill',
    category: 'building',
    icon: 'Wind',
    description: 'Octagonal stone masonry base with timber body and 4 lattice sails',
    defaultScale: [1, 1, 1],
    badge: 'Medieval',
  },
  {
    id: 'island_lighthouse',
    name: 'Coastal Lighthouse',
    category: 'building',
    icon: 'Flame',
    description: 'Striped maritime navigation beacon with observation gallery and glass lantern',
    defaultScale: [1, 1, 1],
    badge: 'Island',
  },
  {
    id: 'alpine_cottage',
    name: 'Alpine Chalet',
    category: 'building',
    icon: 'Home',
    description: 'Rustic timber lodge with fieldstone base, dormers and stone chimney',
    defaultScale: [1, 1, 1],
    badge: 'Rustic',
  },
  {
    id: 'fantasy_crystal',
    name: 'Resonant Crystal',
    category: 'fantasy',
    icon: 'Gem',
    description: 'Hovering amethyst monolith surrounded by levitating shard rings',
    defaultScale: [1, 1, 1],
    badge: 'Magic',
  },
  {
    id: 'scifi_dome',
    name: 'Biosphere Dome',
    category: 'building',
    icon: 'Compass',
    description: 'Geodesic habitat dome with interior ecosystem and solar arrays',
    defaultScale: [1, 1, 1],
    badge: 'Colony',
  },
  {
    id: 'desert_monolith',
    name: 'Mesa Ruin Arch',
    category: 'prop',
    icon: 'Landmark',
    description: 'Ancient sandstone megaliths with glowing runic brazier',
    defaultScale: [1, 1, 1],
    badge: 'Ancient',
  },
  {
    id: 'wind_turbine',
    name: 'Clean Wind Turbine',
    category: 'prop',
    icon: 'Zap',
    description: 'High-efficiency 3-blade wind turbine generator',
    defaultScale: [1, 1, 1],
    badge: 'Eco',
  },
/**
 * 13. Cobblestone Path Segment (Jalan Setapak Batu - 8 composite parts)
 */
export function createCobblestonePath(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cobblestone_path';

  // Base earth foundation
  const baseGeo = new THREE.BoxGeometry(4.2, 0.15, 6.2);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x524636,
    roughness: 0.95,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.08;
  base.receiveShadow = true;
  group.add(base);

  // Varied cobblestone pavers
  const stoneMat1 = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.85 });
  const stoneMat2 = new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.8 });
  const stoneMat3 = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9 });

  const paverConfigs = [
    { x: -1.2, z: -2.0, w: 1.4, d: 1.6, h: 0.22, mat: stoneMat1 },
    { x: 0.8, z: -2.1, w: 1.6, d: 1.4, h: 0.25, mat: stoneMat2 },
    { x: -0.6, z: -0.6, w: 1.8, d: 1.3, h: 0.24, mat: stoneMat3 },
    { x: 1.1, z: -0.5, w: 1.3, d: 1.5, h: 0.22, mat: stoneMat1 },
    { x: -1.1, z: 0.9, w: 1.5, d: 1.4, h: 0.26, mat: stoneMat2 },
    { x: 0.7, z: 1.0, w: 1.7, d: 1.2, h: 0.23, mat: stoneMat3 },
    { x: -0.5, z: 2.2, w: 1.6, d: 1.3, h: 0.25, mat: stoneMat1 },
    { x: 1.0, z: 2.3, w: 1.3, d: 1.2, h: 0.22, mat: stoneMat2 },
  ];

  paverConfigs.forEach((cfg) => {
    const paverGeo = new THREE.CylinderGeometry(cfg.w * 0.5, cfg.w * 0.55, cfg.h, 7);
    paverGeo.scale(1, 1, cfg.d / cfg.w);
    const paver = new THREE.Mesh(paverGeo, cfg.mat);
    paver.position.set(cfg.x, 0.16 + cfg.h * 0.5, cfg.z);
    paver.castShadow = true;
    paver.receiveShadow = true;
    group.add(paver);
  });

  group.add(createContactShadowDisc(3.2));
  return group;
}

/**
 * 14. Wooden Boardwalk / Trail Bridge (Jalan Setapak Kayu - 9 composite parts)
 */
export function createWoodenBoardwalk(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wooden_boardwalk';

  // Support stringer beams
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
  const beamGeo = new THREE.BoxGeometry(0.3, 0.4, 6.4);
  const beamL = new THREE.Mesh(beamGeo, beamMat);
  beamL.position.set(-1.4, 0.25, 0);
  beamL.castShadow = true;
  group.add(beamL);

  const beamR = new THREE.Mesh(beamGeo, beamMat);
  beamR.position.set(1.4, 0.25, 0);
  beamR.castShadow = true;
  group.add(beamR);

  // Planks
  const plankMat1 = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  const plankMat2 = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 });
  const plankGeo = new THREE.BoxGeometry(3.4, 0.18, 0.8);

  for (let i = -3; i <= 3; i++) {
    const plank = new THREE.Mesh(plankGeo, i % 2 === 0 ? plankMat1 : plankMat2);
    plank.position.set(0, 0.48, i * 0.9);
    plank.rotation.y = (Math.sin(i * 3.7) * 0.04);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  // Corner trail posts
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3f1d0b, roughness: 0.9 });
  const postGeo = new THREE.CylinderGeometry(0.12, 0.15, 1.6, 6);
  const postPositions = [
    [-1.5, 0.8, -2.8],
    [1.5, 0.8, -2.8],
    [-1.5, 0.8, 2.8],
    [1.5, 0.8, 2.8],
  ];

  postPositions.forEach(([x, y, z]) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, y, z);
    post.castShadow = true;
    group.add(post);
  });

  group.add(createContactShadowDisc(2.8));
  return group;
}

/**
 * 15. Stepping Stones (Batu Pijakan Setapak - 6 composite parts)
 */
export function createSteppingStones(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stepping_stones';

  const stoneMatA = new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.8 });
  const stoneMatB = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.85 });

  const stones = [
    { x: -0.6, z: -1.8, r: 0.65, h: 0.18, mat: stoneMatA },
    { x: 0.5, z: -0.9, r: 0.75, h: 0.20, mat: stoneMatB },
    { x: -0.4, z: 0.1, r: 0.70, h: 0.19, mat: stoneMatA },
    { x: 0.6, z: 1.1, r: 0.80, h: 0.22, mat: stoneMatB },
    { x: -0.3, z: 2.0, r: 0.65, h: 0.17, mat: stoneMatA },
  ];

  stones.forEach((s) => {
    const geo = new THREE.CylinderGeometry(s.r, s.r * 1.08, s.h, 7);
    const mesh = new THREE.Mesh(geo, s.mat);
    mesh.position.set(s.x, s.h * 0.5 + 0.04, s.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  group.add(createContactShadowDisc(2.2));
  return group;
}

/**
 * 16. Trail Signpost & Lantern (Plang Jalan Setapak - 7 composite parts)
 */
export function createTrailSignpost(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'trail_signpost';

  // Cairn rock base
  const cairnMat = new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.9 });
  const cairnGeo = new THREE.DodecahedronGeometry(0.75);
  const cairn = new THREE.Mesh(cairnGeo, cairnMat);
  cairn.position.y = 0.45;
  cairn.castShadow = true;
  group.add(cairn);

  // Main wooden post
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 3.8, 6);
  const post = new THREE.Mesh(postGeo, woodMat);
  post.position.y = 2.1;
  post.castShadow = true;
  group.add(post);

  // Directional signboards
  const signMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.75 });
  const signGeo = new THREE.BoxGeometry(1.6, 0.35, 0.12);

  const sign1 = new THREE.Mesh(signGeo, signMat);
  sign1.position.set(0.65, 3.2, 0);
  sign1.rotation.y = 0.35;
  sign1.castShadow = true;
  group.add(sign1);

  const sign2 = new THREE.Mesh(signGeo, signMat);
  sign2.position.set(-0.65, 2.7, 0);
  sign2.rotation.y = -0.5;
  sign2.castShadow = true;
  group.add(sign2);

  // Hanging lantern
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.3 });
  const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9);
  armGeo.rotateZ(Math.PI / 3);
  const arm = new THREE.Mesh(armGeo, ironMat);
  arm.position.set(0.4, 3.6, 0);
  group.add(arm);

  const lampGeo = new THREE.OctahedronGeometry(0.28);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.8,
  });
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.set(0.75, 3.4, 0);
  group.add(lamp);

  group.add(createContactShadowDisc(1.8));
  return group;
}

export const STANDARD_PALETTE: PaletteItem[] = [
  {
    id: 'pine_tree',
    name: 'Alpine Pine',
    category: 'foliage',
    icon: 'TreePine',
    description: 'Stylized evergreen conifer with snow-dusted foliage tiers and trunk',
    defaultScale: [1, 1, 1],
    badge: 'Nature',
  },
  {
    id: 'broadleaf_tree',
    name: 'Canopy Oak',
    category: 'foliage',
    icon: 'Trees',
    description: 'Stylized shade tree with multi-cluster spherical canopy and curved trunk',
    defaultScale: [1, 1, 1],
    badge: 'Nature',
  },
  {
    id: 'cobblestone_path',
    name: 'Cobblestone Trail',
    category: 'path',
    icon: 'Compass',
    description: 'Curved stone paver walkway with rustic mortar and varied slabs',
    defaultScale: [1, 1, 1],
    badge: 'Path',
  },
  {
    id: 'wooden_boardwalk',
    name: 'Wooden Boardwalk',
    category: 'path',
    icon: 'Landmark',
    description: 'Elevated timber bridge walkway with rustic planks and pilot posts',
    defaultScale: [1, 1, 1],
    badge: 'Path',
  },
  {
    id: 'stepping_stones',
    name: 'Stepping Stones',
    category: 'path',
    icon: 'Gem',
    description: 'Cluster of natural slate stepping stones embedded in the soil',
    defaultScale: [1, 1, 1],
    badge: 'Path',
  },
  {
    id: 'trail_signpost',
    name: 'Trail Signpost',
    category: 'path',
    icon: 'Compass',
    description: 'Wooden direction post with orientation signs and warm lantern',
    defaultScale: [1, 1, 1],
    badge: 'Path',
  },
  {
    id: 'cyber_skyscraper',
    name: 'Neo Cyber Tower',
    category: 'cyber',
    icon: 'Building2',
    description: 'Multi-tiered futuristic highrise with emissive holo-bands and comms mast',
    defaultScale: [1, 1, 1],
    badge: 'Cyber',
  },
  {
    id: 'cyber_apartment',
    name: 'Modular Highrise',
    category: 'cyber',
    icon: 'Building',
    description: 'Staggered residential complex with cantilevered neon pods and helipad',
    defaultScale: [1, 1, 1],
    badge: 'Cyber',
  },
  {
    id: 'stone_windmill',
    name: 'Stone Windmill',
    category: 'building',
    icon: 'Wind',
    description: 'Historic fieldstone mill with conical roof and rotating 4-blade lattice',
    defaultScale: [1, 1, 1],
    badge: 'Animated',
  },
  {
    id: 'island_lighthouse',
    name: 'Coastal Lighthouse',
    category: 'building',
    icon: 'Flame',
    description: 'Striped maritime beacon with observation deck and rotating beam',
    defaultScale: [1, 1, 1],
    badge: 'Maritime',
  },
  {
    id: 'alpine_cottage',
    name: 'Alpine Chalet',
    category: 'building',
    icon: 'Home',
    description: 'Rustic timber lodge with fieldstone base, dormers and stone chimney',
    defaultScale: [1, 1, 1],
    badge: 'Rustic',
  },
  {
    id: 'fantasy_crystal',
    name: 'Resonant Crystal',
    category: 'fantasy',
    icon: 'Gem',
    description: 'Hovering amethyst monolith surrounded by levitating shard rings',
    defaultScale: [1, 1, 1],
    badge: 'Magic',
  },
  {
    id: 'scifi_dome',
    name: 'Biosphere Dome',
    category: 'building',
    icon: 'Compass',
    description: 'Geodesic habitat dome with interior ecosystem and solar arrays',
    defaultScale: [1, 1, 1],
    badge: 'Colony',
  },
  {
    id: 'desert_monolith',
    name: 'Mesa Ruin Arch',
    category: 'prop',
    icon: 'Landmark',
    description: 'Ancient sandstone megaliths with glowing runic brazier',
    defaultScale: [1, 1, 1],
    badge: 'Ancient',
  },
  {
    id: 'wind_turbine',
    name: 'Clean Wind Turbine',
    category: 'prop',
    icon: 'Zap',
    description: 'High-efficiency 3-blade wind turbine generator',
    defaultScale: [1, 1, 1],
    badge: 'Eco',
  },
  {
    id: 'street_lamp',
    name: 'Street Lantern',
    category: 'prop',
    icon: 'Lightbulb',
    description: 'Cast-iron decorative lamppost with warm lighting core',
    defaultScale: [1, 1, 1],
    badge: 'Urban',
  },
];

/**
 * Factory dispatcher to build cloned instance for any model type
 */
export function instantiateModel(type: string): THREE.Group {
  switch (type) {
    case 'cobblestone_path':
      return createCobblestonePath();
    case 'wooden_boardwalk':
      return createWoodenBoardwalk();
    case 'stepping_stones':
      return createSteppingStones();
    case 'trail_signpost':
      return createTrailSignpost();
    case 'cyber_skyscraper':
      return createCyberSkyscraper();
    case 'cyber_apartment':
      return createCyberApartment();
    case 'pine_tree':
      return createPineTree();
    case 'broadleaf_tree':
      return createBroadleafTree();
    case 'stone_windmill':
      return createStoneWindmill();
    case 'island_lighthouse':
      return createIslandLighthouse();
    case 'alpine_cottage':
      return createAlpineCottage();
    case 'fantasy_crystal':
      return createFantasyCrystal();
    case 'scifi_dome':
      return createSciFiDome();
    case 'desert_monolith':
      return createDesertMonolith();
    case 'wind_turbine':
      return createWindTurbine();
    case 'street_lamp':
      return createStreetLamp();
    default:
      // Fallback stylized composite prop
      return createPineTree();
  }
}
