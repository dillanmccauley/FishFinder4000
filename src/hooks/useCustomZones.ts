import { useState } from 'react';
import type { Hotspot } from '../types';
import { HOTSPOTS } from '../data/hotspots';

function distanceMi(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearestTideStation(loc: { lat: number; lng: number }): string {
  return HOTSPOTS.reduce((best, h) =>
    distanceMi(loc, h.location) < distanceMi(loc, best.location) ? h : best
  ).tideStationId;
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
