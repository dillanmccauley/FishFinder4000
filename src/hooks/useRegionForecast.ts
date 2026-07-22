import { useMemo } from 'react';
import { addHours, startOfHour } from 'date-fns';
import type { Grade, HourlyScore, MarineConditions, Species } from '../types';
import { SPECIES } from '../data/species';
import { SPECIES_PROFILES, type FishingRegion, type RegionSpeciesProfile } from '../data/regions';
import { useMarineData } from './useMarineData';
import { useTideData } from './useTideData';
import { useRegionBuoy } from './useRegionBuoy';
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
  scoreToGrade,
  findBestWindow,
  type BestWindow,
} from '../utils/scoring';

export interface SpeciesOutlook {
  species: Species;
  profile: RegionSpeciesProfile;
  scoreNow: number;
  gradeNow: Grade;
  hourlyScores: HourlyScore[];
  bestWindow: BestWindow | null;
  /** Factor scores at the scrubber time — panel picks what to surface */
  factorsNow: { label: string; score: number; weight: number }[];
}

export interface RegionForecastResult {
  outlooks: SpeciesOutlook[];
  loading: boolean;
  /** Effective water temp used for scoring (buoy-corrected), °F */
  waterTempNowF: number | null;
  /** °F correction applied to modeled SST from the discovered buoy */
  buoyBiasF: number;
  /** Buoy station id the temp came from (display) */
  buoyStation: string | null;
}

/**
 * Species in sheltered ICW water barely feel ocean waves; wind matters less too.
 * Nearshore species get raw ocean conditions.
 */
function zoneAdjust(c: MarineConditions, zone: RegionSpeciesProfile['zone']): MarineConditions {
  if (zone === 'nearshore') return c;
  const waveFactor = zone === 'icw' ? 0.15 : 0.5;
  const windFactor = zone === 'icw' ? 0.7 : 0.85;
  return { ...c, waveHeightFt: c.waveHeightFt * waveFactor, windSpeedMph: c.windSpeedMph * windFactor };
}

const NO_STATIONS: string[] = [];

export function useRegionForecast(
  region: FishingRegion | null,
  targetDate: Date,
  nowDate: Date,
): RegionForecastResult {
  // Conditions for the region center (shared module CACHE — cheap). When no
  // region is active we still need a stable location for the hook contract;
  // the first region's center serves and its data is reused on activation.
  const fetchCenter = region?.center ?? { lat: 33.894, lng: -78.427 };
  const { getConditionsAt, loading: marineLoading } = useMarineData(fetchCenter);
  const { getTideAt, loading: tideLoading } = useTideData(region ? [region.tideStationId] : NO_STATIONS);
  const buoy = useRegionBuoy(region);

  const outlooks = useMemo<SpeciesOutlook[]>(() => {
    if (!region) return [];

    // Bias-correct modeled SST with the measured buoy temp (clamped ±10 °F)
    const modelNow = getConditionsAt(region.center, nowDate);
    let biasF = 0;
    if (buoy.waterTempF != null && modelNow) {
      biasF = Math.max(-10, Math.min(10, buoy.waterTempF - modelNow.waterTempF));
    }

    const speciesList = region.speciesIds
      .map(id => SPECIES.find(s => s.id === id))
      .filter((s): s is Species => !!s);

    const result: SpeciesOutlook[] = speciesList.map(sp => {
      const profile = SPECIES_PROFILES[sp.id];
      const hourly: HourlyScore[] = [];

      for (let h = -12; h < 60; h++) {
        const t = startOfHour(addHours(nowDate, h));
        const raw = getConditionsAt(region.center, t);
        const rawPrev = getConditionsAt(region.center, addHours(t, -3));
        const conditions = raw ? zoneAdjust({ ...raw, waterTempF: raw.waterTempF + biasF }, profile.zone) : null;
        const prevConditions = rawPrev ? { ...rawPrev, waterTempF: rawPrev.waterTempF + biasF } : null;
        const tide = getTideAt(region.tideStationId, t);

        const { score: moonScore } = calcMoonScore(t);
        const marineScore = calcMarineScore(conditions, [sp]);
        const pressureScore = calcPressureScore(conditions, prevConditions);
        const baseSeasonScore = calcSeasonScore([sp], t, conditions?.waterTempF);
        const baitScore = calcBaitScore(t, region.center.lat >= 37);
        const seasonScore = baseSeasonScore * 0.75 + baitScore * 0.25;
        const tideScore = calcTideScore(tide, [sp]);
        const uvScore = calcUVScore(conditions, [sp]);
        const clarityScore = calcClarityScore(conditions, sp.depthRangeFt, t);
        const total = calcZoneScore({ marineScore, pressureScore, seasonScore, tideScore, moonScore, uvScore, clarityScore });

        hourly.push({
          time: t,
          total,
          grade: scoreToGrade(total),
          marineScore,
          seasonScore,
          tideScore,
          moonScore,
          pressureScore,
          uvScore,
          clarityScore,
          conditions,
        });
      }

      // Score at the scrubber's target time
      const targetMs = startOfHour(targetDate).getTime();
      let nowEntry = hourly[0];
      let bestDiff = Infinity;
      for (const e of hourly) {
        const d = Math.abs(e.time.getTime() - targetMs);
        if (d < bestDiff) { bestDiff = d; nowEntry = e; }
      }

      const factorsNow = [
        { label: 'Season', score: nowEntry.seasonScore, weight: 0.25 },
        { label: 'Wind/Waves', score: nowEntry.marineScore, weight: 0.28 },
        { label: 'Tide', score: nowEntry.tideScore, weight: 0.15 },
        { label: 'Pressure', score: nowEntry.pressureScore, weight: 0.12 },
        { label: 'Moon', score: nowEntry.moonScore, weight: 0.08 },
        { label: 'UV', score: nowEntry.uvScore, weight: 0.07 },
        { label: 'Clarity', score: nowEntry.clarityScore, weight: 0.05 },
      ];

      return {
        species: sp,
        profile,
        scoreNow: Math.round(nowEntry.total),
        gradeNow: nowEntry.grade,
        hourlyScores: hourly,
        bestWindow: findBestWindow(hourly),
        factorsNow,
      };
    });

    return result.sort((a, b) => b.scoreNow - a.scoreNow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, targetDate, nowDate, getConditionsAt, getTideAt, buoy.waterTempF, marineLoading, tideLoading]);

  const { effectiveTempNow, buoyBiasF } = useMemo(() => {
    if (!region) return { effectiveTempNow: null, buoyBiasF: 0 };
    const c = getConditionsAt(region.center, nowDate);
    if (buoy.waterTempF != null) {
      const bias = c ? Math.max(-10, Math.min(10, buoy.waterTempF - c.waterTempF)) : 0;
      return { effectiveTempNow: buoy.waterTempF, buoyBiasF: bias };
    }
    return { effectiveTempNow: c ? c.waterTempF : null, buoyBiasF: 0 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, buoy.waterTempF, marineLoading, nowDate]);

  return {
    outlooks,
    loading: marineLoading || tideLoading || buoy.loading,
    waterTempNowF: effectiveTempNow,
    buoyBiasF,
    buoyStation: buoy.tempStation,
  };
}
