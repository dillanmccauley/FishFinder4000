import { useMemo } from 'react';
import { addHours, startOfHour } from 'date-fns';
import type { Grade, HourlyScore, MarineConditions, Species } from '../types';
import { SPECIES } from '../data/species';
import { OIB_CENTER, OIB_TIDE_STATION, OIB_SPECIES_IDS, OIB_PROFILES, type OIBSpeciesProfile } from '../data/oibConfig';
import { useMarineData } from './useMarineData';
import { useTideData } from './useTideData';
import { useOIBBuoy } from './useOIBBuoy';
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
  profile: OIBSpeciesProfile;
  scoreNow: number;
  gradeNow: Grade;
  hourlyScores: HourlyScore[];
  bestWindow: BestWindow | null;
  /** Factor scores at the scrubber time — panel picks what to surface */
  factorsNow: { label: string; score: number; weight: number }[];
}

export interface OIBForecastResult {
  outlooks: SpeciesOutlook[];
  loading: boolean;
  /** Effective water temp used for scoring (buoy-corrected), °F */
  waterTempNowF: number | null;
  /** °F correction applied to modeled SST from the 41024 buoy reading */
  buoyBiasF: number;
}

/**
 * Species in sheltered ICW water barely feel ocean waves; wind matters less too.
 * Nearshore species get raw ocean conditions.
 */
function zoneAdjust(c: MarineConditions, zone: OIBSpeciesProfile['zone']): MarineConditions {
  if (zone === 'nearshore') return c;
  const waveFactor = zone === 'icw' ? 0.15 : 0.5;
  const windFactor = zone === 'icw' ? 0.7 : 0.85;
  return { ...c, waveHeightFt: c.waveHeightFt * waveFactor, windSpeedMph: c.windSpeedMph * windFactor };
}

export function useOIBForecast(enabled: boolean, targetDate: Date, nowDate: Date): OIBForecastResult {
  // Conditions for the OIB center point (shared module CACHE — cheap)
  const { getConditionsAt, loading: marineLoading } = useMarineData(OIB_CENTER);
  const { getTideAt, loading: tideLoading } = useTideData(enabled ? [OIB_TIDE_STATION] : []);
  const buoy = useOIBBuoy(enabled);

  const outlooks = useMemo<SpeciesOutlook[]>(() => {
    if (!enabled) return [];

    // Bias-correct modeled SST with the measured buoy temp (clamped ±10 °F)
    const modelNow = getConditionsAt(OIB_CENTER, nowDate);
    let biasF = 0;
    if (buoy.waterTempF != null && modelNow) {
      biasF = Math.max(-10, Math.min(10, buoy.waterTempF - modelNow.waterTempF));
    }

    const speciesList = OIB_SPECIES_IDS
      .map(id => SPECIES.find(s => s.id === id))
      .filter((s): s is Species => !!s);

    const result: SpeciesOutlook[] = speciesList.map(sp => {
      const profile = OIB_PROFILES[sp.id];
      const hourly: HourlyScore[] = [];

      for (let h = -12; h < 60; h++) {
        const t = startOfHour(addHours(nowDate, h));
        const raw = getConditionsAt(OIB_CENTER, t);
        const rawPrev = getConditionsAt(OIB_CENTER, addHours(t, -3));
        const conditions = raw ? zoneAdjust({ ...raw, waterTempF: raw.waterTempF + biasF }, profile.zone) : null;
        const prevConditions = rawPrev ? { ...rawPrev, waterTempF: rawPrev.waterTempF + biasF } : null;
        const tide = getTideAt(OIB_TIDE_STATION, t);

        const { score: moonScore } = calcMoonScore(t);
        const marineScore = calcMarineScore(conditions, [sp]);
        const pressureScore = calcPressureScore(conditions, prevConditions);
        const baseSeasonScore = calcSeasonScore([sp], t, conditions?.waterTempF);
        const baitScore = calcBaitScore(t, false);
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
  }, [enabled, targetDate, nowDate, getConditionsAt, getTideAt, buoy.waterTempF, marineLoading, tideLoading]);

  const { effectiveTempNow, buoyBiasF } = useMemo(() => {
    if (!enabled) return { effectiveTempNow: null, buoyBiasF: 0 };
    const c = getConditionsAt(OIB_CENTER, nowDate);
    if (buoy.waterTempF != null) {
      const bias = c ? Math.max(-10, Math.min(10, buoy.waterTempF - c.waterTempF)) : 0;
      return { effectiveTempNow: buoy.waterTempF, buoyBiasF: bias };
    }
    return { effectiveTempNow: c ? c.waterTempF : null, buoyBiasF: 0 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, buoy.waterTempF, marineLoading, nowDate]);

  return {
    outlooks,
    loading: marineLoading || tideLoading || buoy.loading,
    waterTempNowF: effectiveTempNow,
    buoyBiasF,
  };
}
