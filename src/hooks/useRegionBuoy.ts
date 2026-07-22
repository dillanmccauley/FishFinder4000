import { useState, useEffect } from 'react';
import type { FishingRegion } from '../data/regions';
import { distanceMi } from '../utils/geo';

/**
 * Auto-discovers the nearest reporting NDBC/CORMP buoys for a region via
 * CoastWatch ERDDAP (the NDBC site itself has no CORS headers; ERDDAP mirrors
 * all NDBC met data with station coordinates). One padded-bbox query, then the
 * nearest station with a valid water temp and the nearest with valid waves.
 * Measured inshore water temp beats modeled SST by a wide margin.
 */
export interface RegionBuoyData {
  waterTempF: number | null;
  /** Station id the temp came from, e.g. "41024" */
  tempStation: string | null;
  waveHeightFt: number | null;
  asOf: Date | null;
  loading: boolean;
}

const BBOX_PAD_DEG = 0.35; // ~25 mi — buoys are sparse; cast a wide net

const cache = new Map<string, Omit<RegionBuoyData, 'loading'>>();

const EMPTY: RegionBuoyData = { waterTempF: null, tempStation: null, waveHeightFt: null, asOf: null, loading: false };

function buildUrl(region: FishingRegion): string {
  const { sw, ne } = region.bbox;
  const lat0 = sw.lat - BBOX_PAD_DEG;
  const lat1 = ne.lat + BBOX_PAD_DEG;
  const lng0 = sw.lng - BBOX_PAD_DEG;
  const lng1 = ne.lng + BBOX_PAD_DEG;
  return (
    'https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.json' +
    `?station%2Ctime%2Clatitude%2Clongitude%2Cwtmp%2Cwvht` +
    `&time%3E=now-2days` +
    `&latitude%3E=${lat0}&latitude%3C=${lat1}` +
    `&longitude%3E=${lng0}&longitude%3C=${lng1}`
  );
}

async function fetchBuoys(region: FishingRegion): Promise<Omit<RegionBuoyData, 'loading'>> {
  const res = await fetch(buildUrl(region));
  const json = await res.json();
  const cols: string[] = json.table?.columnNames ?? [];
  const iStation = cols.indexOf('station');
  const iTime = cols.indexOf('time');
  const iLat = cols.indexOf('latitude');
  const iLng = cols.indexOf('longitude');
  const iWtmp = cols.indexOf('wtmp');
  const iWvht = cols.indexOf('wvht');
  const rows: (string | number | null)[][] = json.table?.rows ?? [];

  // Latest valid reading per station (rows are time-ordered per station)
  interface StationReading { lat: number; lng: number; wtmpC: number | null; wvhtM: number | null; time: Date | null }
  const stations = new Map<string, StationReading>();
  rows.forEach(row => {
    const id = String(row[iStation] ?? '');
    if (!id) return;
    const lat = typeof row[iLat] === 'number' ? (row[iLat] as number) : null;
    const lng = typeof row[iLng] === 'number' ? (row[iLng] as number) : null;
    if (lat == null || lng == null) return;
    const entry = stations.get(id) ?? { lat, lng, wtmpC: null, wvhtM: null, time: null };
    const wtmp = typeof row[iWtmp] === 'number' ? (row[iWtmp] as number) : null;
    const wvht = typeof row[iWvht] === 'number' ? (row[iWvht] as number) : null;
    if (wtmp != null && wtmp > -5 && wtmp < 40) {
      entry.wtmpC = wtmp;
      entry.time = row[iTime] ? new Date(String(row[iTime])) : entry.time;
    }
    if (wvht != null && wvht >= 0 && wvht < 20) entry.wvhtM = wvht;
    stations.set(id, entry);
  });

  let tempStation: string | null = null;
  let tempC: number | null = null;
  let tempTime: Date | null = null;
  let tempDist = Infinity;
  let waveM: number | null = null;
  let waveDist = Infinity;

  stations.forEach((s, id) => {
    const d = distanceMi(region.center, { lat: s.lat, lng: s.lng });
    if (s.wtmpC != null && d < tempDist) {
      tempDist = d;
      tempStation = id;
      tempC = s.wtmpC;
      tempTime = s.time;
    }
    if (s.wvhtM != null && d < waveDist) {
      waveDist = d;
      waveM = s.wvhtM;
    }
  });

  return {
    waterTempF: tempC != null ? (tempC as number) * 9 / 5 + 32 : null,
    tempStation,
    waveHeightFt: waveM != null ? (waveM as number) * 3.28084 : null,
    asOf: tempTime,
  };
}

export function useRegionBuoy(region: FishingRegion | null): RegionBuoyData {
  const [data, setData] = useState<RegionBuoyData>(EMPTY);

  useEffect(() => {
    if (!region) {
      setData(EMPTY);
      return;
    }
    const cached = cache.get(region.id);
    if (cached) {
      setData({ ...cached, loading: false });
      return;
    }
    let cancelled = false;
    setData({ ...EMPTY, loading: true });

    fetchBuoys(region)
      .then(result => {
        cache.set(region.id, result);
        if (!cancelled) setData({ ...result, loading: false });
      })
      .catch(() => {
        if (!cancelled) setData(EMPTY);
      });

    return () => { cancelled = true; };
  }, [region]);

  return data;
}
