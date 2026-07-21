import type { BBox, LatLng } from '../types';

/**
 * Ocean Isle Beach, NC — hyper-local configuration.
 * Covers Tubbs Inlet through Shallotte Inlet, the ICW behind the island,
 * the Shallotte River mouth, and nearshore ocean out ~4 miles.
 */
export const OIB_BBOX: BBox = {
  sw: { lat: 33.85, lng: -78.52 },
  ne: { lat: 33.96, lng: -78.3 },
};

export const OIB_CENTER: LatLng = { lat: 33.894, lng: -78.427 };

/** NOAA CO-OPS subordinate tide station — Shallotte Inlet (Bowen Point), east end of OIB */
export const OIB_TIDE_STATION = '8659665';

/** CORMP buoy 5 mi off Sunset Beach — measured water temp (~1 m depth) */
export const OIB_TEMP_BUOY = '41024';
/** CORMP companion wave buoy */
export const OIB_WAVE_BUOY = '41119';

export const OIB_INLETS: { name: string; loc: LatLng }[] = [
  { name: 'Shallotte Inlet', loc: { lat: 33.8955, lng: -78.3705 } },
  { name: 'Tubbs Inlet', loc: { lat: 33.8905, lng: -78.5075 } },
];

/** Species that actually live at Ocean Isle Beach (33.9°N — no snook, no tarpon runs) */
export const OIB_SPECIES_IDS = [
  'red-drum',
  'spotted-seatrout',
  'flounder',
  'sheepshead',
  'black-drum',
  'spanish-mackerel',
  'bluefish',
  'pompano',
  'whiting',
] as const;

export type OIBZone = 'icw' | 'nearshore' | 'both';

export interface OIBSpeciesProfile {
  speciesId: string;
  /** Where this species is primarily targeted around OIB */
  zone: OIBZone;
  /** Affinity 0–1 for each discovered structure kind — used to match spots to species */
  structureAffinity: { hole: number; ledge: number; reef: number };
  /** Local tactic one-liner shown in the species card */
  tactic: string;
}

export const OIB_PROFILES: Record<string, OIBSpeciesProfile> = {
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
