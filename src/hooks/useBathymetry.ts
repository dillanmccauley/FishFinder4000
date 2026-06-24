import { useState, useEffect, useCallback } from 'react';
import type { BBox } from '../types';

type CellClass = 'land' | 'too-shallow' | 'fishable' | 'deep';

export interface BathymetryResult {
  getDepthAt: (lat: number, lng: number) => number | null;
  classifyCell: (lat: number, lng: number) => CellClass | null;
  loading: boolean;
}

export function useBathymetry(bbox: BBox | null): BathymetryResult {
  const [depthMap, setDepthMap] = useState<Map<string, number>>(() => new Map());
  const [sortedLats, setSortedLats] = useState<number[]>([]);
  const [sortedLngs, setSortedLngs] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const swLat = bbox?.sw.lat;
  const swLng = bbox?.sw.lng;
  const neLat = bbox?.ne.lat;
  const neLng = bbox?.ne.lng;

  useEffect(() => {
    if (swLat == null || swLng == null || neLat == null || neLng == null) {
      setDepthMap(new Map());
      setSortedLats([]);
      setSortedLngs([]);
      return;
    }

    setLoading(true);
    let cancelled = false;

    // etopo360 uses 0-360 longitude convention
    const lngMin = swLng < 0 ? swLng + 360 : swLng;
    const lngMax = neLng < 0 ? neLng + 360 : neLng;
    const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo360.json?altitude[(${swLat}):(${neLat})][(${lngMin}):(${lngMax})]`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const colNames: string[] = data.table?.columnNames ?? [];
        const latIdx = colNames.indexOf('latitude');
        const lngIdx = colNames.indexOf('longitude');
        const altIdx = colNames.indexOf('altitude');
        if (latIdx < 0 || lngIdx < 0 || altIdx < 0) throw new Error('unexpected columns');

        const rows: (number | null)[][] = data.table?.rows ?? [];
        const newMap = new Map<string, number>();
        const latSet = new Set<number>();
        const lngSet = new Set<number>();

        rows.forEach(row => {
          const lat = row[latIdx] as number;
          let lng = row[lngIdx] as number;
          const alt = row[altIdx];
          if (lat == null || lng == null || alt == null) return;
          // Convert 0-360 back to -180/180
          if (lng > 180) lng -= 360;
          const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
          newMap.set(key, alt as number);
          latSet.add(parseFloat(lat.toFixed(4)));
          lngSet.add(parseFloat(lng.toFixed(4)));
        });

        setDepthMap(newMap);
        setSortedLats([...latSet].sort((a, b) => a - b));
        setSortedLngs([...lngSet].sort((a, b) => a - b));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Graceful degradation: no bathymetry data, treat all as fishable
        setDepthMap(new Map());
        setSortedLats([]);
        setSortedLngs([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [swLat, swLng, neLat, neLng]);

  const getDepthAt = useCallback((lat: number, lng: number): number | null => {
    if (sortedLats.length < 2 || sortedLngs.length < 2) return null;

    let latLo = -1, lngLo = -1;
    for (let i = 0; i < sortedLats.length - 1; i++) {
      if (lat >= sortedLats[i] && lat <= sortedLats[i + 1]) { latLo = i; break; }
    }
    for (let j = 0; j < sortedLngs.length - 1; j++) {
      if (lng >= sortedLngs[j] && lng <= sortedLngs[j + 1]) { lngLo = j; break; }
    }
    if (latLo < 0 || lngLo < 0) return null;

    const la = sortedLats[latLo], lb = sortedLats[latLo + 1];
    const ga = sortedLngs[lngLo], gb = sortedLngs[lngLo + 1];
    const q11 = depthMap.get(`${la.toFixed(4)},${ga.toFixed(4)}`);
    const q12 = depthMap.get(`${la.toFixed(4)},${gb.toFixed(4)}`);
    const q21 = depthMap.get(`${lb.toFixed(4)},${ga.toFixed(4)}`);
    const q22 = depthMap.get(`${lb.toFixed(4)},${gb.toFixed(4)}`);
    if (q11 == null || q12 == null || q21 == null || q22 == null) return null;

    const tx = lb === la ? 0 : (lat - la) / (lb - la);
    const ty = gb === ga ? 0 : (lng - ga) / (gb - ga);
    return q11 * (1 - tx) * (1 - ty) + q12 * (1 - tx) * ty + q21 * tx * (1 - ty) + q22 * tx * ty;
  }, [depthMap, sortedLats, sortedLngs]);

  const classifyCell = useCallback((lat: number, lng: number): CellClass | null => {
    const d = getDepthAt(lat, lng);
    if (d === null) return null;
    if (d > 0) return 'land';
    if (d > -1) return 'too-shallow';
    if (d >= -300) return 'fishable';
    return 'deep';
  }, [getDepthAt]);

  return { getDepthAt, classifyCell, loading };
}
