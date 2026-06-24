import { useState, useEffect, useCallback } from 'react';
import type { BBox } from '../types';

export interface SatSSTResult {
  getSatSSTAt: (lat: number, lng: number) => number | null;
  loading: boolean;
}

export function useSatSST(bbox: BBox | null): SatSSTResult {
  const [sstMap, setSstMap] = useState<Map<string, number>>(() => new Map());
  const [loading, setLoading] = useState(false);

  const swLat = bbox?.sw.lat;
  const swLng = bbox?.sw.lng;
  const neLat = bbox?.ne.lat;
  const neLng = bbox?.ne.lng;

  useEffect(() => {
    if (swLat == null || swLng == null || neLat == null || neLng == null) {
      setSstMap(new Map());
      return;
    }

    setLoading(true);
    let cancelled = false;

    // VIIRS near-real-time composite — (last) selects the most recent available time
    const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNSQnrtSST.json?sst[(last)][(${swLat}):(${neLat})][(${swLng}):(${neLng})]`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const colNames: string[] = data.table?.columnNames ?? [];
        const latIdx = colNames.indexOf('latitude');
        const lngIdx = colNames.indexOf('longitude');
        const sstIdx = colNames.indexOf('sst');
        if (latIdx < 0 || lngIdx < 0 || sstIdx < 0) throw new Error('unexpected columns');

        const rows: (number | null)[][] = data.table?.rows ?? [];
        const newMap = new Map<string, number>();

        rows.forEach(row => {
          const lat = row[latIdx] as number;
          const lng = row[lngIdx] as number;
          const sst = row[sstIdx];
          if (lat == null || lng == null || sst == null) return;
          const val = sst as number;
          if (isNaN(val) || val < -5 || val > 50) return; // filter fill/cloud values
          newMap.set(`${lat.toFixed(4)},${lng.toFixed(4)}`, val);
        });

        setSstMap(newMap);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Graceful degradation: no satellite SST, fall through to Open-Meteo SST
        setSstMap(new Map());
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [swLat, swLng, neLat, neLng]);

  const getSatSSTAt = useCallback((lat: number, lng: number): number | null => {
    if (sstMap.size === 0) return null;

    // Exact match first (satellite res ~0.01°, scoring grid 0.02°)
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const exact = sstMap.get(key);
    if (exact !== undefined) return exact;

    // Nearest neighbor within 0.1° (~11km) for cloud-gap infilling
    let bestDist = 0.01; // threshold: 0.1° squared
    let bestVal: number | null = null;
    sstMap.forEach((val, k) => {
      const comma = k.indexOf(',');
      const kLat = parseFloat(k.slice(0, comma));
      const kLng = parseFloat(k.slice(comma + 1));
      const dist = (kLat - lat) ** 2 + (kLng - lng) ** 2;
      if (dist < bestDist) { bestDist = dist; bestVal = val; }
    });
    return bestVal;
  }, [sstMap]);

  return { getSatSSTAt, loading };
}
