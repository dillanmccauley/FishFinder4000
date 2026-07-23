import { useState, useEffect } from 'react';
import type { LatLng } from '../types';
import type { TideStation } from '../data/regions';
import { distanceMi } from '../utils/geo';

/**
 * Lazy index of every US CO-OPS tide-prediction station (~thousands, with
 * lat/lng/name) from the CO-OPS Metadata API. Fetched once per session, only
 * when the Local Mode menu opens — powers dynamic "fish this area" regions.
 */
const MDAPI_URL =
  'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions';

let cached: TideStation[] | null = null;
let inflight: Promise<TideStation[]> | null = null;

async function fetchStations(): Promise<TideStation[]> {
  const res = await fetch(MDAPI_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const raw: { id?: string; name?: string; lat?: number; lng?: number }[] = json.stations ?? [];
  return raw
    .filter(s => s.id && s.name && typeof s.lat === 'number' && typeof s.lng === 'number')
    .map(s => ({ id: String(s.id), name: String(s.name), lat: s.lat as number, lng: s.lng as number }));
}

export function nearestTideStation(stations: TideStation[], loc: LatLng): TideStation | null {
  let best: TideStation | null = null;
  let bestMi = Infinity;
  for (const s of stations) {
    const d = distanceMi(loc, { lat: s.lat, lng: s.lng });
    if (d < bestMi) { bestMi = d; best = s; }
  }
  return best;
}

export function useTideStations(enabled: boolean): { stations: TideStation[]; loading: boolean } {
  const [stations, setStations] = useState<TideStation[]>(cached ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || cached) return;
    let cancelled = false;
    setLoading(true);

    if (!inflight) inflight = fetchStations();
    inflight
      .then(list => {
        cached = list;
        if (!cancelled) { setStations(list); setLoading(false); }
      })
      .catch(() => {
        inflight = null;
        if (!cancelled) { setStations([]); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [enabled]);

  return { stations, loading };
}
