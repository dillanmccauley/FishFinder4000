import { useMemo } from 'react';
import type { ZoneScore, MarineConditions, TideInfo, BiteReport } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { SPECIES_MAP } from '../data/species';
import {
  calcBiteScore,
  calcMarineScore,
  calcSeasonScore,
  tideMultiplier,
  calcZoneScore,
  scoreToGrade,
  calcConfidence,
} from '../utils/scoring';

interface Params {
  targetDate: Date;
  getConditionsAt: (location: { lat: number; lng: number }, date: Date) => MarineConditions | null;
  getTideAt: (stationId: string, date: Date) => TideInfo | null;
  biteReports: BiteReport[];
  nowDate: Date;
}

export function useZoneScores({
  targetDate,
  getConditionsAt,
  getTideAt,
  biteReports,
  nowDate,
}: Params): Map<string, ZoneScore> {
  return useMemo(() => {
    const map = new Map<string, ZoneScore>();
    const forecastHoursAhead = Math.max(0, (targetDate.getTime() - nowDate.getTime()) / 3600000);
    const isForecast = forecastHoursAhead > 0;

    HOTSPOTS.forEach((hotspot) => {
      const species = hotspot.activeSpeciesIds.map(id => SPECIES_MAP.get(id)!).filter(Boolean);
      const conditions = getConditionsAt(hotspot.location, targetDate);
      const tide = getTideAt(hotspot.tideStationId, targetDate);
      const hotspotReports = biteReports.filter(r => r.hotspotId === hotspot.id);

      const biteScore = isForecast
        ? calcBiteScore(hotspotReports, targetDate) * 0.7 // reduce bite weight for future
        : calcBiteScore(hotspotReports, targetDate);

      const marineScore = calcMarineScore(conditions, species);
      const seasonScore = calcSeasonScore(species, targetDate);
      const tm = tideMultiplier(tide, species);
      const total = calcZoneScore({ biteScore, marineScore, seasonScore, tideMultiplier: tm });

      const sortedReports = [...hotspotReports].sort(
        (a, b) => Math.abs(a.timestamp.getTime() - targetDate.getTime()) -
                   Math.abs(b.timestamp.getTime() - targetDate.getTime())
      );

      map.set(hotspot.id, {
        hotspotId: hotspot.id,
        total,
        grade: scoreToGrade(total),
        biteScore,
        marineScore,
        seasonScore,
        activeSpecies: species,
        conditions,
        tide,
        topBiteReport: sortedReports[0] ?? null,
        confidence: calcConfidence(forecastHoursAhead),
        isForecast,
        forecastHoursAhead,
      });
    });

    return map;
  }, [targetDate, getConditionsAt, getTideAt, biteReports, nowDate]);
}
