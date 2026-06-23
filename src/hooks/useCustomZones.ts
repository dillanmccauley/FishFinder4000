import { useState } from 'react';
import type { Hotspot } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { nearestHotspot } from '../utils/geo';

function nearestTideStation(loc: { lat: number; lng: number }): string {
  return nearestHotspot(loc, HOTSPOTS).tideStationId;
}

const STORAGE_KEY = 'fishfinder-custom-zones';

function load(): Hotspot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(zones: Hotspot[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(zones)); } catch {}
}

export interface NewZoneParams {
  location: { lat: number; lng: number };
  name: string;
  type: Hotspot['type'];
  activeSpeciesIds: string[];
  notes: string;
  depthRangeFt?: [number, number];
}

export function useCustomZones() {
  const [customZones, setCustomZones] = useState<Hotspot[]>(load);

  function addZone(params: NewZoneParams): Hotspot {
    const zone: Hotspot = {
      id: `custom-${Date.now()}`,
      name: params.name,
      type: params.type,
      location: params.location,
      tideStationId: nearestTideStation(params.location),
      activeSpeciesIds: params.activeSpeciesIds,
      notes: params.notes,
      depthRangeFt: params.depthRangeFt,
    };
    const next = [...customZones, zone];
    setCustomZones(next);
    save(next);
    return zone;
  }

  function removeZone(id: string) {
    const next = customZones.filter(z => z.id !== id);
    setCustomZones(next);
    save(next);
  }

  return { customZones, addZone, removeZone };
}
