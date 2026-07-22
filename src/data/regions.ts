import type { BBox, LatLng } from '../types';

/**
 * Config-driven "Local mode" regions. Every data source used by the local
 * pipeline is national (NCEI DEM mosaics, NOAA reefs, CO-OPS tides, ERDDAP
 * NDBC buoys, Open-Meteo), so adding a region is a config block: box, tide
 * station, inlets, species list, and an ocean/inside divider polyline.
 */
export interface FishingRegion {
  id: string;
  name: string;
  bbox: BBox;
  center: LatLng;
  /** Initial flyTo zoom when the region activates */
  zoom: number;
  /** NOAA CO-OPS tide (prediction) station for the region */
  tideStationId: string;
  tideStationName: string;
  inlets: { name: string; loc: LatLng }[];
  speciesIds: string[];
  /**
   * Polyline (ordered west→east) splitting the open-ocean side (south of the
   * line) from inside/ICW waters. Omit → no zone masking.
   */
  oceanDivider?: LatLng[];
  /** DEM export size; defaults keep ~15–20 m cells and a few MB in memory */
  demSize?: { width: number; height: number };
}

export type RegionZone = 'icw' | 'nearshore' | 'both';

export interface RegionSpeciesProfile {
  speciesId: string;
  /** Where this species is primarily targeted */
  zone: RegionZone;
  /** Affinity 0–1 for each discovered structure kind — matches spots to species */
  structureAffinity: { hole: number; ledge: number; reef: number };
  /** Local tactic one-liner shown in the species card */
  tactic: string;
}

/** Coastal NC species set — used by both current regions */
const NC_SPECIES_IDS = [
  'red-drum',
  'spotted-seatrout',
  'flounder',
  'sheepshead',
  'black-drum',
  'spanish-mackerel',
  'bluefish',
  'pompano',
  'whiting',
];

export const REGIONS: FishingRegion[] = [
  {
    id: 'oib',
    name: 'Ocean Isle Beach',
    bbox: {
      sw: { lat: 33.85, lng: -78.52 },
      ne: { lat: 33.96, lng: -78.3 },
    },
    center: { lat: 33.894, lng: -78.427 },
    zoom: 12,
    tideStationId: '8659665',
    tideStationName: 'Shallotte Inlet',
    inlets: [
      { name: 'Shallotte Inlet', loc: { lat: 33.8955, lng: -78.3705 } },
      { name: 'Tubbs Inlet', loc: { lat: 33.8905, lng: -78.5075 } },
    ],
    speciesIds: NC_SPECIES_IDS,
    // Barrier-island axis: Tubbs → Shallotte
    oceanDivider: [
      { lat: 33.8905, lng: -78.5075 },
      { lat: 33.8955, lng: -78.3705 },
    ],
    demSize: { width: 1400, height: 768 },
  },
  {
    id: 'wilmington',
    name: 'Wilmington / Wrightsville',
    bbox: {
      sw: { lat: 33.95, lng: -77.98 },
      ne: { lat: 34.24, lng: -77.72 },
    },
    center: { lat: 34.1, lng: -77.86 },
    zoom: 12,
    tideStationId: '8658163',
    tideStationName: 'Wrightsville Beach',
    inlets: [
      { name: 'Rich Inlet', loc: { lat: 34.2905, lng: -77.7615 } },
      { name: 'Mason Inlet', loc: { lat: 34.2415, lng: -77.7715 } },
      { name: 'Masonboro Inlet', loc: { lat: 34.1815, lng: -77.8115 } },
      { name: 'Carolina Beach Inlet', loc: { lat: 34.0705, lng: -77.8785 } },
    ],
    speciesIds: NC_SPECIES_IDS,
    // Barrier-island axis: Figure Eight → Wrightsville → Masonboro → Carolina Beach
    oceanDivider: [
      { lat: 34.055, lng: -77.885 },
      { lat: 34.181, lng: -77.812 },
      { lat: 34.24, lng: -77.771 },
    ],
    // Taller box than OIB — ~20 m cells keeps memory in the same ballpark
    demSize: { width: 1200, height: 1400 },
  },
];

export const REGIONS_BY_ID = new Map(REGIONS.map(r => [r.id, r]));

/** Species-level profiles shared across regions (NC coastal behavior) */
export const SPECIES_PROFILES: Record<string, RegionSpeciesProfile> = {
  'red-drum': {
    speciesId: 'red-drum',
    zone: 'both',
    structureAffinity: { hole: 0.7, ledge: 0.8, reef: 0.5 },
    tactic: 'Oyster edges and creek mouths on the last 2h of the rise — gold spoon or cut mullet',
  },
  'spotted-seatrout': {
    speciesId: 'spotted-seatrout',
    zone: 'icw',
    structureAffinity: { hole: 0.9, ledge: 0.8, reef: 0.3 },
    tactic: 'Work deep ICW holes with soft plastics on the outgoing tide; topwater at first light',
  },
  flounder: {
    speciesId: 'flounder',
    zone: 'both',
    structureAffinity: { hole: 0.6, ledge: 0.9, reef: 0.7 },
    tactic: 'Drag Gulp! along channel drop-offs with the current — slow is everything',
  },
  sheepshead: {
    speciesId: 'sheepshead',
    zone: 'icw',
    structureAffinity: { hole: 0.3, ledge: 0.4, reef: 0.9 },
    tactic: 'Fiddler crabs tight to bridge and dock pilings; set on the faintest tick',
  },
  'black-drum': {
    speciesId: 'black-drum',
    zone: 'icw',
    structureAffinity: { hole: 0.7, ledge: 0.5, reef: 0.4 },
    tactic: 'Fresh shrimp on bottom near oyster bars — they feed by smell, murky water is fine',
  },
  'spanish-mackerel': {
    speciesId: 'spanish-mackerel',
    zone: 'nearshore',
    structureAffinity: { hole: 0.2, ledge: 0.5, reef: 0.6 },
    tactic: 'Troll Clark spoons just off the beach; watch for birds working bait schools',
  },
  bluefish: {
    speciesId: 'bluefish',
    zone: 'both',
    structureAffinity: { hole: 0.4, ledge: 0.6, reef: 0.5 },
    tactic: 'Anything shiny retrieved fast through moving inlet water; wire leader saves lures',
  },
  pompano: {
    speciesId: 'pompano',
    zone: 'nearshore',
    structureAffinity: { hole: 0.5, ledge: 0.7, reef: 0.2 },
    tactic: 'Sand fleas in the surf sloughs on the incoming tide',
  },
  whiting: {
    speciesId: 'whiting',
    zone: 'both',
    structureAffinity: { hole: 0.6, ledge: 0.6, reef: 0.2 },
    tactic: 'Small pieces of fresh shrimp on bottom just beyond the shore break',
  },
};
