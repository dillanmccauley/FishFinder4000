import { useState, useEffect } from 'react';
import type { SpotCandidate } from '../types';
import type { FishingRegion } from '../data/regions';
import { distanceMi } from '../utils/geo';

/**
 * Fetches known artificial-reef locations within a region as ready-made spot
 * candidates:
 *  1. NOAA Digital Coast national artificial reef layer
 *  2. Best-effort: resolve NC DMF "Artificial Reef Material" hosted layer via
 *     the ArcGIS Online search API (per-drop material locations; harmlessly
 *     returns nothing outside NC)
 * Both fail silently — DEM-derived spots still work without them.
 */

const NOAA_REEFS_URL = 'https://coast.noaa.gov/arcgis/rest/services/Hosted/ArtificialReefs/FeatureServer/0';
const AGO_SEARCH = 'https://www.arcgis.com/sharing/rest/search';

// Per-region cache — reef locations are static
const cache = new Map<string, SpotCandidate[]>();

function bboxParams(region: FishingRegion): string {
  const { sw, ne } = region.bbox;
  // Pad the box a touch so nearshore ARs just outside still show
  const pad = 0.06;
  const geometry = `${sw.lng - pad},${sw.lat - pad},${ne.lng + pad},${ne.lat + pad}`;
  return (
    `geometry=${encodeURIComponent(geometry)}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=json`
  );
}

interface EsriFeature {
  geometry?: { x?: number; y?: number; rings?: number[][][] };
  attributes?: Record<string, unknown>;
}

function featureLatLng(f: EsriFeature): { lat: number; lng: number } | null {
  if (f.geometry?.x != null && f.geometry?.y != null) {
    return { lat: f.geometry.y, lng: f.geometry.x };
  }
  const ring = f.geometry?.rings?.[0];
  if (ring?.length) {
    return {
      lat: ring.reduce((s, p) => s + p[1], 0) / ring.length,
      lng: ring.reduce((s, p) => s + p[0], 0) / ring.length,
    };
  }
  return null;
}

function featureName(f: EsriFeature): string {
  const attrs = f.attributes ?? {};
  for (const key of Object.keys(attrs)) {
    const k = key.toLowerCase();
    if ((k.includes('name') || k === 'reef' || k.includes('site')) && typeof attrs[key] === 'string' && (attrs[key] as string).trim()) {
      return (attrs[key] as string).trim();
    }
  }
  return 'Artificial reef';
}

function toSpot(region: FishingRegion, lat: number, lng: number, name: string, idx: number): SpotCandidate {
  let nearestInlet = region.inlets[0];
  let nearestMi = Infinity;
  for (const inlet of region.inlets) {
    const d = distanceMi({ lat, lng }, inlet.loc);
    if (d < nearestMi) { nearestMi = d; nearestInlet = inlet; }
  }
  return {
    id: `${region.id}-reef-${idx}`,
    lat,
    lng,
    kind: 'reef',
    depthFt: 0,
    reliefFt: 0,
    structureScore: 95, // known deployed structure — always a top-tier target
    description: `${name} — deployed reef material · ${nearestMi.toFixed(1)} mi to ${nearestInlet.name}`,
  };
}

async function queryLayer(layerUrl: string, params: string): Promise<EsriFeature[]> {
  const res = await fetch(`${layerUrl}/query?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message ?? 'esri error');
  return data.features ?? [];
}

async function fetchReefs(region: FishingRegion): Promise<SpotCandidate[]> {
  const spots: SpotCandidate[] = [];
  const seen = new Set<string>();
  const params = bboxParams(region);

  const push = (lat: number, lng: number, name: string) => {
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    spots.push(toSpot(region, lat, lng, name, spots.length));
  };

  // 1. NOAA national reef layer
  try {
    const feats = await queryLayer(NOAA_REEFS_URL, params);
    feats.forEach(f => {
      const ll = featureLatLng(f);
      if (ll) push(ll.lat, ll.lng, featureName(f));
    });
  } catch { /* fall through */ }

  // 2. NC DMF reef material — resolve the hosted layer URL dynamically
  try {
    const q = encodeURIComponent('title:"DMF - Artificial Reef Material" AND type:"Feature Service"');
    const res = await fetch(`${AGO_SEARCH}?q=${q}&num=5&f=json`);
    const data = await res.json();
    const item = (data.results ?? []).find((r: { url?: string }) => typeof r.url === 'string' && r.url.includes('/FeatureServer'));
    if (item?.url) {
      const feats = await queryLayer(`${item.url}/0`, params);
      feats.forEach(f => {
        const ll = featureLatLng(f);
        if (ll) push(ll.lat, ll.lng, featureName(f));
      });
    }
  } catch { /* best effort */ }

  return spots;
}

export function useRegionStructures(region: FishingRegion | null): { reefSpots: SpotCandidate[]; loading: boolean } {
  const [reefSpots, setReefSpots] = useState<SpotCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!region) {
      setReefSpots([]);
      return;
    }
    const cached = cache.get(region.id);
    if (cached) {
      setReefSpots(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);

    fetchReefs(region)
      .then(spots => {
        cache.set(region.id, spots);
        if (!cancelled) { setReefSpots(spots); setLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setReefSpots([]); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [region]);

  return { reefSpots, loading };
}
