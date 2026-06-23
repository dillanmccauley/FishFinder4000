import { useMemo } from 'react';
import type { ZoneScore, MarineConditions, TideInfo, Hotspot } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { SPECIES_MAP } from '../data/species';
import { addHours } from 'date-fns';
import {
  calcMoonScore,
  calcMarineScore,
  calcSeasonScore,
  calcTideScore,
  calcZoneScore,
  calcClarityScore,
  calcAlgaePenalty,
  calcPressureScore,
  calcUVScore,
  calcBaitScore,
  scoreToGrade,
  calcConfidence,
} from '../utils/scoring';

interface Params {
  targetDate: Date;
  getConditionsAt: (location: { lat: number; lng: number }, date: Date) => MarineConditions | null;
  getTideAt: (stationId: string, date: Date) => TideInfo | null;
  nowDate: Date;
  customHotspots?: Hotspot[];
}

export function useZoneScores({
  targetDate,
  getConditionsAt,
  getTideAt,
  nowDate,
  customHotspots = [],
}: Params): Map<string, ZoneScore> {
  return useMemo(() => {
    const map = new Map<string, ZoneScore>();
    const forecastHoursAhead = Math.max(0, (targetDate.getTime() - nowDate.getTime()) / 3600000);
    const isForecast = forecastHoursAhead > 0;
    const allHotspots = [...HOTSPOTS, ...customHotspots];

    const { score: moonScore, phase: moonPhase, phaseName: moonPhaseName, phaseEmoji: moonPhaseEmoji } =
      calcMoonScore(targetDate);

    allHotspots.forEach((hotspot) => {
      const species = hotspot.activeSpeciesIds.map(id => SPECIES_MAP.get(id)!).filter(Boolean);
      const conditions = getConditionsAt(hotspot.location, targetDate);
      const prevConditions = getConditionsAt(hotspot.location, addHours(targetDate, -3));
      const tide = getTideAt(hotspot.tideStationId, targetDate);

      const marineScore = calcMarineScore(conditions, species);
      const pressureScore = calcPressureScore(conditions, prevConditions);
      const baseSeasonScore = calcSeasonScore(species, targetDate, conditions?.waterTempF);
      const isNortheast = hotspot.location.lat >= 37;
      const baitScore = calcBaitScore(targetDate, isNortheast);
      const seasonScore = baseSeasonScore * 0.75 + baitScore * 0.25;
      const tideScore = calcTideScore(tide, species);
      const uvScore = calcUVScore(conditions, species);
      const clarityScore = calcClarityScore(conditions, hotspot.depthRangeFt, targetDate);
      const algaePenalty = calcAlgaePenalty(conditions, hotspot.depthRangeFt, targetDate);
      const pressureDelta = conditions && prevConditions
        ? conditions.pressureHpa - prevConditions.pressureHpa : 0;
      const total = calcZoneScore({ marineScore, pressureScore, seasonScore, tideScore, moonScore, uvScore, clarityScore });

      map.set(hotspot.id, {
        hotspotId: hotspot.id,
        total,
        grade: scoreToGrade(total),
        marineScore,
        pressureScore,
        seasonScore,
        tideScore,
        moonScore,
        uvScore,
        clarityScore,
        algaePenalty,
        baitScore,
        pressureDelta,
        moonPhase,
        moonPhaseName,
        moonPhaseEmoji,
        activeSpecies: species,
        conditions,
        tide,
        confidence: calcConfidence(forecastHoursAhead),
        isForecast,
        forecastHoursAhead,
      });
    });

    return map;
  }, [targetDate, getConditionsAt, getTideAt, nowDate, customHotspots]);
}
