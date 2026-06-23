import type { LatLng, Hotspot } from '../types';

export function distanceMi(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nearestHotspot(loc: LatLng, hotspots: Hotspot[]): Hotspot {
  return hotspots.reduce((best, h) =>
    distanceMi(loc, h.location) < distanceMi(loc, best.location) ? h : best
  );
}
