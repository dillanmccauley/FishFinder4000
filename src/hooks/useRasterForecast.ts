import { useState, useEffect, useMemo, useRef } from 'react';
import { addHours } from 'date-fns';
import type { BBox, GridPoint, LatLng, MarineConditions, TideInfo } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { SPECIES } from '../data/species';
import { nearestHotspot } from '../utils/geo';
import { fetchGridPoint } from './useMarineData';
import {
  calcMoonScore,
  calcMarineScore,
  calcSeasonScore,
  calcTideScore,
  calcZoneScore,
  calcClarityScore,
  calcPressureScore,
  calcUVScore,
  calcBaitScore,
} from '../utils/scoring';

const GRID_STEP = 0.1;
const MAX_DEGREES = 1.0;
const CONCURRENCY = 8;

const NE_SPECIES_IDS = ['striped-bass', 'bluefish', 'summer-flounder', 'weakfish'];
const SE_SPECIES_IDS = ['red-drum', 'spotted-seatrout', 'flounder', 'snook', 'sheepshead'];

function speciesForLat(lat: number) {
  const ids = lat >= 37 ? NE_SPECIES_IDS : SE_SPECIES_IDS;
  return SPECIES.filter(s => ids.includes(s.id));
}

function generateGrid(bbox: BBox): LatLng[] {
  const pts: LatLng[] = [];
  const swLat = Math.min(bbox.sw.lat, bbox.ne.lat);
  const neLat = Math.max(bbox.sw.lat, bbox.ne.lat);
  const swLng = Math.min(bbox.sw.lng, bbox.ne.lng);
  const neLng = Math.max(bbox.sw.lng, bbox.ne.lng);

  // Clamp to max size
  const maxLat = Math.min(neLat, swLat + MAX_DEGREES);
  const maxLng = Math.min(neLng, swLng + MAX_DEGREES);

  for (let lat = swLat; lat <= maxLat + 0.001; lat = Math.round((lat + GRID_STEP) * 1000) / 1000) {
    for (let lng = swLng; lng <= maxLng + 0.001; lng = Math.round((lng + GRID_STEP) * 1000) / 1000) {
      pts.push({ lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lng.toFixed(4)) });
    }
  }
  return pts;
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onProgress: (done: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
      onProgress(++done);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function scorePoint(
  pt: LatLng,
  loaded: boolean,
  getConditionsAt: (loc: LatLng, date: Date) => MarineConditions | null,
  getTideAt: (stationId: string, date: Date) => TideInfo | null,
  targetDate: Date,
): number | null {
  if (!loaded) return null;
  const conditions = getConditionsAt(pt, targetDate);
  if (!conditions) return null;

  const prevDate = addHours(targetDate, -3);
  const prevConditions = getConditionsAt(pt, prevDate);
  const species = speciesForLat(pt.lat);
  const tideStationId = nearestHotspot(pt, HOTSPOTS).tideStationId;
  const tide = getTideAt(tideStationId, targetDate);
  const isNortheast = pt.lat >= 37;

  const { score: moonScore } = calcMoonScore(targetDate);
  const marineScore = calcMarineScore(conditions, species);
  const pressureScore = calcPressureScore(conditions, prevConditions);
  const baseSeasonScore = calcSeasonScore(species, targetDate, conditions.waterTempF);
  const baitScore = calcBaitScore(targetDate, isNortheast);
  const seasonScore = baseSeasonScore * 0.75 + baitScore * 0.25;
  const tideScore = calcTideScore(tide, species);
  const uvScore = calcUVScore(conditions, species);
  const clarityScore = calcClarityScore(conditions, undefined, targetDate);

  return calcZoneScore({ marineScore, pressureScore, seasonScore, tideScore, moonScore, uvScore, clarityScore });
}

interface RasterForecastResult {
  gridPoints: GridPoint[];
  loading: boolean;
  pointsLoaded: number;
  pointsTotal: number;
  pointsFailed: number;
}

export function useRasterForecast(
  bbox: BBox | null,
  targetDate: Date,
  getConditionsAt: (loc: LatLng, date: Date) => MarineConditions | null,
  getTideAt: (stationId: string, date: Date) => TideInfo | null,
  nowDate: Date,
): RasterForecastResult {
  const [loadedSet, setLoadedSet] = useState<Set<string>>(new Set());
  const [pointsLoaded, setPointsLoaded] = useState(0);
  const [pointsFailed, setPointsFailed] = useState(0);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const gridLocs = useMemo(() => (bbox ? generateGrid(bbox) : []), [bbox]);

  // Fetch all grid points when bbox changes
  useEffect(() => {
    if (!gridLocs.length) {
      setLoadedSet(new Set());
      setPointsLoaded(0);
      setLoading(false);
      return;
    }

    const ctrl = { cancelled: false };
    abortRef.current.cancelled = true;
    abortRef.current = ctrl;

    setLoadedSet(new Set());
    setPointsLoaded(0);
    setPointsFailed(0);
    setLoading(true);

    const newLoaded = new Set<string>();
    let done = 0;
    let failed = 0;

    const tasks = gridLocs.map(pt => async () => {
      const ok = await fetchGridPoint(pt.lat, pt.lng);
      if (ctrl.cancelled) return;
      if (ok) {
        newLoaded.add(`${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`);
      } else {
        failed++;
        setPointsFailed(failed);
      }
      done++;
      setPointsLoaded(done);
    });

    runWithConcurrency(tasks, CONCURRENCY, () => {}).then(() => {
      if (!ctrl.cancelled) {
        setLoadedSet(new Set(newLoaded));
        setLoading(false);
      }
    });
  }, [gridLocs]);

  // Re-score on targetDate change (reads from cache, no fetches)
  const gridPoints = useMemo<GridPoint[]>(() => {
    if (!gridLocs.length || !loadedSet.size) return [];
    const pts: GridPoint[] = [];
    gridLocs.forEach(pt => {
      const key = `${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
      const loaded = loadedSet.has(key);
      const score = scorePoint(pt, loaded, getConditionsAt, getTideAt, targetDate);
      if (score !== null) {
        pts.push({ lat: pt.lat, lng: pt.lng, score });
      }
    });
    return pts;
  }, [gridLocs, loadedSet, targetDate, getConditionsAt, getTideAt, nowDate]);

  return { gridPoints, loading, pointsLoaded, pointsTotal: gridLocs.length, pointsFailed };
}
