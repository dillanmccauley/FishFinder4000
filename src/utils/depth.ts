import type { Species } from '../types';

export type DepthZone = 'tidal-flat' | 'inshore' | 'nearshore' | 'shelf' | 'outer-shelf' | 'deep';

export interface DepthZoneInfo {
  label: string;
  description: string;
  rangeLabel: string;
  color: string;
  icon: string;
  typicalFish: string;
}

export const DEPTH_ZONES: Record<DepthZone, DepthZoneInfo> = {
  'tidal-flat': {
    label: 'Tidal Flat',
    description: 'Wading depth — perfect for sight-casting to tailing fish',
    rangeLabel: '0–5 ft',
    color: '#86efac',
    icon: '🦶',
    typicalFish: 'Red Drum, Spotted Seatrout, Flounder',
  },
  inshore: {
    label: 'Inshore',
    description: 'Protected bays, lagoons, estuaries & tidal creeks',
    rangeLabel: '5–30 ft',
    color: '#34d399',
    icon: '🛶',
    typicalFish: 'Snook, Red Drum, Tarpon, Sheepshead, Weakfish, Black Drum',
  },
  nearshore: {
    label: 'Nearshore',
    description: 'Piers, jetties, inlet channels & nearshore reefs',
    rangeLabel: '30–100 ft',
    color: '#22d3ee',
    icon: '⚓',
    typicalFish: 'Striped Bass, Bluefish, Spanish Mackerel, Flounder, Tautog',
  },
  shelf: {
    label: 'Inner Shelf',
    description: 'Continental shelf — offshore structure, reefs & wrecks',
    rangeLabel: '100–300 ft',
    color: '#60a5fa',
    icon: '🚢',
    typicalFish: 'Black Sea Bass, Tautog, Bluefish, Flounder, Striped Bass',
  },
  'outer-shelf': {
    label: 'Outer Shelf',
    description: 'Shelf edge & ledges — where pelagics run',
    rangeLabel: '300–600 ft',
    color: '#818cf8',
    icon: '🐟',
    typicalFish: 'Mahi-Mahi, Wahoo, Tuna, Grouper, Amberjack',
  },
  deep: {
    label: 'Deep Water',
    description: 'Canyon edges, blue-water & deep structure',
    rangeLabel: '600+ ft',
    color: '#a78bfa',
    icon: '🌊',
    typicalFish: 'Tilefish, Grouper, Swordfish, Deep-water Snapper',
  },
};

export function classifyDepth(minFt: number, maxFt: number): DepthZone {
  const midFt = (minFt + maxFt) / 2;
  if (midFt <= 5) return 'tidal-flat';
  if (midFt <= 30) return 'inshore';
  if (midFt <= 100) return 'nearshore';
  if (midFt <= 300) return 'shelf';
  if (midFt <= 600) return 'outer-shelf';
  return 'deep';
}

export function speciesMatchDepth(species: Species, depthMin: number, depthMax: number): boolean {
  return depthMin <= species.depthRangeFt[1] && depthMax >= species.depthRangeFt[0];
}
