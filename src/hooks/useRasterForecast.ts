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
  calcDepthScore,
} from '../utils/scoring';

const GRID_STEP = 0.02;   // 0.02° ≈ 2km — scoring resolution
const FETCH_STEP = 0.1;   // 0.1° ≈ 11km — Open-Meteo native resolution
const MAX_DEGREES = 0.5;  // max bbox side (0.5° × 0.5° = 25 fetch pts, 625 score pts)
const CONCURRENCY = 8;
const METERS_TO_FEET = 3.28084;

const NE_SPECIES_IDS = ['striped-bass', 'bluefish', 'summer-flounder', 'weakfish'];
const SE_SPECIES_IDS = ['red-drum', 'spotted-seatrout', 'flounder', 'snook', 'sheepshead'];

function speciesForLat(lat: number) {
  const ids = lat >= 37 ? NE_SPECIES_IDS : SE_SPECIES_IDS;
  return SPECIES.filter(s => ids.includes(s.id));
}

function generateFetchGrid(bbox: BBox): LatLng[] {
  const pts: LatLng[] = [];
  const swLat = Math.min(bbox.sw.lat, bbox.ne.lat);
  const neLat = Math.max(bbox.sw.lat, bbox.ne.lat);
  const swLng = Math.min(bbox.sw.lng, bbox.ne.lng);
  const neLng = Math.max(bbox.sw.lng, bbox.ne.lng);
  const maxLat = Math.min(neLat, swLat + MAX_DEGREES);
  const maxLng = Math.min(neLng, swLng + MAX_DEGREES);

  for (let lat = swLat; lat <= maxLat + 0.001; lat = Math.round((lat + FETCH_STEP) * 100) / 100) {
    for (let lng = swLng; lng <= maxLng + 0.001; lng = Math.round((lng + FETCH_STEP) * 100) / 100) {
      pts.push({ lat: parseFloat(lat.toFixed(2)), lng: parseFloat(lng.toFixed(2)) });
    }
  }
  return pts;
}

function generateScoringGrid(bbox: BBox): LatLng[] {
  const pts: LatLng[] = [];
  const swLat = Math.min(bbox.sw.lat, bbox.ne.lat);
  const neLat = Math.max(bbox.sw.lat, bbox.ne.lat);
  const swLng = Math.min(bbox.sw.lng, bbox.ne.lng);
  const neLng = Math.max(bbox.sw.lng, bbox.ne.lng);
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
  fetchLoc: LatLng | null,
  getConditionsAt: (loc: LatLng, date: Date) => MarineConditions | null,
  getTideAt: (stationId: string, date: Date) => TideInfo | null,
  targetDate: Date,
  classifyCell: (lat: number, lng: number) => string | null,
  getSatSSTAt: (lat: number, lng: number) => number | null,
  getStructureBonusAt: (lat: number, lng: number) => number,
  getDepthAt: (lat: number, lng: number) => number | null,
): number | null {
  if (!fetchLoc) return null;

  // Skip land and dry/very-shallow cells when bathymetry is available
  const cellClass = classifyCell(pt.lat, pt.lng);
  if (cellClass === 'land' || cellClass === 'too-shallow') return null;

  // Conditions come from the nearest loaded 0.1° fetch grid point
  let conditions = getConditionsAt(fetchLoc, targetDate);
  if (!conditions) return null;

  // Override Open-Meteo SST with higher-res satellite SST when available
  const satSSTCelsius = getSatSSTAt(pt.lat, pt.lng);
  if (satSSTCelsius !== null) {
    const satSSTF = satSSTCelsius * 9 / 5 + 32;
    conditions = { ...conditions, waterTempF: satSSTF };
  }

  const prevDate = addHours(targetDate, -3);
  const prevConditions = getConditionsAt(fetchLoc, prevDate);
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

  // Depth score from ETOPO1 bathymetry (negative m = below sea level → positive feet)
  const depthM = getDepthAt(pt.lat, pt.lng);
  const depthFt = depthM != null ? Math.abs(depthM) * METERS_TO_FEET : null;
  const depthScore = depthFt != null ? calcDepthScore(depthFt, species) : undefined;

  const composite = calcZoneScore({
    marineScore, pressureScore, seasonScore, tideScore,
    moonScore, uvScore, clarityScore, depthScore,
  });

  // Structure bonus applied additively after composite clamp
  const structureBonus = getStructureBonusAt(pt.lat, pt.lng);
  return Math.min(100, composite + structureBonus);
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
  _nowDate: Date,
  classifyCell: (lat: number, lng: number) => string | null,
  getSatSSTAt: (lat: number, lng: number) => number | null,
  getStructureBonusAt: (lat: number, lng: number) => number,
  getDepthAt: (lat: number, lng: number) => number | null,
): RasterForecastResult {
  const [loadedSet, setLoadedSet] = useState<Set<string>>(new Set());
  const [pointsLoaded, setPointsLoaded] = useState(0);
  const [pointsFailed, setPointsFailed] = useState(0);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // Coarse grid for Open-Meteo fetches (25 pts max)
  const fetchLocs = useMemo(() => (bbox ? generateFetchGrid(bbox) : []), [bbox]);
  // Fine grid for scoring (625 pts max)
  const scoringLocs = useMemo(() => (bbox ? generateScoringGrid(bbox) : []), [bbox]);

  // Fetch Open-Meteo data at 0.1° resolution when bbox changes
  useEffect(() => {
    if (!fetchLocs.length) {
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

    const tasks = fetchLocs.map(pt => async () => {
      const ok = await fetchGridPoint(pt.lat, pt.lng);
      if (ctrl.cancelled) return;
      if (ok) {
        newLoaded.add(`${pt.lat.toFixed(2)},${pt.lng.toFixed(2)}`);
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
  }, [fetchLocs]);

  // Only the fetch points that actually loaded — used to anchor each scoring cell
  const loadedFetchPoints = useMemo<LatLng[]>(
    () => fetchLocs.filter(p => loadedSet.has(`${p.lat.toFixed(2)},${p.lng.toFixed(2)}`)),
    [fetchLocs, loadedSet],
  );

  // Score 0.02° grid from cached conditions — re-runs on targetDate or data changes
  const gridPoints = useMemo<GridPoint[]>(() => {
    if (!scoringLocs.length || !loadedFetchPoints.length) return [];
    const pts: GridPoint[] = [];
    scoringLocs.forEach(pt => {
      // Anchor each fine scoring point to its nearest LOADED coarse fetch point.
      // (The fetch grid is anchored at the bbox SW corner, so it is not aligned
      // to absolute 0.1° multiples — find the nearest by distance, not rounding.)
      let nearest: LatLng | null = null;
      let bestDist = Infinity;
      for (const fp of loadedFetchPoints) {
        const d = (fp.lat - pt.lat) ** 2 + (fp.lng - pt.lng) ** 2;
        if (d < bestDist) { bestDist = d; nearest = fp; }
      }
      const score = scorePoint(
        pt, nearest,
        getConditionsAt, getTideAt, targetDate,
        classifyCell, getSatSSTAt, getStructureBonusAt, getDepthAt,
      );
      if (score !== null) {
        pts.push({ lat: pt.lat, lng: pt.lng, score });
      }
    });
    return pts;
  // nowDate omitted from deps: it doesn't affect scoring, only prevents stale display
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoringLocs, loadedFetchPoints, targetDate, getConditionsAt, getTideAt, classifyCell, getSatSSTAt, getStructureBonusAt, getDepthAt]);

  return {
    gridPoints,
    loading,
    pointsLoaded,
    pointsTotal: fetchLocs.length,
    pointsFailed,
  };
}
