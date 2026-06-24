import { useState, useEffect, useCallback } from 'react';
import type { BBox } from '../types';
import { distanceMi } from '../utils/geo';

type StructureType = 'reef' | 'wreck' | 'obstruction';

interface StructureFeature {
  lat: number;
  lng: number;
  type: StructureType;
}

export interface MarineStructureResult {
  getStructureBonusAt: (lat: number, lng: number) => number;
  loading: boolean;
}

const NM_TO_MILES = 1.15078;

// ENC Online layer IDs
const LAYER_CONFIG: { layer: number; type: StructureType }[] = [
  { layer: 6, type: 'reef' },        // UWTROC — underwater rocks / natural reefs
  { layer: 7, type: 'obstruction' }, // OBSTRN — obstructions / artificial reefs
  { layer: 8, type: 'wreck' },       // WRECKS
];

function calcBonus(distNm: number, type: StructureType): number {
  if (type === 'reef') {
    if (distNm < 0.1) return 25;
    if (distNm < 0.3) return 20;
  } else if (type === 'wreck') {
    if (distNm < 0.1) return 18;
    if (distNm < 0.3) return 14;
  } else if (type === 'obstruction') {
    if (distNm < 0.3) return 10;
  }
  return 0;
}

function extractFeatures(data: { features?: { geometry?: { x?: number; y?: number; rings?: number[][][] } }[] }, type: StructureType): StructureFeature[] {
  const feats: StructureFeature[] = [];
  (data.features ?? []).forEach(f => {
    if (!f.geometry) return;
    let lat: number | null = null;
    let lng: number | null = null;

    if (f.geometry.x != null && f.geometry.y != null) {
      // Point geometry
      lat = f.geometry.y;
      lng = f.geometry.x;
    } else if (f.geometry.rings?.length) {
      // Polygon — use centroid of first ring
      const ring = f.geometry.rings[0];
      if (ring.length) {
        lat = ring.reduce((s, pt) => s + pt[1], 0) / ring.length;
        lng = ring.reduce((s, pt) => s + pt[0], 0) / ring.length;
      }
    }

    if (lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
      feats.push({ lat, lng, type });
    }
  });
  return feats;
}

export function useMarineStructure(bbox: BBox | null): MarineStructureResult {
  const [features, setFeatures] = useState<StructureFeature[]>([]);
  const [loading, setLoading] = useState(false);

  const swLat = bbox?.sw.lat;
  const swLng = bbox?.sw.lng;
  const neLat = bbox?.ne.lat;
  const neLng = bbox?.ne.lng;

  useEffect(() => {
    if (swLat == null || swLng == null || neLat == null || neLng == null) {
      setFeatures([]);
      return;
    }

    setLoading(true);
    let cancelled = false;

    const bboxParam = `${swLng},${swLat},${neLng},${neLat}`;
    const base = 'https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer';
    const qs = `geometry=${encodeURIComponent(bboxParam)}&geometryType=esriGeometryEnvelope&inSR=4326&outFields=*&returnGeometry=true&f=json`;

    Promise.all(
      LAYER_CONFIG.map(({ layer, type }) =>
        fetch(`${base}/${layer}/query?${qs}`)
          .then(r => r.json())
          .then(data => extractFeatures(data, type))
          .catch((): StructureFeature[] => [])
      )
    ).then(results => {
      if (cancelled) return;
      setFeatures(results.flat());
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [swLat, swLng, neLat, neLng]);

  const getStructureBonusAt = useCallback((lat: number, lng: number): number => {
    if (features.length === 0) return 0;
    let best = 0;
    for (const feat of features) {
      const distNm = distanceMi({ lat, lng }, { lat: feat.lat, lng: feat.lng }) / NM_TO_MILES;
      const bonus = calcBonus(distNm, feat.type);
      if (bonus > best) best = bonus;
    }
    return Math.min(best, 25);
  }, [features]);

  return { getStructureBonusAt, loading };
}
